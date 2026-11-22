import { markdownContent } from './markdown.js';
import { addDays, fullDate, lessonSlots, shortDate } from './fixtures.js';
import { backLink, escape, icon, intro, tabs } from './layout.js';
import { requestNumber, serviceCategoryTitle, serviceTitle } from './services.js';
import { staffWeekTable } from './timetable.js';
import { staffReviewList } from './staff.js';

const proposalsPath = '/staff/schedule/proposals';
const teacherSchedulePath = '/staff/teaching/schedule';

export function teacherLessonHref(group, day, number) {
  return teacherSchedulePath + '/' + day + '/' + number + '?group=' + encodeURIComponent(group);
}

const cardHeading = (title, href, link) => `<div class="dashboard-section-heading"><h2>${title}</h2>
  <a class="text-link" href="${href}">${link}</a></div>`;
const statusLabels = { pending: 'На согласовании', published: 'Перенос опубликован', declined: 'Отклонено' };
const info = (day, slot, room) => escape(shortDate(day) + ', ' + lessonSlots[slot].start + ' · ауд. ' + room);

function teachingLessons(lessons) {
  return `<ul class="staff-records staff-topic-list">${lessons.map(({ lesson, group, day, number }) =>
    `<li><a href="/staff/courses/${lesson.id}"><span><strong>${escape(lesson.name)}</strong>
      <small>${escape(group)} · ${info(day, lesson.slot, lesson.room)}${lesson.previous ? ' · Изменено' : ''}</small></span>
      ${icon('chevron')}</a>
      <div class="teacher-lesson-links"><a class="text-link" href="${teacherLessonHref(group, day, number)}">Перенос занятия</a></div></li>`).join('')}</ul>`;
}

function teacherProposalList(proposals) {
  if (!proposals.length) return '<p class="muted">Предложений о переносе пока нет.</p>';
  return `<ul class="staff-records staff-topic-list">${proposals.map((item) => `<li>
    <a href="${teacherLessonHref(item.group_name, item.day, item.lesson_number)}">
      <span><strong>${escape(item.title)}</strong><small>${info(item.day, item.slot, item.room)} · ${statusLabels[item.status]}</small></span>
      ${icon('chevron')}</a>
  </li>`).join('')}</ul>`;
}

export function teacherDashboard(person, date, lessons, nearest, grading, disciplines) {
  const nameParts = person.fullName.split(/\s+/);
  const greeting = 'Здравствуйте, ' + nameParts.slice(0, 2).join(' ');
  const pairsTitle = lessons.length ? 'Пары сегодня' : 'Следующие пары';
  const pairs = lessons.length ? lessons : nearest;
  return `${intro(greeting, fullDate(date))}
    <div class="staff-dashboard">
      <section class="panel staff-section">
        ${cardHeading(pairsTitle, teacherSchedulePath, 'Все пары')}
        ${pairs.length ? teachingLessons(pairs)
          : '<p class="muted">Занятий поблизости нет. Ближайшие занятия — в разделе «Мои пары».</p>'}
      </section>
      <section class="panel staff-section">
        ${cardHeading('К проверке', '/staff/teaching/review', 'Очередь проверки')}
        ${staffReviewList(grading)}
        ${grading.length ? '' : `<div class="staff-actions"><a class="button-secondary" href="/staff/teaching/review">${icon('file')}Перейти к очереди проверки</a></div>`}
      </section>
    </div>
    <section class="panel staff-section">
      ${cardHeading('Мои дисциплины', '/staff/courses', 'Список дисциплин')}
      <ul class="staff-records staff-topic-list">${disciplines.map(({ id, name, group }) =>
        `<li><a href="/staff/teaching/publications#topics-${id}"><span><strong>${escape(name)}</strong><small>Группа ${escape(group)}</small></span>${icon('chevron')}</a></li>`).join('')}</ul>
    </section>`;
}

