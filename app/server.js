import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { deliveryNames, lessonsFor, today, validDate, weekStart, addDays, workKey } from './fixtures.js';
import { openStore, sessionLifetime } from './store.js';
import { backLink, escape, errorPage, intro, loginPage, page, resetPasswordPage, staffPage } from './layout.js';
import { lessonPage, notificationPage, notificationsPage, schedulePage } from './timetable.js';
import { notificationItems } from './notifications.js';
import { categoryForm, certificateForm, certificateText, isCertificateService, isRequestClosed, legacyServiceLinks, newSubmissionKey, readCategoryRequest, readServiceRequest, requestCategories, requestPage, serviceForm, serviceScenarios, servicesPage, validSubmissionKey } from './services.js';
import { courseGradesPage, profilePage, studyPage, validProfileCorrectionField } from './academic.js';
import { homePage, readReminder } from './home.js';
import { courseCatalogPage, courseHref, coursePage, homeworkPage, studentCourse } from './courses.js';
import { universitySyllabus } from './syllabus.js';
import { courseChat, learnerChatIndex, learnerCourseChat, readCourseMessage } from './course-chat.js';
import { learnerChatTeachers, peopleById, studentData, teacherForCourse } from './people.js';
import { markdownContent } from './markdown.js';
import { publicationFileLimit } from './publication.js';
import { staffHomePath, staffNavigation } from './staff.js';
import { staffRoute } from './staff-routes.js';
import { learnerAnnouncementRoute } from './announcements.js';
import { eventCalendarFile, eventList, eventNow, eventStarted, learnerEvent } from './events.js';
import { learnerConsultations } from './consultations.js';
import { gradeActivityId } from './staff-store.js';
import { gradeDiscussion, readGradeComment } from './grade-discussion.js';
import { accountNotices } from './account-notifications.js';
import { answerableHomework, homeworkAnswersView, previewableHomeworkFile, readHomeworkAnswer } from './homework-answer.js';

const style = readFileSync(new URL('./public/style.css', import.meta.url));
const interfaceScript = readFileSync(new URL('./public/interface.js', import.meta.url));
const cookieName = 'dean_session';

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
}
function redirect(res, path, status = 303) {
  res.writeHead(status, { Location: path }).end();
}
function sessionCookie(token, maxAge, secure) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function sessionToken(req) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + '='));
  const token = cookie?.slice(cookieName.length + 1);
  return token && /^[\w-]{43}$/.test(token) ? token : '';
}
function safeNext(value) {
  return value && /^\/(?:\?|$|(?:courses|homework|schedule|events|syllabus|study|services|notifications|profile|staff|chats|announcements)(?=[/?]|$))/.test(value) &&
    !/[\\\r\n]/.test(value) ? value : '/';
}

class FormError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function readForm(req, origin, acceptsFiles = false) {
  if (req.headers.origin !== origin) throw new FormError(403, 'Не удалось подтвердить источник запроса.');
  const type = req.headers['content-type'] || '';
  const multipart = acceptsFiles && type.split(';')[0] === 'multipart/form-data';
  if (!multipart && type.split(';')[0] !== 'application/x-www-form-urlencoded') {
    throw new FormError(415, 'Форма отправлена в неподдерживаемом формате.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > (multipart ? publicationFileLimit + 64 * 1024 : 36_000)) {
      req.resume();
      throw new FormError(413, multipart ? 'Файл слишком большой. Выберите файл размером до 10 МБ.' : 'Форма слишком большая.');
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  if (!multipart) return new URLSearchParams(body.toString('utf8'));
  try {
    return await new Response(body, { headers: { 'Content-Type': type } }).formData();
  } catch {
    throw new FormError(400, 'Не удалось прочитать файл. Выберите файл снова.');
  }
}
function verifyCsrf(form, session) {
  const token = form.get('csrf') || '';
  if (typeof token !== 'string' || token.length !== session.csrf.length || !/^[\w-]+$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrf))) {
    throw new FormError(403, 'Сеанс устарел. Откройте страницу заново.');
  }
}

