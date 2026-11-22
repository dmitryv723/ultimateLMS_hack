import { markdownContent } from './markdown.js';
import { addDays, studentWork, shortDate, workKey } from './fixtures.js';
import { backLink, escape, icon, intro } from './layout.js';
import { sampleCourseMaterials, topicsForCourse, topicTitle, usesTeachingMaterials } from './teaching-catalog.js';
import { subjectSyllabus, syllabusBackLink } from './syllabus.js';

const courseIcons = {
  statistics: 'chart', micro: 'trend', english: 'book', product: 'grid',
  negotiations: 'chat', history: 'book', geography: 'globe', culture: 'people',
  sql: 'grid', probability: 'chart', ai: 'study', matrices: 'grid',
  law: 'book', economics: 'trend', policy: 'globe', translation: 'chat'
};

export function courseHasPreview(student, courseId) {
  return usesTeachingMaterials(courseId) || (student.group === 'БА-24' && courseId === 'english');
}

export function courseHref(courseId, tab, item) {
  const query = new URLSearchParams();
  if (tab) query.set('tab', tab);
  if (item) query.set('item', item);
  return '/courses/' + courseId + (query.size ? '?' + query : '');
}

export const courseIcon = (courseId) => icon(courseIcons[courseId] || 'study');
export const studentCourse = (student, courseId) =>
  student.subjects.find(({ id }) => id === courseId) || student.archivedSubjects.find(({ id }) => id === courseId);
export const hasOnlineHomework = ({ kind, id, external }) => kind === 'homework' && Boolean(id) && !external;

export function courseCatalogPage(student, archived) {
  const name = archived ? 'Архивные курсы' : 'Активные курсы';
  const courses = archived ? student.archivedSubjects : student.subjects;
  return `<div class="academic-screen">${intro(name)}
    <div class="panel catalog-list"><table aria-label="${name}">
      <thead><tr><th scope="col">Курс</th><th scope="col">${archived ? 'Семестр закрытия' : 'Текущий семестр'}</th></tr></thead>
      <tbody>${courses.map((course) => `<tr><th scope="row"><a href="${courseHref(course.id)}">${courseIcon(course.id)}${escape(course.name)}</a></th>
        <td>${archived ? course.closedSemester : student.year * 2 - 1}-й</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

function courseEntry(title, meta, content, open = false, anchor = '') {
  return `<details class="course-entry"${open ? ' open' : ''}${anchor ? ` id="${escape(anchor)}"` : ''}>
    <summary><span><strong>${escape(title)}</strong>${meta ? `<small>${escape(meta)}</small>` : ''}</span>${icon('chevron')}</summary>
    <div class="course-entry-body">${content}</div>
  </details>`;
}

export const courseFileHref = (id) => '/course-files/' + id;
const attachmentLink = (id, filename) => `<a class="home-link" href="${courseFileHref(id)}">${icon('download')}${escape(filename)}</a>
  ${/\.md$/i.test(filename) ? `<a class="home-link" href="${courseFileHref(id)}?view=1" target="_blank" rel="noopener">Открыть Markdown</a>` : ''}`;
const publicationText = (description, instructions, attachment, id) => `
  ${description ? markdownContent(description) : ''}
  ${instructions ? markdownContent(instructions) : ''}
  ${attachment ? attachmentLink(id, attachment) : ''}`;

function materialEntries(student, course, topic) {
  const files = (student.courseFiles || []).filter(({ course_id, kind, topic_id }) =>
    course_id === course.id && kind === 'material' && topic_id === topic);
  const sample = sampleCourseMaterials.get(course.id + '/' + topic);
  return [...(sample ? [courseEntry(sample.title, sample.label, sample.html)] : []), ...files.map(({ id, title, filename, description }) =>
    courseEntry(title, '', publicationText(description, '', filename, id)))];
}

const courseWorkItem = (work) => work.id || workKey(work);
const courseWorkAnchor = (work) => 'work-' + courseWorkItem(work);
const courseWorkLink = (work) => courseHref(work.courseId, 'topics', courseWorkItem(work)) +
  '#' + encodeURIComponent(courseWorkAnchor(work));
const moscowClock = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });

