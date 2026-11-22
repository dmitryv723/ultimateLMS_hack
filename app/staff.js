import { markdownContent } from './markdown.js';
import { addDays, fullDate, lessonSlots, pickup, shortDate, workKey } from './fixtures.js';
import { staffWeekTable } from './timetable.js';
import { courseFileHref } from './courses.js';
import { chatList, courseChat } from './course-chat.js';
import { backLink, escape, icon, intro, tabs } from './layout.js';
import { isCertificateService, isRequestClosed, newSubmissionKey, requestCategories, requestCommentHistory, requestNumber, serviceCategoryTitle, serviceTitle, submittedRequestForm } from './services.js';
import { requestStatuses } from './fixtures.js';
import { topicsForCourse } from './teaching-catalog.js';
import { publicationAccept } from './publication.js';
import { gradeFilterOptions } from './grade-types.js';
import { formatToolbar } from './format-toolbar.js';
import { homeworkAnswerContent } from './homework-answer.js';

const staffLinks = {
  teacher: [
    ['/staff/teaching', 'Главная', 'grid'],
    ['/staff/teaching/schedule', 'Мои пары', 'calendar'],
    ['/staff/courses', 'Мои дисциплины', 'study'],
    ['/staff/teaching/publications', 'Материалы и задания', 'file'],
    ['/staff/teaching/grades', 'Оценки', 'check'],
    ['/staff/teaching/session', 'Итоги сессии', 'study'],
    ['/staff/teaching/review', 'К проверке', 'file'],
    ['/staff/teaching/chats', 'Чаты', 'chat']
  ],
  office: [['/staff/office', 'Главная', 'grid'], ['/staff/requests', 'Очередь обращений', 'file'],
    ['/staff/schedule', 'Расписание', 'calendar'], ['/staff/session', 'Сессия', 'study'],
    ['/staff/announcements', 'Объявления', 'megaphone'], ['/staff/events', 'Афиша', 'megaphone']]
};

export function staffHomePath(role) {
  return staffLinks[role][0][0];
}