function learnerChat(store, student, courseId, personal, csrf, error) {
  const teacher = teacherForCourse(student, courseId);
  const messages = personal ? store.privateCourseMessages(teacher.id, student.id)
    : store.courseMessages(student.group, courseId);
  return learnerCourseChat(courseId, messages, courseHref(courseId) + (personal ? '/chat/private' : '/chat'),
    csrf, teacher?.fullName, personal, error);
}

function markdownFilePreview(res, file) {
  if (file.attachment.length > 128 * 1024) return downloadAttachment(res, file);
  const title = escape(file.filename);
  return html(res, 200, `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title><link rel="stylesheet" href="/assets/style.css"><main class="markdown-preview">
    <h1>${title}</h1><hr>${markdownContent(Buffer.from(file.attachment).toString('utf8'))}</main></html>`);
}

function downloadAttachment(res, file, preview = false) {
  const filename = encodeURIComponent(file.filename).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16));
  const type = preview && file.mime.startsWith('text/') ? 'text/plain; charset=utf-8' : file.mime;
  const disposition = preview ? 'inline' : 'attachment';
  return res.writeHead(200, { 'Content-Type': type, 'Content-Disposition': disposition + "; filename*=UTF-8''" + filename })
    .end(Buffer.from(file.attachment));
}

