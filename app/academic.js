import { addDays, studentWork, fullDate, shortDate, workKey } from './fixtures.js';
import { formatToolbar } from './format-toolbar.js';
import { backLink, badge, escape, icon, iconTile, intro, tabs } from './layout.js';
import { newSubmissionKey } from './services.js';
import { activityType, gradeFilterOptions, gradeTypeFilter } from './grade-types.js';

function gradeTable(label, columns, rows) {
  return `<div class="panel grade-table-panel"><table class="grade-table" aria-label="${escape(label)}">
    <thead><tr>${columns.map((column) => `<th scope="col">${escape(column)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function gradeList(student) {
  const rows = student.subjects.map((course) => {
    const recentExam = student.exams
      .filter(([name, , offset, , , result, published]) => name === course.name && result && (offset < 0 || published))
      .sort((first, second) => second[2] - first[2])[0];
    return `<tr><th scope="row"><a href="/study/${student.id}/grades/${course.id}">${escape(course.name)}${icon('chevron')}</a></th>
      <td>${student.finalGrades?.[course.id] ? escape(student.finalGrades[course.id]) : '<span class="muted" title="Итоговый балл пока не опубликован">—</span>'}</td>
      <td>${recentExam ? escape(recentExam[5]) : '<span class="muted" title="Балл за сессию пока не опубликован">—</span>'}</td></tr>`;
  }).join('');
  return gradeTable('Оценки по дисциплинам', ['Дисциплина', 'Итоговый балл', 'Балл за сессию'], rows) +
    '<p class="grade-note">Прочерк означает, что балл пока не опубликован.</p>';
}

export function courseGradesPage(student, course, date, type, discussionFor) {
  const exams = student.exams.filter(([name]) => name === course.name);
  const grades = student.grades.filter(([name]) => name === course.name);
  const assigned = studentWork(student).filter(({ courseId }) => courseId === course.id);
  const results = grades.map(([, title, result, unit, activityKey]) => {
    const task = assigned.find((work) => workKey(work) === workKey({ title, activityKey }));
    return { title, result, activityKey: unit ? workKey({ title, activityKey }) : null, deadline: task?.offset, kind: activityType(title, task?.kind) };
  });
  const pending = assigned.filter((work) => !grades.some(([, title, , , activityKey]) => workKey(work) === workKey({ title, activityKey })))
    .map(({ title, offset, kind }) => ({ title, deadline: offset, kind: activityType(title, kind) }));
  const session = exams.map(([, title, offset, , , result]) => ({
    title, result, deadline: offset, kind: 'session', context: 'Сессия', status: offset >= 0 ? 'Предстоит' : 'Оценка ещё не опубликована'
  }));
  const activities = [...results, ...pending, ...session];
  const selected = gradeTypeFilter(type);
  const kinds = new Set(activities.map(({ kind }) => kind));
  if (selected !== 'all') kinds.add(selected);
  const rows = activities.filter(({ kind }) => selected === 'all' || kind === selected).map(({ title, context, result, deadline, status, activityKey }) =>
    `<tr><th scope="row">${escape(title)}${context ? `<small>${escape(context)}</small>` : ''}</th>
      <td>${deadline === undefined ? '<span class="muted">—</span>' : escape(shortDate(addDays(date, deadline)))}</td>
      <td>${result ? escape(result) + (activityKey ? discussionFor?.(activityKey) || '' : '') : `<span class="muted">${status || 'Оценка ещё не опубликована'}</span>`}</td></tr>`).join('');
  return `<div class="academic-screen">
    ${backLink('/study/' + student.id + '/grades', 'К списку оценок')}
    ${intro(course.name)}
    ${kinds.size ? `<div class="section-toolbar grade-filters">${tabs('Тип активности', gradeFilterOptions('/study/' + student.id + '/grades/' + course.id, kinds), selected)}</div>` : ''}
    ${rows ? gradeTable('Активности по дисциплине', ['Активность', 'Дата или срок', 'Балл и статус'], rows)
      : `<p class="panel grade-empty">${activities.length ? 'Активностей этого типа пока нет.' : 'Активности по этой дисциплине пока не опубликованы.'}</p>`}
  </div>`;
}

function examList(student, date) {
  const upcoming = student.exams.filter((exam) => exam[2] >= 0);
  const completed = student.exams.filter((exam) => exam[2] < 0);
  const section = (id, title, exams, inFuture) => `<section class="study-content" aria-labelledby="${id}">
    <div class="section-heading"><h2 id="${id}">${title}</h2></div>
    <div class="record-list">${exams.map(([subject, type, offset, time, room, result, published]) => `<article class="panel academic-row"${published ? ` id="exam-${published.id}"` : ''}>
      ${iconTile(inFuture ? 'calendar' : 'check', inFuture ? 'blue' : 'mint')}
      <div class="record-name"><h3>${escape(subject)}</h3><p>${escape(type)} · ${fullDate(addDays(date, offset))}</p>
      ${inFuture || published ? `<p class="exam-time">${escape(time)} МСК · ${published?.format === 'online' ?
        `Онлайн · <a class="text-link" href="${escape(room)}">Подключиться</a>` : `${published ? 'Очно · ' : ''}ауд. ${escape(room)}`}</p>` : ''}</div>
      ${result ? badge(result, 'mint') : !inFuture || published ? badge('Оценка ещё не опубликована', 'neutral') : ''}</article>`).join('')}</div>
    </section>`;
  return section('upcoming', 'Предстоящие испытания', upcoming, true) +
    section('completed', 'Итоги испытаний', completed, false);
}

export function studyPage(student, date, view) {
  const prefix = '/study/' + student.id;
  const views = [['grades', 'Оценки и зачёты', prefix + '/grades'], ['session', 'Сессия', prefix + '/session']];
  const metrics = [
    ['Предстоящие испытания', student.exams.filter(([, , offset]) => offset >= 0).length],
    ['Опубликованные итоги', student.exams.filter(([, , offset, , , result, published]) => result && (offset < 0 || published)).length]
  ];
  return `<div class="academic-screen">${intro('Оценки')}
    <div class="section-toolbar">${tabs('Разделы успеваемости', views, view)}</div>
    ${view === 'session' ? `<dl class="study-metrics">${metrics.map(([label, value]) => `<div class="panel">
      <dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>${examList(student, date)}` : gradeList(student)}</div>`;
}

function profileFields(student) {
  const [surname, firstName, ...patronymic] = student.fullName.split(' ');
  const { personalEmail, academicEmail, phone } = student.contacts ?? {};
  const { start, end, form } = student.education ?? {};
  const { number, issuedOn, validUntil } = student.studentCard ?? {};
  const date = (value) => value ? fullDate(value) : '';
  return {
    personal: [['Фамилия', surname], ['Имя', firstName], ['Отчество', patronymic.join(' ')], ['Дата рождения', date(student.birthDate)]],
    contacts: [['Личный email', personalEmail], ['Учебный email', academicEmail], ['Телефон', phone]],
    education: [['Направление подготовки', student.program], ['Факультет', student.faculty],
      ['Период обучения', [date(start), date(end)].filter(Boolean).join(' — ')], ['Форма обучения', form],
      ['Курс', student.year], ['Группа', student.group]],
    card: [['Номер студенческого билета', number], ['Дата выдачи', date(issuedOn)], ['Действителен до', date(validUntil)]]
  };
}

function profileCorrectionFields(fields) {
  return Object.values(fields).flat().map(([label]) => label);
}

export function validProfileCorrectionField(student, field) {
  return ['ФИО', 'Направление', ...profileCorrectionFields(profileFields(student))].includes(field);
}

const profileFacts = (fields) => `<dl class="facts">${fields.map(([label, value]) =>
  `<div><dt>${escape(label)}</dt><dd>${escape(value || 'Не указано')}</dd></div>`).join('')}</dl>`;

export function profilePage(student, csrf, error = '', focus = '') {
  const fields = profileFields(student);
  return `<div class="detail student-profile">
    ${intro('Мой профиль')}
    <section class="panel detail-panel profile-panel">
      <div class="profile-intro"><span class="avatar">${escape(student.initials)}</span>
        <div><h2>${escape(student.name)}</h2><p>${escape(student.fullName)} · ${escape(student.group)}</p></div></div>
      <h2>Общая информация</h2>
      ${profileFacts(fields.personal)}
      <h3>Контакты</h3>
      ${profileFacts(fields.contacts)}
    </section>
    <section class="panel detail-panel profile-panel">
      <h2>Обучение</h2>
      ${profileFacts(fields.education)}
    </section>
    <section class="panel detail-panel profile-panel">
      <h2>Студенческий билет</h2>
      ${profileFacts(fields.card)}
    </section>
    <section class="panel detail-panel" id="edit-profile">
      <h2>Редактировать профиль</h2>
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      <form class="staff-form" method="post" action="/profile/${student.id}">
        <input type="hidden" name="csrf" value="${escape(csrf)}">
        <input name="action" type="hidden" value="display">
        <label>Имя в кабинете<input name="name" required maxlength="60" value="${escape(student.name)}"></label>
        <button class="button-secondary" type="submit">Сохранить имя</button>
      </form>
      <details${focus === 'correction' ? ' open' : ''}><summary>Исправить официальные данные</summary>
        <form class="staff-form" method="post" action="/profile/${student.id}">
          <input type="hidden" name="csrf" value="${escape(csrf)}">
          <input name="action" type="hidden" value="correction">
          <input type="hidden" name="submission" value="${newSubmissionKey()}">
          <label>Поле<select name="field">${profileCorrectionFields(fields).map((label) => `<option>${escape(label)}</option>`).join('')}</select></label>
          <label>Как должно быть${formatToolbar('correction-message')}<textarea id="correction-message" name="message" rows="2" maxlength="1000" required></textarea></label>
          <button class="button-secondary" type="submit">Отправить исправление в учебный офис</button>
        </form>
      </details>
    </section>
    <form method="post" action="/logout"><input type="hidden" name="csrf" value="${escape(csrf)}">
      <button class="button-secondary" type="submit">${icon('logout')}Выйти из кабинета</button></form>
  </div>`;
}
