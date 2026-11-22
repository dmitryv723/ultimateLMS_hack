import { fullDate } from './fixtures.js';
import { backLink, badge, escape, intro } from './layout.js';

const basePath = '/staff/teaching/session';
const rowId = (student) => 'session-result-' + student;
const examDetails = (exam) => `${exam.kind} · ${exam.group_name} · ${fullDate(exam.day)}, ${exam.time} МСК`;

function sessionRows(entries) {
  return `<div class="academic-screen">${intro('Итоги сессии')}
    <div class="record-list">${entries.map(({ exam, classroom }) => `<a class="panel academic-row" href="${basePath}/${exam.id}">
      <div class="record-name"><h3>${escape(classroom.course.name)}</h3><p>${escape(examDetails(exam))}</p></div>
      <span class="text-link">Открыть ведомость</span></a>`).join('') || '<p class="panel grade-empty">Для ваших дисциплин пока нет активностей в расписании сессии.</p>'}</div></div>`;
}

function resultField(exam, value) {
  if (exam.kind !== 'Зачёт') {
    return `<label>Результат<input name="result" value="${escape(value)}" placeholder="Например, 85 или 18 / 20" maxlength="24" required></label>
      <small class="muted">Один балл считается по шкале от 0 до 100. ${exam.kind === 'Пересдача' ? 'Можно указать «Зачтено» или «Не зачтено». ' : ''}При отсутствии студента укажите «Неявка».</small>`;
  }
  const options = ['Зачтено', 'Не зачтено', 'Неявка'];
  return `<label>Результат<select name="result" required><option value="">Выберите результат</option>
    ${options.map((item) => `<option${item === value ? ' selected' : ''}>${item}</option>`).join('')}</select></label>`;
}

function resultSheet(exam, classroom, records, csrf, error, selected, submitted) {
  return `<div class="academic-screen">${backLink(basePath, 'К итогам сессии')}${intro(classroom.course.name, examDetails(exam))}
    <div class="record-list">${classroom.learners.map(({ id, fullName }) => {
      const current = records.get(id);
      const value = selected === id && submitted !== undefined ? submitted : current?.draft ?? '';
      return `<form class="panel detail-panel staff-form" id="${rowId(id)}" method="post" action="${basePath}/${exam.id}#${rowId(id)}">
        <input type="hidden" name="csrf" value="${escape(csrf)}">
        <input type="hidden" name="student" value="${escape(id)}">
        <input type="hidden" name="revision" value="${current?.revision ?? 0}">
        <h2>${escape(fullName)}</h2>
        ${current?.published ? `<p>${badge('Опубликовано', 'mint')} ${escape(current.published)}</p>` : `<p>${badge('Ожидает публикации', 'neutral')}</p>`}
        ${current && current.draft !== current.published ? '<p class="muted">Черновик сохранён.</p>' : ''}
        ${selected === id && error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
        ${resultField(exam, value)}<div class="staff-actions">
        <button class="button-secondary" type="submit" name="action" value="draft">Сохранить черновик</button>
        <button class="button" type="submit" name="action" value="publish">Опубликовать результат</button></div></form>`;
    }).join('')}</div></div>`;
}

function readResult(kind, value) {
  const named = ['Зачтено', 'Не зачтено', 'Неявка'].find((item) => item.toLowerCase() === value.toLowerCase());
  if (kind === 'Зачёт' || kind === 'Пересдача' && named) return named;
  if (named === 'Неявка') return named;
  const score = /^(\d{1,4})(?:\s*\/\s*(\d{1,4}))?$/.exec(value);
  if (!score) return;
  const points = Number(score[1]);
  const maximum = score[2] === undefined ? 100 : Number(score[2]);
  if (maximum < 1 || maximum > 1000 || points > maximum) return;
  return score[2] === undefined ? String(points) : `${points} / ${maximum}`;
}

export function teacherSessionRoute({ path, form, store, date, csrf }, classrooms) {
  const classroomFor = (exam) => classrooms.find(({ group, id }) => group === exam.group_name && id === exam.course_id);
  if (path === basePath && !form) {
    const entries = [...new Set(classrooms.map(({ group }) => group))].flatMap((group) => store.sessionExams(group))
      .map((exam) => ({ exam, classroom: classroomFor(exam) })).filter(({ classroom }) => classroom)
      .sort((a, b) => a.exam.day.localeCompare(b.exam.day) || a.exam.time.localeCompare(b.exam.time));
    return { title: 'Итоги сессии', body: sessionRows(entries) };
  }
  const id = /^\/staff\/teaching\/session\/([a-f0-9]{24})$/.exec(path)?.[1];
  const exam = id && store.sessionExam(id);
  const classroom = exam && classroomFor(exam);
  if (!classroom) return null;
  const student = form?.get('student');
  const show = (status = 200, error, value) => ({ title: 'Итоги сессии', status,
    body: resultSheet(exam, classroom, new Map(store.sessionResults(id).map((row) => [row.student_id, row])), csrf, error, student, value) });
  if (!form) return show();
  if (!classroom.learners.some(({ id }) => id === student)) return null;
  const action = form.get('action');
  const value = String(form.get('result') ?? '').trim().slice(0, 25);
  const result = readResult(exam.kind, value);
  if (!result || !['draft', 'publish'].includes(action)) {
    return show(422, 'Проверьте результат. Балл должен быть от нуля до максимума. Для зачёта выберите результат из списка.', value);
  }
  const revision = form.get('revision') ?? '';
  if (!/^\d{1,15}$/.test(revision) || !store.saveSessionResult(id, student, result, Number(revision), action === 'publish', date)) {
    return show(409, 'Результат уже изменился. Проверьте актуальное значение перед сохранением.');
  }
  return { redirect: path + '#' + rowId(student) };
}
