import { addDays, studentWork, formatDate, shortDate, validDate } from './fixtures.js';
import { courseHasPreview, courseHref, courseIcon, hasOnlineHomework } from './courses.js';
import { escape, icon, iconTile } from './layout.js';
import { newSubmissionKey, validSubmissionKey } from './services.js';

const types = {
  homework: { label: 'Домашнее задание', action: 'Сдать до', icon: 'file' },
  test: { label: 'Контрольная', action: 'Начало в', icon: 'clock' },
  exam: { label: 'Сессия', action: 'Начало в', icon: 'calendar' },
  personal: { label: 'Личное', action: 'Напомнить к', icon: 'calendar' }
};
const previewLimit = 3;

export function readReminder(form, student) {
  const reminder = {
    title: (form.get('title') || '').trim(),
    courseId: form.get('course') || '',
    day: form.get('day') || '',
    time: form.get('time') || '',
    link: (form.get('link') || '').trim(),
    key: form.get('submission')
  };
  if (!reminder.title || reminder.title.length > 100 ||
      !student.subjects.some((course) => course.id === reminder.courseId) ||
      !validDate(reminder.day) || reminder.day < '2000-01-01' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time) ||
      !validSubmissionKey(reminder.key)) {
    return { reminder, error: 'Проверьте название, курс, дату и время.' };
  }
  if (reminder.link) {
    const url = URL.parse(reminder.link);
    if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        reminder.link.length > 1000) {
      return { reminder, error: 'Укажите ссылку с https:// или http://.' };
    }
    reminder.link = url.href;
  }
  return { reminder };
}

function activityDate(day, today) {
  if (day === today) return 'Сегодня';
  if (day === addDays(today, 1)) return 'Завтра';
  return shortDate(day);
}

export function activitiesFor(student, today, reminders = []) {
  const assigned = studentWork(student, today).map((activity) => ({
    ...activity, day: addDays(today, activity.offset),
    href: hasOnlineHomework(activity) || courseHasPreview(student, activity.courseId)
      ? courseHref(activity.courseId, activity.kind === 'test' ? 'tests' : 'assignments', activity.id)
      : courseHref(activity.courseId)
  }));
  const exams = student.exams.filter(([, , offset]) => offset >= 0)
    .map(([name, title, offset, time, room]) => ({
      title, kind: 'exam', day: addDays(today, offset), time, room,
      courseId: student.subjects.find((course) => course.name === name).id,
      href: '/study/' + student.id + '/session#upcoming'
    }));
  const personal = reminders.map((row) => ({
    id: row.id, title: row.title, courseId: row.course_id, day: row.due_on,
    time: row.due_at, kind: 'personal', href: row.link, done: Boolean(row.done)
  }));
  return [...assigned, ...exams, ...personal].sort((first, second) =>
    (first.day + first.time).localeCompare(second.day + second.time)
  );
}

function markForm(activity, csrf, restore = false) {
  const label = restore ? 'Вернуть в ближайшие активности' : 'Отметить выполненным';
  return `<form class="home-mark" method="post" action="/reminders/${escape(activity.id)}/${restore ? 'restore' : 'done'}">
    <input type="hidden" name="csrf" value="${escape(csrf)}">
    <button type="submit" title="${label}" aria-label="${label}: ${escape(activity.title)}">
      ${icon(restore ? 'back' : 'check')}</button>
  </form>`;
}

function activityRow(activity, course, today, csrf) {
  const type = types[activity.kind];
  const title = activity.href
    ? `<a href="${escape(activity.href)}"${activity.kind === 'personal' ? ' rel="noreferrer"' : ''}>${escape(activity.title)}${icon('chevron')}</a>`
    : escape(activity.title);
  return `<li class="home-activity${activity.kind === 'test' ? ' home-activity-test' : ''}">
    <span class="home-activity-icon">${icon(type.icon)}</span>
    <div class="home-activity-copy">
      <h3>${title}</h3>
      <p>${type.label} · ${escape(course.name)}${activity.external ? ' · Вне LMS' : ''}${activity.room ? ' · ауд. ' + escape(activity.room) : ''}</p>
    </div>
    <div class="home-activity-date">
      <strong>${activity.day < today ? 'Срок прошёл' : activityDate(activity.day, today)}</strong>
      <span>${activity.day < today ? shortDate(activity.day) + ' · ' : type.action + ' '}<time datetime="${activity.day}T${activity.time}+03:00">${activity.time}</time> МСК</span>
    </div>
    ${activity.kind === 'personal' ? markForm(activity, csrf) : ''}
  </li>`;
}

