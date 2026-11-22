import { markdownContent } from './markdown.js';
import { addDays, formatDate, fullDate, lessonsFor, lessonSlots, shortDate, weekDay, weekStart } from './fixtures.js';
import { backLink, badge, escape, icon, iconTile, intro, linkButton } from './layout.js';
import { notificationHref, transferNotice } from './notifications.js';
import { activitiesFor } from './home.js';

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const dateLabel = (date) => formatDate(date, { day: 'numeric', month: 'long' });
const timeRange = ({ start, end }) => start + '–' + end;

function lessonCell(lesson) {
  return `<a class="week-lesson${lesson.previous ? ' lesson-moved' : ''}" href="${lesson.path}">
    <strong>${escape(lesson.name)}</strong>
    <span class="week-lesson-meta">${escape(lesson.type)} · ауд. ${escape(lesson.room)}</span>
    <span class="week-lesson-meta">${escape(lesson.teacher)}</span>
    ${lesson.previous ? badge('Перенос', 'amber') : ''}
  </a>`;
}

const weekHref = (date) => '/schedule/week?date=' + date;

function scheduleDeadlines(entries, subjects) {
  const item = (entry) => `<li><time>${entry.time}</time>
    ${entry.href ? `<a href="${escape(entry.href)}">${escape(entry.title)}</a>` : `<span>${escape(entry.title)}</span>`}
    <small>${escape(subjects.get(entry.courseId))}</small></li>`;
  if (!entries.length) return '<span class="muted" aria-label="Нет дедлайнов">—</span>';
  return `<ul class="week-deadline-list">${entries.map(item).join('')}</ul>`;
}