function topicWorkEntry(course, work, today, answers, selected) {
  const { title, kind, offset, time, room, description, instructions, attachment, id } = work;
  const deadline = shortDate(addDays(today, offset)) + ', ' + time;
  const meta = kind === 'homework' ? 'Сдать до ' + deadline : [deadline, room].filter(Boolean).join(' · ');
  const answer = kind === 'homework' ? answers?.get(id) : null;
  const channel = work.external && course.submission ? `<p>${escape(course.submission)}</p>` : '';
  return courseEntry(title, meta, publicationText(description, instructions, attachment, id) + (answer?.html || '') + channel,
    work === selected, courseWorkAnchor(work));
}

function courseTopics(student, course, today, works, answers, selected) {
  const topics = topicsForCourse(course.id);
  return topics.map(([topic, label]) => {
    const materials = materialEntries(student, course, topic);
    const items = works.filter((work) => (work.topic ?? 'general') === topic);
    if (!materials.length && !items.length) return '';
    const ordered = [...items.filter(({ kind }) => kind === 'homework'), ...items.filter(({ kind }) => kind === 'test')];
    return `<details class="panel course-topic course-topic-row" id="topic-${topic}"${items.includes(selected) ? ' open' : ''}>
      <summary>${icon('book')}<strong>${escape(label)}</strong>${icon('chevron')}</summary>
      <div class="course-entries">${materials.join('')}${ordered.map((work) =>
        topicWorkEntry(course, work, today, answers, selected)).join('')}</div>
    </details>`;
  }).join('') || '<p class="muted">Темы пока не опубликованы.</p>';
}

function courseSidebar(student, course, today, works, answers, active) {
  const grades = new Set(student.grades.filter(([name, , result]) => name === course.name && result)
    .map(([, title, , , activityKey]) => workKey({ title, activityKey })));
  const now = today + 'T' + moscowClock.format(new Date());
  const due = (work) => addDays(today, work.offset) + 'T' + work.time;
  const remaining = works.filter((work) => work.kind === 'homework' && !answers?.get(work.id)?.submitted && !grades.has(workKey(work)))
    .sort((first, second) => due(first).localeCompare(due(second)));
  const upcoming = remaining.find((work) => due(work) >= now);
  const overdue = !upcoming && remaining.at(-1);
  const next = upcoming || overdue;
  return `<aside class="course-side" aria-label="Сведения о курсе">
    <a class="panel course-side-link" href="${course.id === 'statistics' ? courseHref(course.id, 'syllabus') : '/syllabus?view=subject&amp;subject=' + encodeURIComponent(course.id)}"${active === 'syllabus' ? ' aria-current="page"' : ''}>
      ${icon('file')}<strong>Силлабус</strong>${icon('chevron')}</a>
    <section class="panel course-deadline"><h2>Ближайший дедлайн</h2>
      ${!upcoming ? '<p class="muted">Нет предстоящих дедлайнов.</p>' : ''}
      ${next ? `<div class="course-deadline-item">
        ${overdue ? '<small>Просрочено</small>' : ''}
        <strong>${escape(next.title)}</strong>
        <time datetime="${due(next)}+03:00">${escape(shortDate(addDays(today, next.offset)) + ', ' + next.time)} МСК</time>
      </div><a class="button-secondary" href="${escape(courseWorkLink(next))}">Открыть задание</a>` : ''}
    </section>
    <a class="panel course-side-link" href="${courseHref(course.id, 'chat')}"${active === 'chat' ? ' aria-current="page"' : ''}>
      ${icon('chat')}<strong>Чат курса</strong>${icon('chevron')}</a>
  </aside>`;
}

function courseResults(rows) {
  return `<ul class="course-results">
    ${rows.map(([title, context, result]) => `<li>
      <span><strong>${escape(title)}</strong><small>${escape(context)}</small></span>
      <span class="course-result-value">${escape(result)}</span>
    </li>`).join('')}
  </ul>`;
}