export function createApp(store, { publicOrigin } = {}) {
  const external = publicOrigin ? new URL(publicOrigin) : null;
  if (external && (external.protocol !== 'https:' || external.origin !== publicOrigin)) {
    throw new Error('DEAN_PUBLIC_ORIGIN должен содержать HTTPS origin без пути');
  }
  const secure = Boolean(external);
  let loginWindowExpires = 0;
  let loginAttempts = 0;
  let resetWindowExpires = 0;
  let resetAttempts = 0;

  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

    let student;
    try {
      const host = req.headers.host;
      const validHost = external ? host?.toLowerCase() === external.host.toLowerCase() : /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host || '');
      if (!validHost || !req.url?.startsWith('/') ||
          req.url.startsWith('//') || req.url.includes('\\')) {
        return html(res, 400, errorPage(null, 'Некорректный адрес', 'Откройте кабинет по локальному адресу.'));
      }
      const origin = external?.origin ?? 'http://' + host.toLowerCase();
      const { pathname, search, searchParams } = new URL(req.url, origin);
      const method = req.method;
      if (method !== 'GET' && method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return html(res, 405, errorPage(null, 'Метод запроса недоступен'));
      }
      if (pathname === '/assets/style.css' && method === 'GET') {
        return res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }).end(style);
      }
      if (pathname === '/assets/interface.js' && method === 'GET') {
        return res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(interfaceScript);
      }

      const token = sessionToken(req);
      const session = store.session(token);
      const person = session && peopleById.get(session.student_id);
      if (pathname === '/login') {
        if (method === 'GET') {
          const next = safeNext(searchParams.get('next'));
          return person ? redirect(res, person.role && !next.startsWith('/staff') ? staffHomePath(person.role) : next, 302) : html(res, 200,
            loginPage(next, '', '', searchParams.has('reset') ? 'Пароль обновлён. Войдите с новым паролем.' : ''));
        }
        const form = await readForm(req, origin);
        const login = (form.get('login') || '').trim().toLowerCase();
        const password = form.get('password') || '';
        const next = safeNext(form.get('next'));
        const now = Date.now();
        if (now >= loginWindowExpires) {
          loginWindowExpires = now + 60_000;
          loginAttempts = 0;
        }
        if (loginAttempts >= 16) {
          res.setHeader('Retry-After', String(Math.ceil((loginWindowExpires - now) / 1000)));
          return html(res, 429, loginPage(next, 'Слишком много попыток. Попробуйте через минуту.', login.slice(0, 64)));
        }
        loginAttempts += 1;
        const accountId = login.length <= 64 && password.length <= 128 && await store.authenticate(login, password);
        const account = accountId && peopleById.get(accountId);
        if (!account) return html(res, 401, loginPage(next, 'Проверьте логин и пароль.', login.slice(0, 64)));
        store.logout(token);
        res.setHeader('Set-Cookie', sessionCookie(store.createSession(accountId), sessionLifetime, secure));
        return redirect(res, account.role && !next.startsWith('/staff') ? staffHomePath(account.role) : next);
      }
      if (pathname === '/reset-password') {
        res.setHeader('Referrer-Policy', 'no-referrer');
        if (method === 'GET') return html(res, 200, resetPasswordPage());
        const form = await readForm(req, origin);
        const now = Date.now();
        if (now >= resetWindowExpires) {
          resetWindowExpires = now + 60_000;
          resetAttempts = 0;
        }
        if (resetAttempts >= 12) {
          res.setHeader('Retry-After', '60');
          return html(res, 429, resetPasswordPage('Слишком много попыток. Повторите через минуту.'));
        }
        resetAttempts += 1;
        const password = form.get('password') || '';
        if (password !== form.get('confirm') || password.length < 12 || password.length > 128) {
          return html(res, 422, resetPasswordPage('Пароли должны совпадать и содержать 12–128 символов.'));
        }
        if (!await store.resetPassword((form.get('code') || '').trim(), password)) {
          return html(res, 422, resetPasswordPage('Код недействителен или истёк. Запросите новый код у администратора.'));
        }
        res.setHeader('Set-Cookie', sessionCookie('', 0, secure));
        return redirect(res, '/login?reset=1');
      }

      if (!person) {
        if (method !== 'GET') return html(res, 401, errorPage(null, 'Войдите в кабинет'));
        const next = safeNext(pathname + search);
        return redirect(res, '/login' + (next === '/' ? '' : '?next=' + encodeURIComponent(next)), 302);
      }

      const date = today();
      if (method === 'POST' && pathname === '/logout') {
        verifyCsrf(await readForm(req, origin), session);
        store.logout(token);
        res.setHeader('Set-Cookie', sessionCookie('', 0, secure));
        return redirect(res, '/login');
      }
      const fileId = /^\/course-files\/([a-f0-9]{32})$/.exec(pathname)?.[1];
      if (fileId && method === 'GET') {
        const file = store.courseFile(fileId);
        const allowed = file?.filename && (person.role
          ? person.teaching?.some(({ group, courseId }) => group === file.group_name && courseId === file.course_id)
          : file.group_name === person.group &&
            person.subjects.some(({ id }) => id === file.course_id));
        if (!allowed) return html(res, 404, errorPage(null));
        if (searchParams.get('view') === '1' && file.mime === 'text/markdown') return markdownFilePreview(res, file);
        return downloadAttachment(res, file);
      }
      const answerFileId = /^\/homework-files\/([a-f0-9]{32})$/.exec(pathname)?.[1];
      if (method === 'GET' && answerFileId) {
        const file = store.homeworkAttachment(answerFileId);
        if (!file || (file.student_id !== person.id && !person.teaching?.some(({ group, courseId }) =>
          group === file.group_name && courseId === file.course_id))) return html(res, 404, errorPage(null));
        const preview = searchParams.get('view') === '1' && previewableHomeworkFile(file.mime);
        if (preview && file.mime === 'text/markdown') return markdownFilePreview(res, file);
        return downloadAttachment(res, file, preview);
      }
      const eventImageId = /^\/event-images\/([a-f0-9]{32})$/.exec(pathname)?.[1];
      if (method === 'GET' && eventImageId && (!person.role || person.role === 'office')) {
        const image = store.eventImage(eventImageId);
        if (!image) return html(res, 404, errorPage(null));
        return res.writeHead(200, { 'Content-Type': image.mime, 'Content-Length': image.contents.length }).end(Buffer.from(image.contents));
      }
      const issuedFileMatch = /^\/staff\/requests\/([a-z0-9-]{1,48})\/file$/.exec(pathname);
      if (method === 'GET' && issuedFileMatch) {
        const file = person.role === 'office' && store.certificateFile(issuedFileMatch[1]);
        if (!file) return html(res, 404, errorPage(null));
        return downloadAttachment(res, file);
      }
      const notices = accountNotices(store, person);
      if (person.role) {
        if (pathname === '/' && method === 'GET') return redirect(res, staffHomePath(person.role), 302);
        if (pathname !== '/staff' && !pathname.startsWith('/staff/')) return html(res, 403, errorPage(null, 'Доступ ограничен'));
        const acceptsFiles = person.role === 'teacher' && /^\/staff\/teaching\/publications\/[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-f0-9]{32}\/edit)?$/.test(pathname) ||
          (person.role === 'office' && (/^\/staff\/events\/(?:new|[a-z0-9-]{1,48})$/.test(pathname) ||
            /^\/staff\/requests\/[a-z0-9-]{1,48}$/.test(pathname)));
        let form = null;
        let formError;
        if (method === 'POST') {
          try {
            form = await readForm(req, origin, acceptsFiles);
          } catch (error) {
            if (!acceptsFiles || !(error instanceof FormError) || ![400, 413, 415].includes(error.status)) throw error;
            formError = error;
          }
        }
        if (form) verifyCsrf(form, session);
        const view = await staffRoute({ person, store, date, path: pathname, query: searchParams, csrf: session.csrf, form, formError, notices });
        if (view?.redirect) return redirect(res, view.redirect);
        const nav = staffNavigation(person.role, pathname);
        return html(res, view?.status ?? 404, staffPage(person, nav, view?.title ?? 'Раздел недоступен',
          view?.body ?? '<h1>Раздел недоступен</h1>', pathname, notices));
      }
      student = { ...studentData(store, person, date), accountNotices: notices };
      if (pathname === '/staff' || pathname.startsWith('/staff/')) return html(res, 403, errorPage(student, 'Доступ ограничен'));
      const service = pathname.startsWith('/services/new/') ? pathname.slice('/services/new/'.length) : '';
      const category = /^\/services\/categories\/([a-z]+)$/.exec(pathname)?.[1];
      const categoryConfig = Object.hasOwn(requestCategories, category) ? requestCategories[category] : null;
      const eventMatch = /^\/events\/([a-z0-9-]{1,48})(\/calendar\.ics)?$/.exec(pathname);
      const requestMatch = /^\/services\/requests\/([a-z0-9-]{1,48})(\/download)?$/.exec(pathname);
      const gradeRoute = /^\/study\/([a-z]+)\/grades\/([a-z]+)(?:\/comments\/([a-f0-9]{24}))?$/.exec(pathname);
      const gradeCourse = gradeRoute?.[1] === student.id && student.subjects.find(({ id }) => id === gradeRoute[2]);
      const gradeTeacher = gradeCourse && teacherForCourse(student, gradeCourse.id);
      const gradePath = gradeCourse && '/study/' + student.id + '/grades/' + gradeCourse.id;
      const gradeView = (status = 200, error = '') => {
        const discussion = gradeRoute[3] || searchParams.get('discussion');
        const type = searchParams.get('type');
        const question = (activityKey) => {
          if (!gradeTeacher || !store.hasAccount(gradeTeacher.id)) return '';
          const id = gradeActivityId(activityKey);
          const target = gradePath + '/comments/' + id;
          return gradeDiscussion({ messages: store.gradeComments(student.id, gradeTeacher.id, gradeCourse.id, activityKey),
            action: type ? target + '?type=' + encodeURIComponent(type) : target, csrf: session.csrf,
            id: 'grade-discussion-' + id, student: student.id, open: discussion === id, error: discussion === id ? error : '' });
        };
        return html(res, status, page(student, 'study', gradeCourse.name,
          courseGradesPage(student, gradeCourse, date, type, question), date));
      };
      const consultation = pathname === '/services/consultations' || pathname.startsWith('/services/consultations/');
      const renderConsultation = (form) => {
        const view = learnerConsultations({ person, store, date, path: pathname, query: searchParams, csrf: session.csrf, form });
        if (!view) return html(res, 404, errorPage(student));
        if (view.redirect) return redirect(res, view.redirect);
        return html(res, view.status, page(student, 'services', view.title, view.body, date));
      };
      const renderHome = (options, status = 200) => html(res, status, page(student, 'home', 'Мои курсы',
        homePage(student, date, store.remindersFor(student.id), session.csrf,
          { ...options, announcements: store.studentAnnouncements(student, 3) }), date));
      const personalChatId = /^\/chats\/private\/([a-z]+)$/.exec(pathname)?.[1];
      const personalContact = personalChatId && learnerChatTeachers(student, store).find(({ id }) => id === personalChatId);
      const renderDirectChat = (error, status = 200) => html(res, status, page(student, 'chats', personalContact.fullName,
        backLink('/chats', 'К списку чатов') + intro(personalContact.fullName) + '<div class="panel staff-section">' +
        courseChat(store.privateCourseMessages(personalContact.id, student.id), pathname, session.csrf, error, 'Личный чат') +
        '</div>', date));
      const answerRoute = /^\/homework\/([a-z]+)\/([a-z0-9-]+)$/.exec(pathname);
      if (method === 'POST') {
        if (answerRoute) {
          const [, courseId, workId] = answerRoute;
          const work = answerableHomework(student, courseId).find(({ id }) => id === workId);
          const course = student.subjects.find(({ id }) => id === courseId);
          if (!work || !course) return html(res, 404, errorPage(student));
          const show = (error, body, status) => html(res, status, page(student, 'course', course.name,
            coursePage(student, course, date, 'assignments', workId, '',
              homeworkAnswersView(store, student, courseId, session.csrf, { id: workId, error, body })), date));
          let form;
          try {
            form = await readForm(req, origin, true);
          } catch (error) {
            if (!(error instanceof FormError) || error.status === 403) throw error;
            return show(error.status === 413 ? 'Прикрепите до 4 файлов общим размером до 10 МБ.' : error.message, '', error.status);
          }
          verifyCsrf(form, session);
          const answer = await readHomeworkAnswer(form);
          if (answer.error) return show(answer.error, answer.body, 422);
          store.saveHomeworkAnswer(student, work, workKey(work), answer);
          return redirect(res, courseHref(courseId, 'assignments', workId));
        }
        const form = await readForm(req, origin);
        verifyCsrf(form, session);
        if (eventMatch && !eventMatch[2]) {
          const event = store.eventForStudent(student.id, eventMatch[1]);
          if (!event) return html(res, 404, errorPage(student));
          const action = form.get('action');
          if (['register', 'unregister'].includes(action)) {
            const now = eventNow(date);
            const registration = action === 'register';
            const saved = !eventStarted(event, now) && store.setEventRegistration(event.id, student.id, registration, now);
            const updated = store.eventForStudent(student.id, event.id);
            if (!saved || Boolean(updated.registered) !== registration) {
              return html(res, 409, page(student, 'events', updated.title,
                learnerEvent(updated, now, session.csrf, 'Регистрация уже закрыта.'), date));
            }
          } else if (['save', 'remove'].includes(action)) {
            store.setEventCalendar(event.id, student.id, action === 'save');
          } else {
            return html(res, 400, errorPage(student, 'Выберите действие для события.'));
          }
          return redirect(res, pathname);
        }
        if (gradeCourse && gradeRoute[3] && gradeTeacher && store.hasAccount(gradeTeacher.id)) {
          const grade = student.grades.find(([course, title, score, unit, activityKey]) => course === gradeCourse.name &&
            score && unit && gradeActivityId(workKey({ title, activityKey })) === gradeRoute[3]);
          if (!grade) return html(res, 404, errorPage(student));
          const comment = readGradeComment(form);
          if (!comment.valid) return gradeView(422, 'Введите комментарий длиной до 2000 символов.');
          store.postGradeComment(student.id, gradeTeacher.id, gradeCourse.id,
            workKey({ title: grade[1], activityKey: grade[4] }), student.id, comment);
          const query = new URLSearchParams({ discussion: gradeRoute[3] });
          if (searchParams.get('type')) query.set('type', searchParams.get('type'));
          return redirect(res, gradePath + '?' + query + '#grade-discussion-' + gradeRoute[3]);
        }
        if (pathname === '/profile/' + student.id) {
          const action = form.get('action');
          const profileError = (error) => html(res, 422, page(student, 'profile', 'Мой профиль',
            profilePage(student, session.csrf, error, action), date));
          if (action === 'display') {
            const name = (form.get('name') || '').trim();
            if (!name || name.length > 60 || /[\u0000-\u001f]/.test(name)) return profileError('Укажите имя длиной до 60 символов.');
            store.saveStudentDisplayName(student.id, name);
            return redirect(res, pathname + '#edit-profile');
          }
          if (action === 'correction') {
            const field = form.get('field');
            const { key, message, error } = readServiceRequest(form);
            if (error || !validProfileCorrectionField(student, field)) {
              return profileError(error || 'Выберите поле профиля.');
            }
            const id = store.createRequest(student.id, 'pickup', key, 'profile', field + ': ' + message);
            return redirect(res, '/services/requests/' + id);
          }
          return profileError('Выберите действие.');
        }
        if (pathname === '/notifications') {
          const requested = new Set(form.getAll('notice'));
          store.markNoticesSeen(student.id, notices.filter(({ key }) => requested.has(key)).map(({ key }) => key));
          return redirect(res, pathname);
        }
        if (personalContact) {
          const { message, key, valid } = readCourseMessage(form);
          if (!valid) return renderDirectChat('Введите сообщение длиной до 1000 символов.', 422);
          store.postPrivateCourseMessage(student, personalContact.id, student.id, message, key);
          return redirect(res, pathname);
        }
        if (consultation) return renderConsultation(form);
        const chatRoute = /^\/courses\/([a-z]+)\/chat(\/private)?$/.exec(pathname);
        const course = chatRoute && student.subjects.find(({ id }) => id === chatRoute[1]);
        if (course) {
          const personal = Boolean(chatRoute[2]);
          const teacher = personal ? teacherForCourse(student, course.id) : null;
          if (personal && !teacher) return html(res, 404, errorPage(student));
          const path = courseHref(course.id, 'chat', personal ? 'private' : undefined);
          const { message, key, valid } = readCourseMessage(form);
          if (!valid) {
            const chat = learnerChat(store, student, course.id, personal, session.csrf, 'Введите сообщение длиной до 1000 символов.');
            return html(res, 422, page(student, 'course', course.name, coursePage(student, course, date, 'chat', null, chat), date));
          }
          if (personal) store.postPrivateCourseMessage(student, teacher.id, student.id, message, key);
          else store.postCourseMessage(student, student.group, course.id, message, key);
          return redirect(res, path);
        }
        if (requestMatch && !requestMatch[2]) {
          const request = store.request(student.id, requestMatch[1]);
          if (!request) return html(res, 404, errorPage(student));
          const issued = store.certificateFile(request.id);
          const comment = (form.get('comment') || '').trim();
          const key = form.get('submission');
          const show = (error, status) => html(res, status, page(student, 'services', 'Обращение', requestPage(request, true,
            { comments: store.requestComments(request.id), csrf: session.csrf, error, comment, file: issued && { filename: issued.filename } }), date));
          if (isRequestClosed(request.status) || form.get('expected') !== request.status) {
            return show('Статус заявки изменился. Проверьте карточку.', 409);
          }
          if (!validSubmissionKey(key) || !comment || comment.length > 1500) {
            return show('Введите комментарий длиной до 1500 символов.', 422);
          }
          const next = request.status === 'waiting' ? 'processing' : request.status;
          if (!store.saveRequestChange(request.id, request.status, next, date, student, comment, key)) {
            return show('Статус заявки изменился. Обновите карточку.', 409);
          }
          return redirect(res, pathname + '#comments');
        }
        if (pathname === '/services/certificate') {
          const delivery = form.get('delivery');
          const key = form.get('submission');
          if (!Object.hasOwn(deliveryNames, delivery) || !validSubmissionKey(key)) {
            const retryKey = validSubmissionKey(key) ? key : newSubmissionKey();
            const body = certificateForm(session.csrf, retryKey, 'Проверьте способ получения и отправьте запрос ещё раз.');
            return html(res, 422, page(student, 'services', 'Заказать справку', body, date));
          }
          const id = store.createRequest(student.id, delivery, key);
          return redirect(res, '/services/requests/' + id);
        }
        if (categoryConfig) {
          const data = readCategoryRequest(category, form);
          if (data.error) return html(res, 422, page(student, 'services', categoryConfig.title,
            categoryForm(category, student, session.csrf, data.values, data.error), date));
          const id = store.createRequest(student.id, data.delivery, data.key, data.type, data.message, data.fields);
          return redirect(res, '/services/requests/' + id);
        }
        if (legacyServiceLinks.includes(service)) {
          const { key, message, error } = readServiceRequest(form);
          if (error) {
            const body = serviceForm(service, session.csrf, validSubmissionKey(key) ? key : newSubmissionKey(), message, error);
            return html(res, 422, page(student, 'services', serviceScenarios[service].title, body, date));
          }
          const id = store.createRequest(student.id, 'pickup', key, service, message);
          return redirect(res, '/services/requests/' + id);
        }
        if (pathname === '/reminders') {
          const { reminder, error } = readReminder(form, student);
          if (error) return renderHome({ formValues: reminder, formError: error }, 422);
          store.createReminder(student.id, reminder, reminder.key);
          return redirect(res, '/?all=1#activity-heading');
        }
        const reminderMatch = /^\/reminders\/([a-z0-9-]{1,32})\/(done|restore)$/.exec(pathname);
        if (reminderMatch && store.setReminderDone(student.id, reminderMatch[1], reminderMatch[2] === 'done')) {
          return redirect(res, '/?all=1#activity-heading');
        }
        return html(res, 404, errorPage(student));
      }

      const render = (section, title, body) => html(res, 200, page(student, section, title, body, date));
      if (pathname === '/announcements' || pathname.startsWith('/announcements/')) {
        const view = learnerAnnouncementRoute(pathname, store, student);
        return view ? render('announcements', view.title, view.body) : html(res, 404, errorPage(student));
      }
      if (pathname === '/chats') return render('chats', 'Чаты', learnerChatIndex(student,
        learnerChatTeachers(student, store).map(({ id, fullName }) => ({ name: fullName, href: '/chats/private/' + id }))));
      if (personalContact) return renderDirectChat();
      if (pathname === '/') {
        if (searchParams.get('courses') === 'archive') return redirect(res, '/courses/archive', 302);
        const selectedCourse = searchParams.get('course');
        const showForm = searchParams.has('new');
        if (!showForm && student.subjects.some(({ id }) => id === selectedCourse)) {
          return redirect(res, courseHref(selectedCourse, searchParams.get('tab'), searchParams.get('item')), 302);
        }
        return renderHome({ showAll: searchParams.has('all'), formValues: showForm ? { courseId: selectedCourse } : null });
      }
      if (pathname === '/homework') {
        const archived = searchParams.get('view') === 'archive';
        return render(archived ? 'homework-archive' : 'homework', archived ? 'Архивные задания' : 'Активные задания', homeworkPage(student, date, archived));
      }
      if (pathname === '/courses/active' || pathname === '/courses/archive') {
        const archived = pathname.endsWith('/archive');
        return render(archived ? 'courses-archive' : 'courses-active', archived ? 'Архивные курсы' : 'Активные курсы',
          courseCatalogPage(student, archived));
      }
      if (pathname.startsWith('/courses/')) {
        const course = studentCourse(student, pathname.slice('/courses/'.length));
        if (course) {
          const tab = searchParams.get('tab');
          const item = searchParams.get('item');
          const personal = item === 'private';
          if (tab === 'chat' && personal && (course.archived || !teacherForCourse(student, course.id))) return html(res, 404, errorPage(student));
          const chat = tab === 'chat' && !course.archived
            ? learnerChat(store, student, course.id, personal, session.csrf)
            : '';
          const answers = !course.archived ? homeworkAnswersView(store, student, course.id, session.csrf) : undefined;
          return render('course', course.name, coursePage(student, course, date, tab, item, chat, answers));
        }
      }

      if (pathname === '/events') return render('events', 'Афиша', eventList(store.eventsForStudent(student.id, date)));
      if (eventMatch) {
        const event = store.eventForStudent(student.id, eventMatch[1]);
        if (!event) return html(res, 404, errorPage(student));
        if (eventMatch[2]) return res.writeHead(200, {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename="event-' + event.id + '.ics"'
        }).end(eventCalendarFile(event));
        return render('events', event.title, learnerEvent(event, eventNow(date), session.csrf));
      }
      if (pathname === '/schedule' || pathname === '/schedule/week') {
        const requested = searchParams.get('date') || '';
        const focusDate = validDate(requested) && requested >= '2000-01-01' && requested <= '2099-12-31' ? requested : undefined;
        const start = weekStart(focusDate || date);
        const events = store.calendarEvents(student.id, start, addDays(start, 6));
        return render('schedule', 'Расписание', schedulePage(student, date, focusDate, store.remindersFor(student.id), events));
      }
      const lessonMatch = /^\/schedule\/lesson\/([a-z]+)-(\d{4}-\d{2}-\d{2})-([1-9])$/.exec(pathname);
      if (lessonMatch && lessonMatch[1] === student.id && validDate(lessonMatch[2])) {
        const lesson = lessonsFor(student, lessonMatch[2])[Number(lessonMatch[3]) - 1];
        if (lesson) return render('schedule', lesson.name,
          lessonPage(lesson, store.lessonLink(student.group, lessonMatch[2], Number(lessonMatch[3]))));
      }
      if (pathname === '/study') return redirect(res, '/study/' + student.id + '/grades', 302);
      if (gradeCourse && !gradeRoute[3]) return gradeView();
      if (pathname === '/syllabus') return render('syllabus', 'Силлабус университета', universitySyllabus(student, searchParams));
      const studyMatch = /^\/study\/([a-z]+)\/(grades|session)$/.exec(pathname);
      if (studyMatch && studyMatch[1] === student.id) {
        return render('study', 'Оценки', studyPage(student, date, studyMatch[2]));
      }
      if (pathname === '/profile') return redirect(res, '/profile/' + student.id, 302);
      if (pathname === '/profile/' + student.id) return render('profile', 'Мой профиль', profilePage(student, session.csrf));
      if (pathname.startsWith('/notifications')) {
        const items = notificationItems(student, date);
        if (pathname === '/notifications') return render('notifications', 'Уведомления', notificationsPage(items, pathname, session.csrf));
        const item = items.find((entry) => entry.id && pathname === '/notifications/' + entry.id);
        if (item) return render('notifications', item.title, notificationPage(item));
      }
      if (consultation) return renderConsultation(null);
      if (pathname === '/services') return render('services', 'Справки и обращения', servicesPage(undefined, true));
      if (pathname === '/services/requests') return render('services', 'Мои обращения', servicesPage(store.requestsFor(student.id), true));
      if (pathname === '/services/certificate') return render('services', 'Заказать справку', certificateForm(session.csrf));
      if (categoryConfig) return render('services', categoryConfig.title, categoryForm(category, student, session.csrf));
      if (legacyServiceLinks.includes(service)) return render('services', serviceScenarios[service].title, serviceForm(service, session.csrf));
      if (requestMatch) {
        const request = store.request(student.id, requestMatch[1]);
        if (request && !requestMatch[2]) {
          const issued = store.certificateFile(request.id);
          return render('services', 'Обращение', requestPage(request, true,
            { comments: store.requestComments(request.id), csrf: session.csrf, file: issued && { filename: issued.filename } }));
        }
        if (request && isCertificateService(request.service) && request.status === 'ready' && request.delivery === 'download') {
          const issued = store.certificateFile(request.id);
          if (issued) return downloadAttachment(res, issued);
          return res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': 'attachment; filename="certificate-' + request.id + '-sample.txt"'
          }).end('\uFEFF' + certificateText(student, request));
        }
      }

      return html(res, 404, errorPage(student));
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.end();
      if (error instanceof FormError) return html(res, error.status, errorPage(student, error.message));
      console.error(error);
      return html(res, 500, errorPage(student, 'Кабинет временно недоступен', 'Обновите страницу через несколько секунд.'));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const store = openStore();
  const server = createApp(store, { publicOrigin: process.env.DEAN_PUBLIC_ORIGIN });
  server.on('close', () => store.close());
  server.listen(port, '127.0.0.1', () => {
    console.log('Цифровой деканат: http://127.0.0.1:' + server.address().port);
  });
}
