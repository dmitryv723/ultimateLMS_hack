import { markdownContent } from './markdown.js';
import { formatToolbar } from './format-toolbar.js';
import { studentWork, workKey } from './fixtures.js';
import { escape, icon } from './layout.js';
import { hasOnlineHomework } from './courses.js';
import { hasAttachment, publicationAccept, publicationFileLimit, readAttachment } from './publication.js';
import { newSubmissionKey, validSubmissionKey } from './services.js';

const maximumFiles = 4;
const answerTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });

export function answerableHomework(student, courseId) {
  return studentWork(student).filter((work) =>
    work.courseId === courseId && hasOnlineHomework(work));
}

export async function readHomeworkAnswer(form) {
  const raw = form.get('answer');
  const body = typeof raw === 'string' ? raw.trim() : '';
  const key = form.get('submission');
  const uploaded = form.getAll('attachment').filter(hasAttachment);
  const problem = (error) => ({ error, body });
  if (!validSubmissionKey(key) || body.length > 5000 || (!body && !uploaded.length)) {
    return problem('Напишите ответ до 5000 символов или прикрепите файл.');
  }
  if (uploaded.length > maximumFiles || uploaded.reduce((total, file) => total + file.size, 0) > publicationFileLimit) {
    return problem('Прикрепите до 4 файлов общим размером до 10 МБ.');
  }
  const files = [];
  for (const upload of uploaded) {
    const file = await readAttachment(upload);
    if (file.error) return problem(file.error);
    files.push(file);
  }
  return { body, files, key };
}

export const previewableHomeworkFile = (mime) =>
  ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/markdown', 'text/csv'].includes(mime);

export function homeworkAnswerContent(answer, previews = false) {
  if (!answer) return '';
  return `<small>Отправлено ${escape(answerTime.format(new Date(answer.sent_at.replace(' ', 'T') + 'Z')))} МСК</small>
    ${answer.body ? markdownContent(answer.body) : ''}
    ${answer.files.length ? `<ul class="staff-records answer-files">${answer.files.map(({ id, filename, mime }) =>
      `<li><a class="home-link" href="/homework-files/${id}">${icon('download')}${escape(filename)}</a>
        ${previews && previewableHomeworkFile(mime) ? `<a class="home-link" href="/homework-files/${id}?view=1" target="_blank" rel="noopener"
          aria-label="Посмотреть файл ${escape(filename)}">Посмотреть файл ${icon('arrow')}</a>` : ''}</li>`).join('')}</ul>` : ''}`;
}

export function homeworkAnswersView(store, student, courseId, csrf, failed = {}) {
  return new Map(answerableHomework(student, courseId).map((work) => {
    const answer = store.homeworkAnswer(student.id, student.group, courseId, workKey(work));
    const error = failed.id === work.id && failed.error;
    const action = '/homework/' + courseId + '/' + encodeURIComponent(work.id);
    return [work.id, { submitted: Boolean(answer), html: `<section class="assignment-answer"><h3>${answer ? 'Ваш ответ' : 'Сдать задание'}</h3>
      ${homeworkAnswerContent(answer)}
      ${answer?.reviewed_score ? `<p><strong>Оценка:</strong> ${escape(answer.reviewed_score)}</p>` : ''}
      ${answer?.feedback ? `<h4>Комментарий преподавателя</h4>${markdownContent(answer.feedback)}` : ''}
      <form class="staff-form" action="${action}" method="post" enctype="multipart/form-data">
        <input type="hidden" name="csrf" value="${escape(csrf)}">
        <input type="hidden" name="submission" value="${newSubmissionKey()}">
        ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
        <label>Ответ${formatToolbar('homework-answer-text')}<textarea id="homework-answer-text" name="answer" maxlength="5000" rows="4">${escape(error ? failed.body ?? '' : answer?.body ?? '')}</textarea></label>
        <label>Файлы<input name="attachment" type="file" accept="${publicationAccept}" multiple>
          <small>До 4 файлов, всего до 10 МБ${answer ? '. При повторной сдаче выберите файлы для новой версии.' : '.'}</small></label>
        <button class="button" type="submit">${answer ? 'Отправить новую версию' : 'Отправить ответ'}${icon('arrow')}</button>
      </form>
    </section>` }];
  }));
}
