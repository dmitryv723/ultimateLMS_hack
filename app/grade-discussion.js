import { markdownContent } from './markdown.js';
import { formatToolbar } from './format-toolbar.js';
import { escape } from './layout.js';
import { newSubmissionKey, validSubmissionKey } from './services.js';

export function readGradeComment(form) {
  const raw = form.get('comment');
  const comment = typeof raw === 'string' ? raw.trim() : '';
  const key = form.get('submission');
  return { comment, key, valid: Boolean(comment && comment.length <= 2000 && validSubmissionKey(key)) };
}

export function gradeDiscussion({ messages, action, csrf, id, student, teacherView, error, open }) {
  return `<details id="${id}" class="grade-discussion"${open || error ? ' open' : ''}>
    <summary>${messages.length ? 'Обсуждение оценки (' + messages.length + ')' : teacherView ? 'Обсуждение оценки' : 'Задать вопрос об оценке'}</summary>
    ${messages.length ? `<ul>${messages.map(({ author_id, comment }) =>
      `<li><strong>${teacherView ? author_id === student ? 'Студент' : 'Вы' : author_id === student ? 'Вы' : 'Преподаватель'}</strong>${markdownContent(comment)}</li>`).join('')}</ul>` : ''}
    ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
    <form class="staff-form" method="post" action="${escape(action)}">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      <input type="hidden" name="submission" value="${newSubmissionKey()}">
      <label>Комментарий${formatToolbar(id + '-comment')}<textarea id="${escape(id)}-comment" name="comment" rows="2" maxlength="2000" required></textarea></label>
      <button class="button-secondary" type="submit">Отправить комментарий</button>
    </form>
  </details>`;
}