function courseCard(course) {
  const id = 'course-' + course.id;
  const label = `<span class="home-course-symbol">${courseIcon(course.id)}</span>
    <span class="home-course-name">${escape(course.name)}</span>`;
  return `<a class="home-course home-course-tile" id="${id}" href="${courseHref(course.id)}">${label}
    <span class="home-course-chevron">${icon('chevron')}</span></a>`;
}

function reminderForm(student, csrf, today, values, error) {
  const { courseId, title, day, time, link } = values;
  return `<section id="personal-form" class="home-reminder" aria-labelledby="personal-title">
    <div class="home-form-heading"><h3 id="personal-title">Личный дедлайн</h3>
      <a class="home-link" href="/#activity-heading">Закрыть</a></div>
    ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
    <form method="post" action="/reminders">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      <input type="hidden" name="submission" value="${newSubmissionKey()}">
      <label>Название <input name="title" maxlength="100" value="${escape(title || '')}" required></label>
      <label>Курс <select name="course" required>
        <option value="">Выберите курс</option>
        ${student.subjects.map((course) => `<option value="${course.id}"${course.id === courseId ? ' selected' : ''}>${escape(course.name)}</option>`).join('')}
      </select></label>
      <div class="home-form-datetime">
        <label>Дата <input type="date" name="day" value="${escape(day || today)}" required></label>
        <label>Время (МСК) <input type="time" name="time" value="${escape(time || '18:00')}" required></label>
      </div>
      <label>Ссылка <input type="url" name="link" maxlength="1000" value="${escape(link || '')}"></label>
      <button class="home-button" type="submit">Сохранить</button>
    </form>
  </section>`;
}

export function homePage(student, today, reminders, csrf, options = {}) {
  const { showAll, formValues, formError, announcements = [] } = options;
  const upcoming = activitiesFor(student, today, reminders).filter((item) => !item.done);
  const relevant = upcoming.filter((item) => item.day >= today);
  const displayed = showAll ? upcoming : (relevant.length ? relevant : upcoming).slice(0, previewLimit);
  const courses = new Map(student.subjects.map((course) => [course.id, course]));
  const completed = reminders.filter((item) => item.done);
  const subtitle = formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="home">
    <header class="home-heading">
      <div><p class="home-date">${escape(subtitle.charAt(0).toUpperCase() + subtitle.slice(1))}</p><h1>Активные курсы</h1></div>
    </header>
    ${announcements.length ? `<section class="home-announcements" aria-labelledby="home-announcements-heading">
      <div class="home-agenda-heading"><h2 id="home-announcements-heading">Объявления</h2><a class="home-link" href="/announcements">Все объявления</a></div>
      <div class="home-announcement-grid">${announcements.map(({ id, title, published_at }) => `<a class="panel feed-item" href="/announcements/${id}">
        ${iconTile('megaphone', 'violet')}<div><small>${shortDate(published_at.slice(0, 10))}</small><strong>${escape(title)}</strong></div>${icon('chevron')}</a>`).join('')}</div>
    </section>` : ''}
    <div class="home-grid">
      <section id="courses-heading" class="home-courses" aria-label="Активные курсы">
        <div class="home-cards">${student.subjects.map(courseCard).join('')}</div>
      </section>
      <aside class="home-agenda" aria-labelledby="activity-heading">
        <div class="home-agenda-heading"><h2 id="activity-heading">Ближайшие активности</h2>
          <div class="home-agenda-actions">
            ${upcoming.length > previewLimit ? `<a class="home-link home-agenda-more" href="${showAll ? '/' : '/?all=1'}#activity-heading">${showAll ? 'Свернуть' : 'Все активности'}</a>` : ''}
            <a class="home-button home-button-outline home-add" href="/?new=1#personal-form" title="Добавить личный дедлайн" aria-label="Добавить личный дедлайн">${icon('plus')}<span>Добавить</span></a>
          </div>
        </div>
        ${formValues ? reminderForm(student, csrf, today, formValues, formError) : ''}
        ${displayed.length ? `<ul class="home-activity-list">${displayed.map((item) =>
          activityRow(item, courses.get(item.courseId), today, csrf)).join('')}</ul>` : ''}
        ${!displayed.length ? '<p class="home-agenda-empty">Предстоящие активности пока не опубликованы.</p>' : ''}
        ${completed.length ? `<details class="home-completed"><summary>Выполненные личные задачи · ${completed.length}</summary>
          <ul>${completed.map((item) => `<li><div><strong>${escape(item.title)}</strong><p>${escape(courses.get(item.course_id).name)}</p></div>${markForm(item, csrf, true)}</li>`).join('')}</ul>
        </details>` : ''}
      </aside>
    </div>
  </div>`;
}