function coursePostedResults(student, course, today) {
  const grades = student.grades
    .filter(([name, , result]) => name === course.name && result)
    .map(([, title, result, unit]) => [title, unit ? 'Баллы' : 'Результат', result]);
  const attestations = student.exams
    .filter(([name, , offset, , , result]) => name === course.name && offset < 0 && result)
    .map(([, title, offset, , , result]) => [title, 'Итоговая аттестация · ' + shortDate(addDays(today, offset)), result]);
  return courseResults([...grades, ...attestations]);
}

function homeworkRows(student, today, items, archived, linked = true) {
  if (!items.length) return '<p class="panel grade-empty">Домашних заданий в этом списке пока нет.</p>';
  return `<ul class="panel homework-list">${items.map((item) => {
    const course = studentCourse(student, item.courseId);
    const href = archived ? courseHref(course.id)
      : courseHref(course.id, hasOnlineHomework(item) ? 'assignments' : undefined, item.id);
    const day = addDays(today, item.offset);
    const row = `${linked ? `<span class="homework-course">${escape(course.name)}</span>` : ''}<span><strong>${escape(item.title)}</strong>
      ${archived ? `<small>${escape(item.result ? item.status + ' · ' + item.result : item.status)}</small>` : ''}</span>
      <span class="homework-meta"><time datetime="${day}T${item.time}+03:00">${escape(shortDate(day))}, ${item.time}</time></span>`;
    return `<li>${linked ? `<a href="${escape(href)}">${row}</a>` : `<div>${row}</div>`}</li>`;
  }).join('')}</ul>`;
}

export function homeworkPage(student, today, archived, date = '') {
  const items = archived ? student.archivedHomework : studentWork(student).filter(({ kind, offset }) =>
    kind === 'homework' && (!date || addDays(today, offset) === date));
  const sorted = [...items].sort((first, second) => archived ? second.offset - first.offset : first.offset - second.offset);
  return `<div class="academic-screen">${intro(archived ? 'Архивные задания' : 'Активные задания', date ? shortDate(date) : '')}
    ${sorted.length ? '<div class="homework-columns" aria-hidden="true"><span>Курс</span><span>Задание</span><span>Дедлайн</span></div>' : ''}
    ${homeworkRows(student, today, sorted, archived)}</div>`;
}

export function coursePage(student, course, today, selectedTab, selectedItem, chat = '', answers) {
  const gradeOnly = !usesTeachingMaterials(course.id) && courseHasPreview(student, course.id);
  const works = studentWork(student).filter(({ courseId }) => courseId === course.id);
  const selected = works.find((work) => courseWorkItem(work) === selectedItem) ??
    (selectedTab === 'tests' ? works.find(({ kind }) => kind === 'test')
      : selectedTab === 'assignments' ? works.find(({ kind }) => kind === 'homework') : null);
  const archived = student.archivedHomework.filter(({ courseId }) => courseId === course.id);
  const isChat = !course.archived && selectedTab === 'chat';
  const isSyllabus = course.id === 'statistics' && selectedTab === 'syllabus';
  let content;
  if (isChat) content = backLink(courseHref(course.id), 'К темам курса') + chat;
  else if (course.archived) content = homeworkRows(student, today, archived, true, false);
  else if (isSyllabus) content = `<nav class="syllabus-breadcrumbs" aria-label="Навигация по силлабусу">${syllabusBackLink(courseHref(course.id))}</nav>${subjectSyllabus(course, student)}`;
  else if (gradeOnly) content = coursePostedResults(student, course, today);
  else content = courseTopics(student, course, today, works, answers, selected);

  return `${isChat ? backLink('/chats', 'К списку чатов') : backLink(course.archived ? '/courses/archive' : '/#course-' + course.id, course.archived ? 'Архивные курсы' : 'Мои курсы')}
    <header class="course-heading">
      <span class="course-heading-icon">${courseIcon(course.id)}</span>
      <div><h1>${escape(course.name)}</h1>
        ${course.archived ? `<p>Архив · ${escape(course.semester)}</p>` :
          gradeOnly ? '<p>В LMS доступны только опубликованные результаты</p>' : ''}</div>
    </header>
    <div class="course-layout">
      <div class="course-main${isChat || isSyllabus ? ' course-content' : ''}">${content}</div>
      ${course.archived ? '' : courseSidebar(student, course, today, works, answers, selectedTab)}
    </div>`;
}