export function staffNavigation(role, path) {
  const active = staffLinks[role].map(([href]) => href).filter((href) => path === href || path.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return staffLinks[role].map(([href, label, glyph]) =>
    `<a href="${href}" title="${escape(label)}"${href === active ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('');
}

const staffError = (error) => error ? `<p class="form-error" role="alert">${escape(error)}</p>` : '';
const staffCsrf = (csrf) => `<input type="hidden" name="csrf" value="${escape(csrf)}">`;
const staffSave = (label) => `<button class="button" type="submit">${escape(label)}${icon('check')}</button>`;
const kinds = { material: 'Материал', homework: 'Задание', test: 'Контрольная' };
export const publicationsPath = '/staff/teaching/publications';
export const gradesPath = '/staff/teaching/grades';
export const reviewPath = '/staff/teaching/review';
export const chatsPath = '/staff/teaching/chats';

export function staffProfile(person, classrooms, csrf) {
  const details = person.profile ?? {};
  const identity = [
    ['ФИО', person.fullName],
    ['Должность', person.roleName],
    ['Подразделение', person.unit],
    ['Учёная степень', details.degree],
    ['Учёное звание', details.title],
    ['Кабинет', details.room],
    ['Рабочая почта', person.email],
    ['Внутренний телефон', details.phone],
    ['Логин', person.login]
  ].filter(([, value]) => value);
  const reception = person.role === 'teacher' && details.hours ? `<section class="panel staff-section"><h2>Приёмное время</h2>
      <p>${escape(details.hours)}.</p>
      <p class="muted">Вопросы по материалам, работам и оценкам студенты задают в личном чате курса.</p></section>` : '';
  const service = person.role === 'office' ? `<section class="panel staff-section"><h2>Окно обслуживания</h2>
      <p>${escape(details.hours)}.</p>
      <p class="muted">Приём: ${escape(pickup)}. Студенты записываются на консультации из карточки своего обращения.</p></section>
    <section class="panel staff-section"><h2>Зона обслуживания</h2>
      <ul class="staff-records">${Object.values(requestCategories).map(({ title, summary }) =>
        `<li><strong>${escape(title)}</strong><small>${escape(summary)}</small></li>`).join('')}</ul></section>` : '';
  const disciplines = classrooms.length ? `<section class="panel staff-section"><h2>Дисциплины</h2>
    <ul class="staff-records staff-topic-list">${classrooms.map(({ course, group, id }) =>
      `<li><a href="/staff/courses/${id}"><span><strong>${escape(course.name)}</strong><small>Группа ${escape(group)}</small></span>${icon('chevron')}</a></li>`).join('')}</ul></section>` : '';
  return `${intro('Профиль сотрудника')}
    <section class="panel staff-section"><h2>Личная карточка</h2><dl class="staff-profile">
      ${identity.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}
    </dl></section>
    ${reception}${service}${disciplines}
    <form class="staff-signout" method="post" action="/logout">
      ${staffCsrf(csrf)}<button class="button-secondary" type="submit">${icon('logout')}Выйти из кабинета</button>
    </form>`;
}

export function staffCourses(classrooms, selected) {
  const heading = selected ? backLink('/staff/courses', 'К моим дисциплинам') + intro(selected.course.name, 'Группа ' + selected.group)
    : intro('Мои дисциплины');
  return `${heading}
    ${classrooms.map(({ id, course, group }) => `<section class="panel staff-section">${selected ? '' : `<h2><a href="/staff/courses/${id}">${escape(course.name)}</a></h2><p class="muted">Группа ${escape(group)}</p>`}
      <div class="staff-actions">
        <a class="home-button home-button-outline" href="${publicationsPath}#topics-${id}">${icon('file')}Материалы и задания</a>
        <a class="home-button home-button-outline" href="${gradesPath}#grades-${id}">${icon('check')}Оценки</a>
        <a class="home-button home-button-outline" href="${chatsPath}/${id}">${icon('chat')}Общий чат</a>
      </div></section>`).join('')}`;
}

const topicAnchor = (course, topic) => `publication-topic-${course}-${topic}`;

function topicListHref(course, topic) {
  return `${publicationsPath}?course=${encodeURIComponent(course)}&amp;topic=${encodeURIComponent(topic)}#${topicAnchor(course, topic)}`;
}

function publicationMeta({ kind, due_on, due_at, label, room }) {
  return [label ?? kinds[kind], due_on && `${shortDate(due_on)}, ${due_at} МСК`, room && `ауд. ${room}`].filter(Boolean).join(' · ');
}

export function staffTopics(classrooms, selectedCourse, selectedTopic) {
  return `${intro('Материалы и задания')}
    ${classrooms.map(({ id, course, group, items }) => `<section id="topics-${id}" class="panel staff-section">
      <h2>${escape(course.name)}</h2><p class="muted">Группа ${escape(group)}</p>
      <div class="staff-publication-topics">${topicsForCourse(id).map(([topic, title]) => {
        const topicPath = `${publicationsPath}/${id}/${topic}`;
        const entries = items.filter(({ topic_id }) => topic_id === topic);
        return `<details class="panel course-topic-row staff-publication-topic" id="${topicAnchor(id, topic)}"${id === selectedCourse && topic === selectedTopic ? ' open' : ''}>
          <summary>${icon('book')}<strong>${escape(title)}</strong>${icon('chevron')}</summary>
          <div class="course-entries">
          ${entries.length ? `<ul class="staff-records staff-topic-list">${entries.map((item) =>
            `<li><a href="${topicPath}/${item.id}"><span><strong>${escape(item.title)}</strong><small>${escape(publicationMeta(item))}</small></span>${icon('chevron')}</a></li>`).join('')}</ul>`
          : '<p class="muted">В этой теме пока нет публикаций.</p>'}
          <div class="staff-actions">
            <a class="button-secondary" href="${topicPath}?kind=material">Добавить материал</a>
            <a class="button-secondary" href="${topicPath}?kind=homework">Добавить задание</a>
            <a class="button-secondary" href="${topicPath}?kind=test">Добавить контрольную</a>
          </div></div></details>`;
      }).join('')}</div>
    </section>`).join('')}`;
}

export function staffPublicationDetail({ course, group }, topic, topicName, item, employeeId) {
  const base = `${publicationsPath}/${course.id}/${topic}/${item.id}`;
  return `${backLink(topicListHref(course.id, topic), 'К теме')}
    ${intro(item.title, `${course.name} · ${group} · ${topicName}`)}
    <section class="panel staff-section">
      <p class="muted">${escape(publicationMeta(item))}</p>
      ${item.html ?? (item.description ? markdownContent(item.description) : '')}
      ${item.instructions ? markdownContent(item.instructions) : ''}
      ${item.filename || item.author_id === employeeId ? `<div class="staff-actions">
        ${item.filename ? `<a class="button-secondary" href="${courseFileHref(item.id)}">${icon('download')}${escape(item.filename)}</a>` : ''}
        ${item.author_id === employeeId ? `<a class="button-secondary" href="${base}/edit">Редактировать</a>` : ''}</div>` : ''}
    </section>`;
}

export function staffPublications({ course, group, items }, topic, topicName, path, date, csrf, values, error, existing, employeeId) {
  const { kind, title = '', description = '', day = date, time = '23:59' } = values;
  const base = publicationsPath + '/' + course.id + '/' + topic;
  const heading = existing ? backLink(base + '/' + existing.id, 'К публикации')
    : backLink(topicListHref(course.id, topic), 'К теме');
  return `${heading}
    ${intro(existing ? 'Редактирование публикации' : topicName, course.name + ' · ' + group)}
    <section class="panel staff-section"><h2>${existing ? kinds[kind] : 'Добавить к теме'}</h2>
      ${existing ? '' : tabs('Тип публикации', Object.entries(kinds).map(([id, label]) => [id, label, path + '?kind=' + id]), kind)}
      <form method="post" action="${existing ? path : path + '?kind=' + kind}" class="staff-form" enctype="multipart/form-data">
        ${staffCsrf(csrf)}<input type="hidden" name="submission" value="${newSubmissionKey()}">
        <input type="hidden" name="kind" value="${kind}">
        ${staffError(error)}
        <label>Название<input name="title" maxlength="100" value="${escape(title)}" required></label>
        <label>${kind === 'material' ? 'Описание материала' : 'Условия задания'}${formatToolbar('publication-description')}<textarea id="publication-description" name="description" rows="4" maxlength="2500">${escape(description)}</textarea></label>
        ${kind !== 'material' ? `
        <div class="staff-fields">
          <label>${kind === 'test' ? 'Дата контрольной' : 'Дедлайн'}<input name="day" type="date" value="${escape(day)}" required></label>
          <label>Время (МСК)<input name="time" type="time" value="${escape(time)}" required></label>
        </div>` : ''}
        <label>${kind === 'material' ? 'Файл материала' : 'Файл (по желанию)'}<input name="attachment" type="file" accept="${publicationAccept}"${kind === 'material' && !existing?.filename ? ' required' : ''}>
          ${existing?.filename ? `<small>Текущий файл: ${escape(existing.filename)}. Выберите новый для замены.</small>` : ''}
          <small>PDF, Word, PowerPoint, Excel, TXT, MD, CSV, PNG или JPEG. До 10 МБ.</small></label>
        ${staffSave(existing ? 'Сохранить изменения' : kind === 'material' ? 'Загрузить материал' : 'Опубликовать')}
      </form></section>
    ${existing ? '' : `<section class="panel staff-section" id="published"><h2>Публикации темы</h2>
      <ul class="staff-records">${items.filter(({ topic_id }) => topic_id === topic).map(({ id, kind: type, title: name, filename, description: body, due_on, due_at, author_id }) =>
        `<li><a href="${base}/${id}"><strong>${escape(name)}</strong></a><small>${kinds[type]}
          ${due_on ? ' · ' + escape(shortDate(due_on) + ', ' + due_at) : ''}</small>
          ${body ? markdownContent(body) : ''}
          <div class="staff-actions">${filename ? `<a class="home-link" href="${courseFileHref(id)}">${icon('download')}${escape(filename)}</a>` : ''}
          ${employeeId === author_id ? `<a class="home-button home-button-outline" href="${base}/${id}/edit">Редактировать</a>` : ''}</div></li>`).join('')}</ul>
      ${items.some(({ topic_id }) => topic_id === topic) ? '' : '<p class="muted">В этой теме пока нет публикаций.</p>'}</section>`}`;
}

export function staffGradeIndex(classrooms, selected) {
  const kinds = new Set(classrooms.flatMap(({ works }) => works.map(({ kind }) => kind)));
  if (selected !== 'all') kinds.add(selected);
  const tail = selected === 'all' ? '' : '?type=' + selected;
  return `${intro('Оценки')}
    <div class="grade-filters">${tabs('Тип активности', gradeFilterOptions(gradesPath, kinds), selected)}</div>
    ${classrooms.map(({ id, course, group, works }) => {
      const visible = works.filter(({ kind }) => selected === 'all' || kind === selected);
      return `<section id="grades-${id}" class="panel staff-section">
        <h2>${escape(course.name)}</h2><p class="muted">Группа ${escape(group)}</p>
        ${visible.length ? `<ul class="staff-records staff-topic-list">${visible.map(({ key, title, label }) =>
          `<li><a href="${gradesPath}/${id}/${key}${tail}"><span><strong>${escape(title)}</strong>
            <small>${escape(label)}</small></span>${icon('chevron')}</a></li>`).join('')}</ul>`
          : '<p class="muted">Активностей этого типа пока нет.</p>'}
      </section>`;
    }).join('')}`;
}

export function staffGradeSheet({ course, group, learners }, work, path, csrf, error, submitted, selected, answers, discussionFor) {
  return `${backLink(gradesPath + (selected === 'all' ? '' : '?type=' + selected) + '#grades-' + course.id, 'К списку активностей')}
    ${intro(work.title, course.name + ' · ' + group)}
    <section class="panel staff-section"><h2>Студенты</h2>
      ${staffError(error)}
      <ul class="staff-records">${learners.map(({ id, fullName, grades }) => {
        const result = grades.find(([name, title, , , activityKey]) =>
          name === course.name && workKey({ title, activityKey }) === work.activityKey)?.[2];
        const values = submitted?.student === id ? submitted : null;
        const answer = answers.get(id);
        const [, currentScore, currentMax] = /^(\d+) \/ (\d+)$/.exec(result || '') || [];
        return `<li><form class="staff-form grading-row" method="post" action="${path}" aria-label="${escape(fullName)}">
          ${staffCsrf(csrf)}<input type="hidden" name="student" value="${id}">
          ${answer ? `<input type="hidden" name="answerId" value="${answer.id}">` : ''}
          <div><strong>${escape(fullName)}</strong><small>${result ? 'Текущий результат: ' + escape(result) : 'Балл не выставлен'}</small>
            ${answer ? `<a class="home-button home-button-outline grading-answer"
              href="${gradesPath}/${course.id}/${work.key}/${id}${selected === 'all' ? '' : '?type=' + selected}">Посмотреть работу</a>
              <details class="grading-answer"><summary>Ответ студента</summary>${homeworkAnswerContent(answer)}</details>` : ''}</div>
          <div class="staff-fields"><label>Балл<input name="score" type="number" min="0" max="1000" step="1" required value="${escape(values?.score ?? currentScore ?? '')}"></label>
            <label>Максимум<input name="max" type="number" min="1" max="1000" step="1" required value="${escape(values?.max ?? currentMax ?? work.max ?? '')}"></label></div>
          ${staffSave('Сохранить')}
        </form>${result ? discussionFor(id) : ''}</li>`;
      }).join('')}</ul></section>`;
}

export function staffReviewList(items) {
  return items.length ? `<ul class="staff-records staff-topic-list">${items.map(({ student, work, sheet }) =>
    `<li><a href="${gradesPath}/${sheet.id}/${work.key}/${student.id}"><span><strong>${escape(work.title)}</strong>
      <small>${escape(student.fullName)} · ${escape(sheet.course.name)} · ${escape(sheet.group)}</small></span>${icon('chevron')}</a></li>`).join('')}</ul>`
    : '<p class="muted">Нет новых домашних работ на проверку.</p>';
}

export function staffReviewQueue(items) {
  return `${intro('К проверке')}<section class="panel staff-section">${staffReviewList(items)}</section>`;
}

export function staffReview({ work, student, answer, sheet, back, path, csrf, error, values }) {
  const result = student.grades.find(([course, name, , , key]) =>
    course === sheet.course.name && workKey({ title: name, activityKey: key }) === work.activityKey)?.[2];
  const [, score, max] = /^(\d+) \/ (\d+)$/.exec(result || '') || [];
  return `<div class="teacher-lesson-links">${backLink(back, 'К списку студентов')}${backLink(reviewPath, 'К очереди проверки')}</div>
    ${intro(work.title, student.fullName + ' · ' + sheet.course.name + ' · ' + sheet.group)}
    <section class="panel staff-section"><h2>Работа студента</h2>
      ${homeworkAnswerContent(answer, true)}
    </section>
    <section class="panel staff-section"><h2>Оценка и комментарий</h2>
      <form class="staff-form" method="post" action="${path}">
        ${staffCsrf(csrf)}<input type="hidden" name="answerId" value="${answer.id}">
        ${staffError(error)}
        <div class="staff-fields">
          <label>Балл<input name="score" type="number" min="0" max="1000" required value="${escape(values?.score ?? score ?? '')}"></label>
          <label>Максимум<input name="max" type="number" min="1" max="1000" required value="${escape(values?.max ?? max ?? work.max ?? '')}"></label>
        </div>
        <label>Комментарий студенту${formatToolbar('homework-feedback')}<textarea id="homework-feedback" name="feedback" rows="4" maxlength="2000">${escape(values?.feedback ?? answer.feedback ?? '')}</textarea></label>
        ${staffSave('Сохранить оценку и комментарий')}
      </form>
    </section>`;
}

export function staffChatIndex(classrooms, coworkers = []) {
  const contacts = [...new Map(classrooms.flatMap(({ learners }) => learners.map((person) => [person.id, person]))).values()];
  return `${intro('Чаты')}
    ${classrooms.length ? chatList('Чаты курсов', classrooms.map(({ course, id, group }) =>
      ({ name: course.name, href: chatsPath + '/' + id, context: 'Группа ' + group }))) : ''}
    ${chatList('Личные чаты', [
      ...contacts.map(({ id, fullName }) => ({ name: fullName, href: chatsPath + '/private/' + id })),
      ...coworkers.map(({ id, fullName, roleName }) => ({ name: fullName, href: '/staff/chats/' + id, context: roleName }))
    ], 'Пока нет собеседников.')}`;
}

export function staffChat(title, subtitle, personal, path, messages, csrf, error, index = chatsPath) {
  return `${backLink(index, 'К списку чатов')}
    ${intro(title, subtitle)}
    <section class="panel staff-section">${courseChat(messages, path, csrf, error, personal ? 'Личный чат' : 'Общий чат курса')}</section>`;
}

export function staffScheduleHref(group, day, number, view = 'day') {
  const query = new URLSearchParams();
  if (group) query.set('group', group);
  if (day && !number) query.set('date', day);
  if (view === 'week') query.set('view', view);
  const path = number ? '/staff/schedule/' + day + '/' + number : '/staff/schedule';
  return query.size ? path + '?' + query : path;
}

export function staffSchedule(group, day, lessons, groupOptions, today, week, nearest = null) {
  const scope = groupOptions.length > 1 ? group : '';
  const view = week ? 'week' : 'day';
  const range = week ? shortDate(week[0].day) + ' — ' + shortDate(week.at(-1).day) : fullDate(day);
  const adjacent = (offset) => escape(staffScheduleHref(scope,
    addDays(week ? week[0].day : day, offset * (week ? 7 : 1)), null, view));
  return `${intro('Расписание группы', group)}
    <div class="staff-actions schedule-shortcuts"><a class="button-secondary" href="/staff/schedule/proposals">${icon('shift')}Переносы занятий</a></div>
    ${tabs('Период расписания', [
      ['day', 'День', escape(staffScheduleHref(scope, day))],
      ['week', 'Неделя', escape(staffScheduleHref(scope, day, null, 'week'))]
    ], view)}
    <section class="panel staff-section">
      <form class="staff-date" method="get" action="/staff/schedule">
        <input type="hidden" name="view" value="${view}">
        ${scope ? `<label>Группа<select name="group">${groupOptions.map((item) =>
          `<option value="${escape(item)}"${item === group ? ' selected' : ''}>${escape(item)}</option>`).join('')}</select></label>` : ''}
        <label>Дата<input type="date" name="date" value="${day}" required></label>
        <button class="button-secondary" type="submit">Показать</button>
      </form>
      <nav class="staff-actions" aria-label="Период расписания">
        <a class="home-button home-button-outline" href="${adjacent(-1)}">${icon('back')}${week ? 'Предыдущая неделя' : 'Предыдущий день'}</a>
        <a class="home-button home-button-outline" href="${escape(staffScheduleHref(scope, today, null, view))}">${week ? 'Текущая неделя' : 'Сегодня'}</a>
        <a class="home-button home-button-outline" href="${adjacent(1)}">${week ? 'Следующая неделя' : 'Следующий день'}${icon('arrow')}</a>
      </nav>
      <h2>${escape(range)}</h2>
      ${week ? staffWeekTable(week, ({ lesson, number }, date) =>
        `<a class="week-lesson${lesson.previous ? ' lesson-moved' : ''}" href="${escape(staffScheduleHref(scope, date, number, 'week'))}">
          <strong>${escape(lesson.name)}</strong><span class="week-lesson-meta">Ауд. ${escape(lesson.room)}</span>
          <span class="week-lesson-meta">${escape(lesson.teacher)}</span>${lesson.previous ? '<span class="week-lesson-meta">Перенос</span>' : ''}
        </a>`, 'Занятия группы ' + group + ' на неделю', today)
        : lessons.length ? `<ul class="staff-records">${lessons.map((lesson, index) => `<li>
          <a href="${escape(staffScheduleHref(scope, day, index + 1))}"><strong>${escape(lesson.name)}</strong>
          <small>${lesson.start}–${lesson.end} · ауд. ${escape(lesson.room)}${lesson.previous ? ' · Перенос' : ''}</small></a>
        </li>`).join('')}</ul>`
        : `<p class="muted">У группы ${escape(group)} на эту дату занятий нет.</p>${nearest ? `
          <a class="home-button home-button-outline" href="${escape(staffScheduleHref(scope, nearest, null, view))}">${icon('calendar')}Ближайшие занятия группы — ${escape(fullDate(nearest))}${icon('arrow')}</a>` : ''}`}</section>`;
}

export function staffLesson(lesson, day, number, group, scope, blocked, csrf, error, view, link = null) {
  const action = escape(staffScheduleHref(scope, day, number, view));
  return `${backLink(escape(staffScheduleHref(scope, day, null, view)), view === 'week' ? 'К расписанию на неделю' : 'К расписанию группы')}
    ${intro(lesson.name, group + ' · ' + fullDate(day) + ' · ' + lesson.start + ' · ауд. ' + lesson.room)}
    <section class="panel staff-section"><h2>Перенос занятия</h2>
      <form class="staff-form" method="post" action="${action}">
        ${staffCsrf(csrf)}${staffError(error)}
        <label>Время (МСК)<select name="slot">${lessonSlots.map(({ start, end }, index) => `<option value="${index}"${
          index === lesson.slot ? ' selected' : ''}${blocked.has(index) ? ' disabled' : ''}>${start}–${end}${blocked.has(index) ? ' · занято' : ''}</option>`).join('')}</select></label>
        <label>Аудитория<input name="room" maxlength="25" value="${escape(lesson.room)}" required></label>
        <label>Комментарий для студентов<textarea name="reason" rows="3" maxlength="200" required></textarea></label>
        ${staffSave('Сохранить и уведомить группу')}
      </form></section>
    <section class="panel staff-section" id="lesson-link"><h2>Онлайн-подключение</h2>
      ${link ? `<p class="muted">Ссылка опубликована ${escape(fullDate(link.published_on))}: <a class="text-link" href="${escape(link.link)}">${escape(link.link)}</a></p>`
        : '<p class="muted">Пара запланирована в аудитории. Опубликуйте ссылку, если занятие пройдёт онлайн.</p>'}
      <form class="staff-form" method="post" action="${action}">
        ${staffCsrf(csrf)}
        <label>Ссылка для подключения<input name="online" type="url" maxlength="500" value="${escape(link?.link ?? '')}" placeholder="https://…"></label>
        <div class="staff-actions">
          <button class="button" type="submit" name="link-action" value="save">Опубликовать ссылку${icon('check')}</button>
          ${link ? '<button class="button-secondary" type="submit" name="link-action" value="remove">Убрать ссылку</button>' : ''}
        </div>
      </form></section>`;
}

export function staffRequests(items, status, search, category, type) {
  const categories = [['', 'Все категории'], ...Object.entries(requestCategories).map(([id, data]) => [id, data.title]), ['other', 'Прочие обращения']];
  const visibleTypes = category ? [requestCategories[category]].filter(Boolean) : Object.values(requestCategories);
  const href = (state, group, selectedType = '') => {
    const params = new URLSearchParams({ status: state });
    if (group) params.set('category', group);
    if (selectedType) params.set('type', selectedType);
    if (search) params.set('q', search);
    return escape('/staff/requests?' + params);
  };
  return `${intro('Очередь обращений')}
    ${tabs('Статус', [['open','Открытые'], ['waiting','Ждём студента'], ['ready','Готовые'], ['rejected','Отклонённые'], ['all','Все']].map(([key, label]) => [key, label, href(key, category, type)]), status)}
    <nav class="request-category-filter" aria-label="Категория обращения">${categories.map(([id, label]) =>
      `<a class="button-secondary" href="${href(status, id)}"${id === category ? ' aria-current="page"' : ''}>${escape(label)}</a>`).join('')}</nav>
    <section class="panel staff-section">
      <form action="/staff/requests" method="get" class="staff-date">
        <input name="status" type="hidden" value="${status}">
        ${category ? `<input name="category" type="hidden" value="${category}">` : ''}
        <label>Поиск по ФИО или номеру<input type="search" name="q" maxlength="80" value="${escape(search)}"></label>
        ${visibleTypes.length ? `<label>Тип обращения<select name="type"><option value="">Все типы</option>
          ${visibleTypes.map(({ title, types }) => `<optgroup label="${escape(title)}">${Object.entries(types).map(([id, label]) =>
            `<option value="${id}"${id === type ? ' selected' : ''}>${escape(label)}</option>`).join('')}</optgroup>`).join('')}
        </select></label>` : ''}
        <button class="button-secondary" type="submit">Показать</button>
      </form>
      ${items.length ? `<ul class="staff-records office-request-list staff-queue-records">${items.map((item) => `<li><a href="/staff/requests/${item.id}">
        <span><strong>${escape(serviceTitle(item.service))}</strong><small>${escape(requestNumber(item.id))} · ${escape(item.name)}</small></span>
        <small>${escape(serviceCategoryTitle(item.service))}</small><small>${requestStatuses[item.status].label}</small>${icon('chevron')}
      </a></li>`).join('')}</ul>` : '<p class="muted">Обращений в этом списке пока нет.</p>'}</section>`;
}

export function staffRequest(item, student, csrf, comments, { error, selected = item.status, comment = '', file = null } = {}) {
  const statuses = Object.entries(requestStatuses).filter(([id]) => id !== 'submitted' || item.status === id);
  const electronic = isCertificateService(item.service) && item.delivery === 'download';
  const open = !isRequestClosed(item.status);
  const fileField = electronic && open ? `<label>Готовый документ<input name="file" type="file" accept="${publicationAccept}">
    <small>Обязателен при переводе электронной справки в «Готово». PDF, Word, Excel, PowerPoint, TXT, MD, CSV, PNG или JPEG до 10 МБ.</small></label>` : '';
  const documentSection = electronic ? `<section class="panel staff-section" id="certificate-file"><h2>Готовый документ</h2>
      ${file ? `<a class="home-button home-button-outline" href="/staff/requests/${item.id}/file">${icon('download')}${escape(file.filename)}</a>`
        : open ? '<p class="muted">Приложите готовый документ, когда справка будет подготовлена.</p>'
        : '<p class="muted">Файл не приложен. Студент видит подписанный демонстрационный образец.</p>'}
      ${file || !open ? `<form class="staff-form" method="post" action="/staff/requests/${item.id}" enctype="multipart/form-data">
        ${staffCsrf(csrf)}<input type="hidden" name="action" value="replace">
        <input type="hidden" name="submission" value="${newSubmissionKey()}">
        <label>${file ? 'Заменить документ' : 'Приложить готовый документ'}<input name="file" type="file" accept="${publicationAccept}" required></label>
        ${staffSave(file ? 'Заменить файл' : 'Приложить файл')}
      </form>` : ''}
    </section>` : '';
  return `${backLink('/staff/requests', 'К очереди обращений')}
    ${intro(serviceTitle(item.service), serviceCategoryTitle(item.service) + ' · ' + requestNumber(item.id) + ' · ' + student.fullName)}
    <section class="panel staff-section request-status-heading">
      <h2>Статус заявки</h2><strong>${requestStatuses[item.status].label}</strong>
    </section>
    ${submittedRequestForm(item)}
    ${documentSection}
    <section class="panel staff-section" id="comments"><h2>Комментарии</h2>
      ${requestCommentHistory(comments)}
      <form class="staff-form" method="post" action="/staff/requests/${item.id}"${fileField ? ' enctype="multipart/form-data"' : ''}>
        ${staffCsrf(csrf)}${staffError(error)}
        <input type="hidden" name="expected" value="${item.status}">
        <input type="hidden" name="submission" value="${newSubmissionKey()}">
        <label>Статус заявки<select name="status">${statuses.map(([id, { label }]) =>
          `<option value="${id}"${selected === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        ${fileField}
        <label>Комментарий${formatToolbar('staff-request-comment')}<textarea id="staff-request-comment" name="comment" rows="4" maxlength="1500">${escape(comment)}</textarea></label>
        ${staffSave('Сохранить')}
      </form>
    </section>`;
}