function teacherWeek(days, today) {
  return staffWeekTable(days, ({ lesson, group, day, number }) =>
    `<a class="week-lesson${lesson.previous ? ' lesson-moved' : ''}" href="/staff/courses/${lesson.id}"><strong>${escape(lesson.name)}</strong>
      <span class="week-lesson-meta">${escape(group)} · ауд. ${escape(lesson.room)}</span></a>
      <a class="text-link" href="${teacherLessonHref(group, day, number)}" aria-label="Перенос занятия: ${escape(lesson.name)}">Перенос</a>`,
    'Пары преподавателя на неделю', today);
}

export function teacherSchedule(day, today, lessons, proposals, week) {
  const range = week ? shortDate(week[0].day) + ' — ' + shortDate(week.at(-1).day) : fullDate(day);
  const step = week ? 7 : 1;
  const mode = week ? 'week' : 'day';
  const from = week ? week[0].day : day;
  const dateHref = (offset) => teacherSchedulePath + '?view=' + mode + '&amp;date=' + addDays(from, offset);
  return `${intro('Мои пары', range)}
    ${tabs('Период расписания', [
      ['day', 'Сегодня', teacherSchedulePath + '?date=' + today],
      ['week', 'Вся неделя', teacherSchedulePath + '?view=week&amp;date=' + day]
    ], week ? 'week' : day === today ? 'day' : '')}
    <section class="panel staff-section">
      <form class="staff-date" action="${teacherSchedulePath}" method="get">
        <input type="hidden" name="view" value="${mode}">
        <label>Дата<input type="date" name="date" value="${day}" required></label>
        <button class="button-secondary" type="submit">Показать</button>
      </form>
      <nav class="staff-actions" aria-label="Листать расписание">
        <a class="home-button home-button-outline" href="${dateHref(-step)}">${icon('back')}${week ? 'Предыдущая неделя' : 'Предыдущий день'}</a>
        <a class="home-button home-button-outline" href="${dateHref(step)}">${week ? 'Следующая неделя' : 'Следующий день'}${icon('arrow')}</a>
      </nav>
      ${week ? teacherWeek(week, today) : lessons.length ? teachingLessons(lessons) : '<p class="muted">В этот день у вас нет занятий.</p>'}
    </section>
    <section class="panel staff-section"><h2>Мои переносы</h2>${teacherProposalList(proposals)}</section>`;
}

const hidden = (csrf) => `<input type="hidden" name="csrf" value="${escape(csrf)}">`;
export function teacherLessonPage({ group, day, number, lesson }, proposals, csrf, allow, error, values = {}) {
  return `${backLink(teacherSchedulePath + '?date=' + day, 'К моим парам')}
    ${intro(lesson.name, group + ' · ' + fullDate(day) + ' · ' + lesson.start + ' · ауд. ' + lesson.room)}
    <a class="home-link" href="/staff/courses/${lesson.id}">${icon('study')}Открыть курс</a>
    <section class="panel staff-section"><h2>Предложить перенос</h2>
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      ${allow ? `<form class="staff-form" method="post" action="${teacherLessonHref(group, day, number)}">
        ${hidden(csrf)}
        <label>Новое время в этот день (МСК)<select name="slot">${lessonSlots.map(({ start, end }, index) =>
          `<option value="${index}"${index === (values.slot ?? lesson.slot) ? ' selected' : ''}>${start}–${end}</option>`).join('')}</select></label>
        <label>Аудитория<input name="room" maxlength="25" value="${escape(values.room ?? lesson.room)}" required></label>
        <label>Причина переноса<textarea name="reason" rows="3" maxlength="200" required>${escape(values.reason ?? '')}</textarea></label>
        <button class="button" type="submit">Отправить в учебный офис</button>
      </form>` : `<p class="muted">${proposals.some(({ status }) => status === 'pending') ? 'Предложение уже на согласовании.' : 'Для прошедших занятий перенос недоступен.'}</p>`}
    </section>
    ${proposals.length ? `<section class="panel staff-section"><h2>История предложений</h2>
      <ul class="staff-records">${proposals.map((item) => `<li>
        <strong>${statusLabels[item.status]}</strong><small>${info(item.day, item.slot, item.room)}</small>
        ${item.decision_note ? `<p>${escape(item.decision_note)}</p>` : ''}
      </li>`).join('')}</ul></section>` : ''}`;
}