export function schedulePage(student, date, focusDate, reminders = [], events = []) {
  const selected = focusDate || date;
  const start = weekStart(selected);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(start, index);
    return { date: day, slots: new Map(lessonsFor(student, day).map((lesson) => [lesson.slot, lesson])) };
  });
  const isSelected = (day) => day === selected ? ' week-selected' : '';
  const dateRange = dateLabel(start) + ' — ' + dateLabel(days[6].date);
  const transfer = transferNotice(student, selected);
  const deadlines = activitiesFor(student, date, reminders)
    .filter(({ kind, done }) => !done && (kind === 'homework' || kind === 'personal'));
  const subjects = new Map(student.subjects.map(({ id, name }) => [id, name]));

  return `<div class="academic-screen">
    <header class="page-intro portal-heading">
      <p class="portal-context">Группа ${escape(student.group)}</p>
      <h1>Расписание</h1>
    </header>
    <div class="week-heading">
      <nav class="week-controls" aria-label="Выбор недели">
        <a class="button-secondary" href="${weekHref(addDays(start, -7))}" aria-label="Предыдущая неделя">${icon('back')}</a>
        <h2>${dateRange}</h2>
        <a class="button-secondary" href="${weekHref(addDays(start, 7))}" aria-label="Следующая неделя">${icon('arrow')}</a>
      </nav>
      <a class="button-secondary week-current" href="${weekHref(date)}">Текущая неделя</a>
    </div>
    <nav class="week-day-picker" aria-label="Выбор дня">
      ${days.map(({ date: day }) => `<a href="${weekHref(day)}"${day === selected ? ' aria-current="page"' : ''}
        aria-label="${escape(capital(weekDay(day)) + ', ' + dateLabel(day))}">
        <span>${formatDate(day, { weekday: 'short' })}</span><strong>${Number(day.slice(-2))}</strong>
      </a>`).join('')}
    </nav>
    <div class="week-table-panel panel">
      <table class="week-table" aria-label="Занятия на неделю ${escape(dateRange)}">
        <thead><tr><th scope="col" class="week-time">Время</th>${days.map(({ date: day }) => `<th scope="col" id="day-${day}" class="week-day${isSelected(day)}${day === date ? ' week-today' : ''}">
          <span>${capital(formatDate(day, { weekday: 'short' }))}</span><strong>${dateLabel(day)}</strong>${day === date ? '<small>Сегодня</small>' : ''}
        </th>`).join('')}</tr></thead>
        <tbody>${lessonSlots.map(({ start, end }, slot) => `<tr>
          <th scope="row" class="week-time"><time>${start}</time><time>${end}</time></th>
          ${days.map(({ date: day, slots }) => `<td class="week-day${isSelected(day)}">${slots.has(slot) ? lessonCell(slots.get(slot)) : ''}</td>`).join('')}
        </tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row" class="week-time">Дедлайны</th>
          ${days.map(({ date: day }) => `<td class="week-day${isSelected(day)}">
            ${scheduleDeadlines(deadlines.filter((entry) => entry.day === day), subjects)}</td>`).join('')}
        </tr>
        ${events.length ? `<tr><th scope="row" class="week-time">События</th>
          ${days.map(({ date: day }) => `<td class="week-day${isSelected(day)}">${events.filter((event) => event.day === day).map((event) =>
            `<a class="week-lesson week-event" href="/events/${event.id}"><strong>${escape(event.title)}</strong>
              <span class="week-lesson-meta">${event.start}–${event.end} · ${escape(event.place)}</span></a>`).join('')}</td>`).join('')}
        </tr>` : ''}</tfoot>
      </table>
    </div>
    <a class="week-change panel" href="${transfer.path}">
      ${icon('shift')}<span><strong>Перенос · ${escape(transfer.text)}</strong>
      <small><s>${escape(transfer.before)}</s> → ${escape(transfer.detail)}</small></span>${icon('chevron')}
    </a>
  </div>`;
}

export function staffWeekTable(days, renderLesson, label, today) {
  return `<div class="week-table-panel staff-week" tabindex="0" role="region" aria-label="${escape(label)}">
    <table class="week-table" aria-label="${escape(label)}">
      <thead><tr><th scope="col" class="week-time">Время</th>${days.map(({ day }) =>
        `<th scope="col" class="week-day${day === today ? ' week-today' : ''}"><span>${escape(weekDay(day))}</span>
          <strong>${escape(shortDate(day))}</strong>${day === today ? '<small>Сегодня</small>' : ''}</th>`).join('')}</tr></thead>
      <tbody>${lessonSlots.map(({ start, end }, slot) => `<tr>
        <th scope="row" class="week-time"><time>${start}</time><time>${end}</time></th>
        ${days.map(({ day, lessons }) => `<td class="week-day">${lessons.filter(({ lesson }) => lesson.slot === slot)
          .map((entry) => renderLesson(entry, day)).join('')}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>`;
}

export function lessonPage(lesson, online = null) {
  const back = weekHref(lesson.date);
  return `<div class="detail">${backLink(back, 'К расписанию')}<div class="detail-heading">
    ${intro(lesson.name, capital(weekDay(lesson.date)) + ', ' + fullDate(lesson.date))}
    ${lesson.previous ? badge('Перенос', 'amber') : ''}${badge(online ? 'Онлайн' : lesson.type, online ? 'blue' : 'violet')}
  </div>
  ${lesson.previous ? `<section class="panel change-panel"><div class="update-intro">${iconTile('shift', 'amber')}<h2>Что изменилось</h2></div>
    <dl class="change-grid">
      <div><dt>Было</dt><dd><s>${timeRange(lesson.previous)}</s><s>Ауд. ${escape(lesson.previous.room)}</s></dd></div>
      <div><dt>Стало</dt><dd><strong>${timeRange(lesson)}</strong><strong>Ауд. ${escape(lesson.room)}</strong></dd></div>
    </dl>${lesson.reason ? markdownContent(lesson.reason) : ''}</section>` : ''}
  <section class="panel detail-panel"><h2>О занятии</h2><dl class="facts">
    <div><dt>Время</dt><dd>${timeRange(lesson)}</dd></div><div><dt>Аудитория</dt><dd>${escape(lesson.room)}</dd></div>
    <div><dt>Преподаватель</dt><dd>${escape(lesson.teacher)}</dd></div><div><dt>Тип занятия</dt><dd>${lesson.type}</dd></div>
  </dl>
  ${online ? `<div class="detail-footer"><a class="button" href="${escape(online.link)}">${icon('video')}Подключиться онлайн</a>
    <p class="muted">Ссылка опубликована учебным офисом ${escape(fullDate(online.published_on))}.</p></div>` : ''}</section></div>`;
}

export function notificationsPage(items, action, csrf) {
  const unread = items.filter(({ unread }) => unread);
  return `${intro('Уведомления')}
    ${action && unread.length ? `<form class="notice-read-form" method="post" action="${action}">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      ${unread.map(({ key }) => `<input type="hidden" name="notice" value="${escape(key)}">`).join('')}
      <button class="button-secondary" type="submit">Отметить все прочитанными</button></form>` : ''}
    ${items.length ? `<div class="feed">${items.map((item) => `<a class="panel feed-item" href="${escape(notificationHref(item))}">
      ${iconTile(item.glyph, item.tone)}<div><div class="feed-caption">${badge(item.label, item.tone)}
        <span class="muted">${escape(shortDate(item.date))}${item.unread ? ' · Новое' : ''}</span></div>
        <h2>${escape(item.title)}</h2>${item.text ? `<p><strong>${escape(item.text)}</strong>${item.detail ? ' · ' + escape(item.detail) : ''}</p>` : ''}
        ${item.body ? markdownContent(item.body) : ''}</div>${icon('chevron')}</a>`).join('')}</div>`
      : '<p class="panel grade-empty">Уведомлений пока нет.</p>'}`;
}

export function notificationPage(item) {
  return `<div class="detail">${backLink('/notifications', 'К уведомлениям')}
    <div class="detail-heading">${intro(item.title, fullDate(item.date))}${badge(item.label, item.tone)}</div>
    <article class="panel detail-panel"><p>${escape(item.body)}</p></article>
    <div class="detail-footer">${linkButton('/notifications', 'Все уведомления')}</div></div>`;
}
