import { shortDate, students } from './fixtures.js';
import { backLink, escape, icon, iconTile, intro } from './layout.js';
import { markdownContent } from './markdown.js';
import { formatToolbar } from './format-toolbar.js';
import { newSubmissionKey, validSubmissionKey } from './services.js';

const staffPath = '/staff/announcements';
const studentPath = '/announcements';
const groups = new Set(students.map(({ group }) => group));
const courses = new Map(students.flatMap(({ subjects }) => subjects.map(({ id, name }) => [id, name])));
const moscowClock = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const announcementAudience = ({ scope, target }) => scope === 'group' ? 'Группа ' + target : courses.get(target) ?? target;

function announcementList(rows, office) {
  return `<div class="academic-screen">${intro('Объявления')}
    ${office ? `<div class="staff-actions"><a class="button" href="${staffPath}/new">Создать объявление</a></div>` : ''}
    ${rows.length ? `<div class="feed">${rows.map((row) => {
      const content = `${iconTile('megaphone', 'violet')}<div><div class="feed-caption">${escape(announcementAudience(row))} ·
        <time datetime="${escape(row.published_at)}">${shortDate(row.published_at.slice(0, 10))}</time></div><h2>${escape(row.title)}</h2>`;
      return office ? `<article class="panel feed-item">${content}${markdownContent(row.body)}</div></article>`
        : `<a class="panel feed-item" href="${studentPath}/${row.id}">${content}</div>${icon('chevron')}</a>`;
    }).join('')}</div>` : '<p class="panel grade-empty">Объявлений пока нет.</p>'}
  </div>`;
}

function announcementForm(fields, csrf, error) {
  const option = (value, label) => `<option value="${escape(value)}"${value === fields.audience ? ' selected' : ''}>${escape(label)}</option>`;
  return `<div class="detail">${backLink(staffPath, 'К объявлениям')}${intro('Создать объявление')}
    <form method="post" action="${staffPath}/new" class="panel detail-panel staff-form">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      <input type="hidden" name="submission" value="${validSubmissionKey(fields.key) ? fields.key : newSubmissionKey()}">
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      <label>Получатели<select name="audience" required><option value="">Выберите группу или курс</option>
        <optgroup label="Группы">${[...groups].map((group) => option('group:' + group, group)).join('')}</optgroup>
        <optgroup label="Курсы">${[...courses].map(([id, name]) => option('course:' + id, name)).join('')}</optgroup>
      </select><small>Объявление для курса увидят все студенты, у которых он есть в списке активных дисциплин.</small></label>
      <label>Заголовок<input name="title" maxlength="120" value="${escape(fields.title ?? '')}" required></label>
      <label>Текст объявления${formatToolbar('announcement-body')}<textarea id="announcement-body" name="body" rows="6" maxlength="3000" required>${escape(fields.body ?? '')}</textarea></label>
      <button class="button" type="submit">Опубликовать</button>
    </form></div>`;
}

export function officeAnnouncementRoute({ path, store, form, csrf, person, date }) {
  if (path === staffPath && !form) return { title: 'Объявления', body: announcementList(store.officeAnnouncements(), true) };
  if (path !== staffPath + '/new') return null;
  const show = (fields, error, status = 200) => ({ title: 'Создать объявление', body: announcementForm(fields, csrf, error), status });
  if (!form) return show({});
  const value = (field) => String(form.get(field) ?? '').trim();
  const fields = { audience: value('audience'), title: value('title'), body: value('body'), key: value('submission') };
  const [scope, target] = fields.audience.split(':');
  const validAudience = fields.audience === `${scope}:${target}` &&
    (scope === 'group' && groups.has(target) || scope === 'course' && courses.has(target));
  if (!validAudience) return show(fields, 'Выберите группу или курс из списка.', 422);
  if (!fields.title || fields.title.length > 120 || !fields.body || fields.body.length > 3000 || !validSubmissionKey(fields.key)) {
    return show(fields, 'Заполните заголовок до 120 символов и текст до 3000 символов.', 422);
  }
  store.publishAnnouncement(fields.key, { ...fields, scope, target }, person.id, `${date}T${moscowClock.format(new Date())}+03:00`);
  return { redirect: staffPath };
}

export function learnerAnnouncementRoute(path, store, student) {
  if (path === studentPath) return { title: 'Объявления', body: announcementList(store.studentAnnouncements(student), false) };
  const id = /^\/announcements\/([a-f0-9]{24})$/.exec(path)?.[1];
  const entry = id && store.studentAnnouncement(student, id);
  if (!entry) return null;
  return { title: entry.title, body: `<div class="detail">${backLink(studentPath, 'К объявлениям')}
    ${intro(entry.title, `${announcementAudience(entry)} · ${shortDate(entry.published_at.slice(0, 10))}`)}
    <article class="panel detail-panel">${markdownContent(entry.body)}</article></div>` };
}