function officeProposalsList(proposals) {
  return proposals.length ? `<ul class="staff-records staff-topic-list">${proposals.map((item) =>
    `<li><a href="${proposalsPath}/${item.id}"><span><strong>${escape(item.title)}</strong>
      <small>${escape(item.group_name)} · ${info(item.day, item.slot, item.room)} · ${statusLabels[item.status]}</small></span>${icon('chevron')}</a></li>`).join('')}</ul>`
    : '<p class="muted">Предложений о переносе пока нет.</p>';
}

export function officeDashboard(date, proposals, requests, groups) {
  return `${intro('Учебный офис', fullDate(date))}
    <div class="office-dashboard">
      ${requests ? `<section class="panel staff-section office-queue">
        ${cardHeading('Дольше всего ждут ответа', '/staff/requests?status=open', 'Вся очередь')}
        <form action="/staff/requests" method="get" class="staff-date office-search">
          <input name="status" type="hidden" value="all">
          <label>Поиск по ФИО или номеру<input type="search" name="q" maxlength="80"></label>
          <button class="button-secondary" type="submit">Найти</button>
        </form>
        <nav class="staff-actions" aria-label="Очередь обращений">
          <a class="button-secondary" href="/staff/requests?status=open">Открытые</a>
          <a class="button-secondary" href="/staff/requests?status=ready">Готовые</a>
        </nav>
        ${requests.length ? `<ul class="staff-records office-request-list">${requests.map((item) =>
          `<li><a href="/staff/requests/${escape(item.id)}">
            <span><strong>${escape(serviceTitle(item.service))}</strong><small>${escape(item.name + ' · ' + requestNumber(item.id) + ' · ' + serviceCategoryTitle(item.service))}</small></span>
            <span class="office-request-date">с ${escape(shortDate(item.created_on))}</span>
            <small>${item.status === 'submitted' ? 'Принято' : 'В работе'}</small>${icon('chevron')}
          </a></li>`).join('')}</ul>` : '<p class="muted">Все обращения обработаны.</p>'}
      </section>` : ''}
      <section class="panel staff-section">
        ${cardHeading('Расписание групп', '/staff/schedule', 'Открыть расписание')}
        <div class="staff-actions">${groups.map((group) => `<a class="button-secondary" href="/staff/schedule?group=${encodeURIComponent(group)}">
          ${icon('calendar')}${escape(group)}</a>`).join('')}</div>
      </section>
      <section class="panel staff-section">
        ${cardHeading('Переносы на согласовании', proposalsPath, 'Все переносы')}
        ${officeProposalsList(proposals)}
      </section>
    </div>`;
}

export function officeProposals(proposals) {
  return `${backLink('/staff/schedule', 'К расписанию групп')}${intro('Переносы занятий')}<section class="panel staff-section">${officeProposalsList(proposals)}</section>`;
}

export function officeProposal(item, teacher, csrf, conflict, error) {
  return `${backLink(proposalsPath, 'К переносам')}${intro(item.title, item.group_name + ' · ' + teacher)}
    <section class="panel staff-section"><h2>${statusLabels[item.status]}</h2>
      <dl class="staff-profile"><div><dt>В расписании</dt><dd>${info(item.day, item.original_slot, item.original_room)}</dd></div>
        <div><dt>Предложено</dt><dd>${info(item.day, item.slot, item.room)}</dd></div></dl>
      ${markdownContent(item.reason)}
      ${item.decision_note ? markdownContent(item.decision_note) : ''}
      ${item.status === 'pending' ? `
        <p class="${conflict ? 'form-error' : 'muted'}">${escape(conflict || 'В расписании группа, преподаватель и аудитория свободны.')}</p>
        ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
        <form class="staff-form" method="post" action="${proposalsPath}/${item.id}">
          ${hidden(csrf)}<label>Комментарий при отказе<textarea name="note" maxlength="200" rows="3"></textarea></label>
          <div class="staff-actions">
            <button class="button" name="action" value="publish"${conflict ? ' disabled' : ''}>Опубликовать и уведомить группу</button>
            <button class="button-secondary" name="action" value="decline">Отклонить</button>
          </div>
        </form>` : ''}
    </section>`;
}
