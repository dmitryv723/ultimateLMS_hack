import { markdownContent } from './markdown.js';
import { formatToolbar } from './format-toolbar.js';
import { escape, icon, intro, tabs } from './layout.js';
import { courseHref } from './courses.js';
import { newSubmissionKey, validSubmissionKey } from './services.js';

const courseChatTime = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow'
});

export function courseChat(messages, action, csrf, error = '', title = 'Чат курса') {
  return `<section class="course-chat">
    <h2>${escape(title)}</h2>
    ${messages.length ? `<ol class="chat-history">${messages.map(({ author_name, sent_at, message }) => `<li>
      <header><strong>${escape(author_name)}</strong><time>${courseChatTime.format(new Date(sent_at.replace(' ', 'T') + 'Z'))}</time></header>
      ${markdownContent(message)}</li>`).join('')}</ol>` : '<p class="muted">В этом чате пока нет сообщений.</p>'}
    <form class="staff-form chat-form" method="post" action="${escape(action)}">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      <input type="hidden" name="submission" value="${newSubmissionKey()}">
      <label>Сообщение${formatToolbar('chat-message')}<textarea id="chat-message" name="message" rows="3" maxlength="1000" required></textarea><small>Enter — отправить · Shift + Enter — новый абзац</small></label>
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      <button class="button" type="submit">Отправить${icon('arrow')}</button>
    </form></section>`;
}

export function readCourseMessage(form) {
  const message = (form.get('message') || '').trim();
  const key = form.get('submission');
  return { message, key, valid: Boolean(message && message.length <= 1000 && validSubmissionKey(key)) };
}

export function learnerCourseChat(courseId, messages, action, csrf, teacherName, personal, error = '') {
  return `${teacherName ? tabs('Чаты курса', [
    ['group', 'Общий чат', escape(courseHref(courseId, 'chat'))],
    ['private', 'Личный чат с преподавателем', escape(courseHref(courseId, 'chat', 'private'))]
  ], personal ? 'private' : 'group') : ''}
  ${personal ? `<p class="muted">${escape(teacherName)}</p>` : ''}
  ${courseChat(messages, action, csrf, error, personal ? 'Личный чат' : 'Чат курса')}`;
}

export function chatList(title, links, empty) {
  return `<section class="panel staff-section"><h2>${escape(title)}</h2>
    ${links.length ? `<ul class="staff-records staff-topic-list">${links.map(({ name, href, context }) =>
      `<li><a href="${escape(href)}"><span><strong>${escape(name)}</strong>${context ? `<small>${escape(context)}</small>` : ''}</span>
      ${icon('chevron')}</a></li>`).join('')}</ul>` : `<p class="muted">${escape(empty)}</p>`}</section>`;
}

export function learnerChatIndex(student, contacts = []) {
  return `${intro('Чаты')}${chatList('Чаты курсов', student.subjects.map(({ id, name }) =>
    ({ name, href: courseHref(id, 'chat'), context: student.group })), 'Нет активных курсов.')}
    ${chatList('Личные чаты', contacts, 'У ваших курсов пока нет преподавателей, доступных в чате.')}`;
}
