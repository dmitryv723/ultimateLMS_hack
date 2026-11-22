import { addDays, fullDate, students, validDate } from './fixtures.js';
import { backLink, badge, escape, intro } from './layout.js';
import { newSubmissionKey, validSubmissionKey } from './services.js';

const basePath = '/staff/session';
const kinds = ['Экзамен', 'Зачёт', 'Пересдача'];
const formats = { campus: 'Очно', online: 'Онлайн' };
const classroomKey = (group, course) => group + '/' + course;
const classrooms = new Map(students.flatMap(({ group, subjects }) => subjects.map((course) =>
  [classroomKey(group, course.id), { group, course }])));
const groups = [...new Set(students.map(({ group }) => group))];
const option = (value, name, current) => `<option value="${escape(value)}"${current === value ? ' selected' : ''}>${escape(name)}</option>`;

function sessionList(exams, date) {
  const rows = exams.map((exam) => {
    const course = classrooms.get(classroomKey(exam.group_name, exam.course_id))?.course;
    return `<article class="panel academic-row"><div class="record-name"><h3>${escape(course?.name ?? exam.course_id)}</h3>
      <p>${escape(exam.kind)} · ${escape(exam.group_name)} · ${fullDate(exam.day)}, ${escape(exam.time)} МСК</p>
      <p>${formats[exam.format]}${exam.format === 'campus' ? ' · ауд. ' + escape(exam.place) : ''}</p></div>
      ${badge(exam.day < date ? 'Прошло' : 'Опубликовано', exam.day < date ? 'neutral' : 'mint')}
      <a class="button-secondary" href="${basePath}/${exam.id}">Редактировать</a></article>`;
  });
  return `<div class="academic-screen">${intro('Расписание сессии', 'Экзамены, зачёты и пересдачи по группам')}
    <div class="staff-actions"><a class="button" href="${basePath}/new">Добавить активность</a></div>
    <div class="record-list">${rows.join('') || '<p class="panel grade-empty">Пока нет опубликованных активностей.</p>'}</div></div>`;
}

function examForm(path, exam, fields, csrf, error) {
  const classroom = exam && classrooms.get(classroomKey(exam.group_name, exam.course_id));
  const picker = exam ? `<p><strong>${escape(exam.group_name)} · ${escape(classroom?.course.name ?? exam.course_id)}</strong></p>`
    : `<label>Группа и дисциплина<select name="classroom" required>
      <option value="">Выберите группу и дисциплину</option>
      ${groups.map((group) => `<optgroup label="${escape(group)}">${[...classrooms].filter(([, item]) => item.group === group)
        .map(([key, { course }]) => option(key, course.name, fields.classroom)).join('')}</optgroup>`).join('')}
    </select></label>`;
  return `<form class="panel detail-panel staff-form" method="post" action="${path}">
    <input type="hidden" name="csrf" value="${escape(csrf)}">
    ${exam ? `<input type="hidden" name="revision" value="${exam.revision}">`
      : `<input type="hidden" name="submission" value="${validSubmissionKey(fields.key) ? fields.key : newSubmissionKey()}">`}
    ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
    ${picker}<label>Тип активности<select name="kind">${kinds.map((kind) => option(kind, kind, fields.kind)).join('')}</select></label>
    <label>Дата<input type="date" name="day" value="${escape(fields.day)}" max="2099-12-31" required></label>
    <label>Время начала (МСК)<input type="time" name="time" value="${escape(fields.time)}" required></label>
    <label>Формат<select name="format">${Object.entries(formats).map(([key, name]) => option(key, name, fields.format)).join('')}</select></label>
    <label>Аудитория или ссылка<input name="place" value="${escape(fields.place ?? '')}" placeholder="Б-312 или https://…" maxlength="500" required></label>
    <p class="muted">${exam ? 'Изменения появятся у студентов этой группы после сохранения.' : 'После публикации активность появится в разделе «Сессия» у студентов этой группы.'}</p>
    <button class="button" type="submit">${exam ? 'Сохранить изменения' : 'Опубликовать'}</button>
  </form>`;
}

export function officeSessionRoute({ path, form, csrf, store, date }) {
  if (path === basePath && !form) return { title: 'Расписание сессии', body: sessionList(store.sessionExams(), date) };
  const id = /^\/staff\/session\/(new|[a-f0-9]{24})$/.exec(path)?.[1];
  if (!id) return null;
  const exam = id === 'new' ? null : store.sessionExam(id);
  if (id !== 'new' && !exam) return null;
  const title = exam ? 'Редактировать активность' : 'Добавить активность';
  const show = (fields, error, status = 200) => ({ title, status,
    body: `<div class="detail">${backLink(basePath, 'К расписанию сессии')}${intro(title)}${examForm(path, exam, fields, csrf, error)}</div>` });
  if (!form) return show(exam ?? { kind: 'Экзамен', day: addDays(date, 1), time: '10:00', format: 'campus' });

  const value = (key) => String(form.get(key) ?? '').trim();
  const fields = Object.fromEntries(['classroom', 'kind', 'day', 'time', 'format', 'place'].map((key) => [key, value(key)]));
  fields.key = value('submission');
  const classroom = classrooms.get(fields.classroom);
  if (!exam && (!classroom || !validSubmissionKey(fields.key))) return show(fields, 'Выберите группу и дисциплину.', 422);
  if (!kinds.includes(fields.kind) || !validDate(fields.day) || fields.day > '2099-12-31' ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(fields.time) || !Object.hasOwn(formats, fields.format)) {
    return show(fields, 'Проверьте тип активности, дату, время и формат.', 422);
  }
  if (fields.format === 'online') {
    const url = URL.parse(fields.place);
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 500) {
      return show(fields, 'Укажите ссылку для подключения, начинающуюся с https:// или http://.', 422);
    }
    fields.place = url.href;
  } else if (!fields.place || fields.place.length > 120 || /[\u0000-\u001f\u007f]/.test(fields.place)) {
    return show(fields, 'Укажите аудиторию или адрес, до 120 символов.', 422);
  }
  if (!exam) store.createSessionExam(fields.key, classroom, fields, date);
  else if (!/^\d+$/.test(value('revision')) || !store.updateSessionExam(exam, fields, Number(value('revision')), date)) {
    return show(store.sessionExam(exam.id), 'Расписание уже изменили. Проверьте актуальные данные перед сохранением.', 409);
  }
  return { redirect: basePath };
}
