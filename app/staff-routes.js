import { addDays, requestStatuses, studentWork, workKey } from './fixtures.js';
import { employees, peopleById, staffChatPair, studentData, teacherClassrooms } from './people.js';
import { isCertificateService, isRequestClosed, newSubmissionKey, requestCategories, requestNumber, serviceCategory, validSubmissionKey } from './services.js';
import { officeEventRoute } from './events.js';
import { officeSessionRoute } from './office-session.js';
import { teacherSessionRoute } from './teacher-session.js';
import { officeAnnouncementRoute } from './announcements.js';
import { readCourseMessage } from './course-chat.js';
import { hasAttachment, publicationKind, readAttachment, readPublication } from './publication.js';
import { sampleCourseMaterials, topicsForCourse, topicTitle } from './teaching-catalog.js';
import { activityType, gradeTypeFilter } from './grade-types.js';
import { officeConsultations } from './consultations.js';
import { officeDashboard, teacherDashboard } from './staff-dashboard.js';
import { groupCalendars, staffScheduling, teacherLessons, teacherTimetable } from './staff-scheduling.js';
import { gradeDiscussion, readGradeComment } from './grade-discussion.js';
import { gradeActivityId } from './staff-store.js';
import { notificationsPage } from './timetable.js';
import { chatsPath, gradesPath, publicationsPath, staffChat, staffChatIndex, staffCourses, staffGradeIndex, staffGradeSheet,
  reviewPath, staffHomePath, staffProfile, staffPublicationDetail, staffPublications, staffRequest, staffRequests, staffReview, staffReviewQueue, staffTopics } from './staff.js';

const result = (title, body, status = 200) => ({ title, body, status });
const jump = (redirect) => ({ redirect });

function coursePublicationEntries(classroom, date) {
  const materials = topicsForCourse(classroom.id).flatMap(([topic]) => {
    const material = sampleCourseMaterials.get(classroom.id + '/' + topic);
    return material ? [{ ...material, id: 'sample-material', kind: 'material', topic_id: topic }] : [];
  });
  const work = studentWork({ group: classroom.group }, date).filter(({ courseId }) => courseId === classroom.id);
  const assignments = work.map((item) => ({ ...item, id: 'sample-' + gradeActivityId(workKey(item)), topic_id: item.topic ?? 'general',
    due_on: addDays(date, item.offset), due_at: item.time }));
  const order = { material: 0, homework: 1, test: 2 };
  return [...materials, ...assignments, ...classroom.items].sort((a, b) => order[a.kind] - order[b.kind]);
}

async function publications(ctx, classrooms, courseId, topic, publicationId, editing) {
  const { person, store, date, csrf, path, form, query, formError } = ctx;
  const sections = classrooms.map((entry) => ({ ...entry, items: store.coursePublications(entry.group, entry.id) }));
  if (!courseId) return !form && !formError ? result('Материалы и задания', staffTopics(sections.map((section) => ({
    ...section, items: coursePublicationEntries(section, date)
  })), query.get('course'), query.get('topic'))) : null;
  const classroom = sections.find(({ id }) => id === courseId);
  const name = topicTitle(courseId, topic);
  if (!classroom || !name) return null;
  if (publicationId && !editing) {
    const item = coursePublicationEntries(classroom, date).find(({ id, topic_id }) => id === publicationId && topic_id === topic);
    return item && !form && !formError ? result(item.title, staffPublicationDetail(classroom, topic, name, item, person.id)) : null;
  }
  const existing = publicationId && classroom.items.find(({ id, topic_id, author_id }) =>
    id === publicationId && topic_id === topic && author_id === person.id);
  if (publicationId && !existing) return null;
  const defaults = existing
    ? { kind: existing.kind, title: existing.title, description: existing.description, day: existing.due_on, time: existing.due_at }
    : { kind: publicationKind(query.get('kind')) };
  const show = (values, error, status = 200) => result(existing ? 'Редактирование публикации' : name,
    staffPublications(classroom, topic, name, path, date, csrf, values, error, existing, person.id), status);
  if (formError) return show(defaults, formError.message, formError.status);
  if (!form) return show(defaults);
  const publication = await readPublication(form, date, existing);
  if (publication.error) return show(publication.values, publication.error, 422);
  if (existing) {
    store.updateCourseFile(person, classroom, topic, publicationId, publication);
    return jump(publicationsPath + '/' + courseId + '/' + topic + '?kind=' + publication.kind + '#published');
  }
  store.publishCourseFile(person, classroom, topic, publication);
  return jump(path + '?kind=' + publication.kind + '#published');
}

function activitySheet(store, classroom, date) {
  const { course, learners } = classroom;
  const participants = learners.map((learner) => studentData(store, learner, date));
  const works = new Map();
  for (const student of participants) {
    for (const entry of studentWork(student)) {
      if (entry.courseId !== course.id) continue;
      const activityKey = workKey(entry);
      const label = entry.kind === 'test' ? 'Контрольная' : 'Домашнее задание';
      const topic = topicTitle(course.id, entry.topic);
      works.set(activityKey, { title: entry.title, activityKey, offset: entry.offset,
        kind: activityType(entry.title, entry.kind), label: topic ? label + ' · ' + topic : label });
    }
  }
  for (const student of participants) {
    for (const [name, title, grade, unit, publishedKey] of student.grades) {
      if (name !== course.name || (grade && !unit)) continue;
      const activityKey = workKey({ title, activityKey: publishedKey });
      const work = works.get(activityKey) || { title, activityKey, kind: activityType(title), label: 'Работа' };
      work.max ??= /^(\d+) \/ (\d+)$/.exec(grade || '')?.[2];
      works.set(activityKey, work);
    }
  }
  return { ...classroom, learners: participants, works: [...works.values()].map((work) => ({
    ...work, key: gradeActivityId(work.activityKey)
  })) };
}

function gradingValues(form) {
  const score = form.get('score') || '';
  const max = form.get('max') || '';
  const valid = /^\d{1,4}$/.test(score) && /^\d{1,4}$/.test(max) &&
    Number(max) >= 1 && Number(max) <= 1000 && Number(score) <= Number(max);
  return { score, max, valid };
}

const gradingError = 'Проверьте балл и максимум. Балл должен быть от 0 до указанного максимума.';

function reviewHomework(ctx, sheet, work, studentId, tail) {
  const { store, form, path, csrf } = ctx;
  const student = sheet.learners.find(({ id }) => id === studentId);
  const answer = student && work.kind === 'homework' && store.homeworkAnswer(student.id, sheet.group, sheet.id, work.activityKey);
  if (!answer) return null;
  const back = gradesPath + '/' + sheet.id + '/' + work.key + tail;
  const action = path + tail;
  const show = (error, values, status = 200) => result(work.title,
    staffReview({ work, student, answer, sheet, back, path: action, csrf, error, values }), status);
  if (!form) return show();
  const { score, max, valid } = gradingValues(form);
  const feedback = (form.get('feedback') || '').trim();
  const values = { score, max, feedback };
  if (form.get('answerId') !== String(answer.id)) {
    return show('Студент загрузил новую версию. Просмотрите её перед сохранением оценки.', values, 409);
  }
  if (!valid || feedback.length > 2000) return show(valid ? 'Допустимо до 2000 символов в комментарии.' : gradingError, values, 422);
  store.publishGrade(student.id, sheet.id, work, Number(score) + ' / ' + Number(max), { answerId: answer.id, feedback });
  return jump(back);
}

function pendingHomework(store, date, classrooms) {
  return classrooms.flatMap((classroom) => {
    const sheet = activitySheet(store, classroom, date);
    return sheet.works.filter(({ kind }) => kind === 'homework').flatMap((work) => sheet.learners.flatMap((student) => {
      const answer = store.homeworkAnswer(student.id, sheet.group, sheet.id, work.activityKey);
      return answer && !answer.reviewed_score ? [{ sheet, work, student, answer }] : [];
    }));
  }).sort((first, second) => second.answer.id - first.answer.id);
}

function gradebook(ctx, classrooms, courseId, activity, studentId, commenter) {
  const { person, store, date, csrf, path, query, form } = ctx;
  const selected = gradeTypeFilter(query.get('type'));
  if (!courseId) return !form ? result('Оценки', staffGradeIndex(classrooms.map((item) => activitySheet(store, item, date)), selected)) : null;
  const classroom = classrooms.find(({ id }) => id === courseId);
  if (!classroom) return null;
  const sheet = activitySheet(store, classroom, date);
  const work = sheet.works.find(({ key }) => key === activity);
  if (!work) return null;
  const tail = selected === 'all' ? '' : '?type=' + selected;
  if (studentId) return reviewHomework(ctx, sheet, work, studentId, tail);
  const sheetPath = gradesPath + '/' + courseId + '/' + activity;
  const returnPath = sheetPath + tail;
  const discussion = (student, error = '') => gradeDiscussion({
    messages: store.gradeComments(student, person.id, courseId, work.activityKey),
    action: sheetPath + '/comments/' + student + tail, csrf, id: 'grade-discussion-' + student, student, teacherView: true,
    open: query.get('discussion') === student, error
  });
  const show = (error, values, discussionError) => {
    const answers = work.kind === 'homework' ? new Map(sheet.learners.map(({ id }) =>
      [id, store.homeworkAnswer(id, sheet.group, courseId, work.activityKey)])) : new Map();
    return result(work.title, staffGradeSheet(sheet, work, returnPath, csrf, error, values, selected, answers,
      (student) => discussion(student, commenter === student ? discussionError : '')), error || discussionError ? 422 : 200);
  };
  if (commenter) {
    const student = sheet.learners.find(({ id }) => id === commenter);
    const published = student?.grades.some(([name, title, score, unit, key]) => name === sheet.course.name &&
      score && unit && workKey({ title, activityKey: key }) === work.activityKey);
    if (!form || !published) return null;
    const comment = readGradeComment(form);
    if (!comment.valid) return show('', null, 'Введите комментарий длиной до 2000 символов.');
    store.postGradeComment(student.id, person.id, courseId, work.activityKey, person.id, comment);
    const next = new URLSearchParams(tail.slice(1));
    next.set('discussion', student.id);
    return jump(sheetPath + '?' + next + '#grade-discussion-' + student.id);
  }
  if (!form) return show();
  const student = form.get('student');
  const { score, max, valid } = gradingValues(form);
  if (!sheet.learners.some(({ id }) => id === student) || !valid) {
    return show(gradingError, { student, score, max });
  }
  const answer = work.kind === 'homework' && store.homeworkAnswer(student, sheet.group, courseId, work.activityKey);
  const answerId = form.get('answerId');
  if (answerId && answerId !== String(answer?.id)) {
    return show('Студент загрузил новую версию. Просмотрите её перед сохранением оценки.', { student, score, max });
  }
  store.publishGrade(student, courseId, work, Number(score) + ' / ' + Number(max), { answerId: answerId ? answer.id : null });
  return jump(returnPath);
}

function teachingChat(ctx, classrooms, courseId, learnerId) {
  const { person, store, path, csrf, form } = ctx;
  if (!courseId) return !form ? result('Чаты', staffChatIndex(classrooms)) : null;
  const classroom = classrooms.find(({ id }) => id === courseId);
  if (courseId !== 'private' && !classroom) return null;
  const contacts = classroom ? classroom.learners : classrooms.flatMap(({ learners }) => learners);
  const participant = contacts.find(({ id }) => id === learnerId);
  if (learnerId && !participant) return null;
  if (!classroom && !participant) return null;
  const destination = participant ? chatsPath + '/private/' + participant.id : path;
  if (participant && !form && path !== destination) return jump(destination);
  const show = (error) => {
    const history = participant ? store.privateCourseMessages(person.id, participant.id) : store.courseMessages(classroom.group, courseId);
    return result('Чаты', staffChat(participant?.fullName ?? classroom.course.name, participant ? 'Личная переписка' : 'Группа ' + classroom.group,
      Boolean(participant), destination, history, csrf, error), error ? 422 : 200);
  };
  if (!form) return show();
  const { message, key, valid } = readCourseMessage(form);
  if (!valid) return show('Введите сообщение длиной до 1000 символов.');
  if (participant) store.postPrivateCourseMessage(person, person.id, participant.id, message, key);
  else store.postCourseMessage(person, classroom.group, courseId, message, key);
  return jump(destination);
}

function coworkersChat({ person, store, path, csrf, form }) {
  const contacts = employees.filter(({ id }) => id !== person.id && store.hasAccount(id));
  if (path === '/staff/chats' && !form) {
    const classrooms = teacherClassrooms(person).map((entry) => ({ ...entry,
      learners: entry.learners.filter(({ id }) => store.hasAccount(id)) }));
    return result('Чаты', staffChatIndex(classrooms, contacts));
  }
  const id = /^\/staff\/chats\/([a-z]+)$/.exec(path)?.[1];
  const contact = contacts.find((employee) => employee.id === id);
  if (!contact) return null;
  const pair = staffChatPair(person.id, contact.id);
  const show = (error) => result('Чаты', staffChat(contact.fullName, contact.roleName, true, path,
    store.privateCourseMessages(...pair), csrf, error, '/staff/chats'), error ? 422 : 200);
  if (!form) return show();
  const { message, key, valid } = readCourseMessage(form);
  if (!valid) return show('Введите сообщение длиной до 1000 символов.');
  store.postPrivateCourseMessage(person, ...pair, message, key);
  return jump(path);
}

function teachingHome({ person, store, date }, classrooms) {
  const calendars = groupCalendars(store);
  const lessons = teacherLessons(calendars, classrooms, date);
  let nearest = [];
  for (let offset = 1; !lessons.length && !nearest.length && offset <= 7; offset++) {
    nearest = teacherLessons(calendars, classrooms, addDays(date, offset));
  }
  const grading = pendingHomework(store, date, classrooms).slice(0, 6);
  const disciplines = classrooms.map(({ id, course, group }) => ({ id, name: course.name, group }));
  return result('Главная', teacherDashboard(person, date, lessons, nearest, grading, disciplines));
}

function teaching(ctx) {
  const classrooms = teacherClassrooms(ctx.person).map((item) => ({
    ...item, learners: item.learners.filter(({ id }) => ctx.store.hasAccount(id))
  }));
  const { path, form } = ctx;
  if (path === '/staff/teaching' && !form) return teachingHome(ctx, classrooms);
  if (path === '/staff/teaching/session' || path.startsWith('/staff/teaching/session/')) return teacherSessionRoute(ctx, classrooms);
  if (path === '/staff/teaching/schedule' || path.startsWith('/staff/teaching/schedule/')) return teacherTimetable(ctx, classrooms);
  if (path === '/staff/courses' && !form) return result('Мои дисциплины', staffCourses(classrooms));
  const courseId = /^\/staff\/courses\/([a-z]+)$/.exec(path)?.[1];
  const course = classrooms.find(({ id }) => id === courseId);
  if (course && !form) return result(course.course.name, staffCourses([course], course));
  if (path === '/staff/teaching/chat' && !form) return jump(chatsPath);
  const publication = /^\/staff\/teaching\/publications(?:\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/([a-f0-9]{32}|sample-(?:material|[a-f0-9]{24}))(\/edit)?)?)?$/.exec(path);
  if (publication) return publications(ctx, classrooms, publication[1], publication[2], publication[3], publication[4]);
  if (path === reviewPath && !form) return result('К проверке', staffReviewQueue(pendingHomework(ctx.store, ctx.date, classrooms)));
  const grades = /^\/staff\/teaching\/grades(?:\/([a-z]+)\/([0-9a-f]{24})(?:\/comments\/([a-z]+)|\/([a-z]+))?)?$/.exec(path);
  if (grades) return gradebook(ctx, classrooms, grades[1], grades[2], grades[4], grades[3]);
  const chat = /^\/staff\/teaching\/chats(?:\/([a-z]+)(?:\/([a-z]+))?)?$/.exec(path);
  if (chat) return teachingChat(ctx, classrooms, chat[1], chat[2]);
  return null;
}

function officeHome({ store, date }) {
  const proposals = store.scheduleProposals()
    .filter(({ status }) => status === 'pending').slice(0, 5);
  const requests = store.officeRequests().filter(({ status }) => !isRequestClosed(status) && status !== 'waiting')
    .sort((first, second) => first.created_on.localeCompare(second.created_on)).slice(0, 5)
    .map((item) => ({ ...item, name: peopleById.get(item.student_id)?.fullName ?? 'Студент' }));
  const groups = [...groupCalendars(store).keys()];
  return result('Учебный офис', officeDashboard(date, proposals, requests, groups));
}

async function office(ctx) {
  const { store, date, csrf, path, query, form, person, formError } = ctx;
  if (path === '/staff/consultations') return officeConsultations(ctx);
  if (path === '/staff/events' || path.startsWith('/staff/events/')) return officeEventRoute(ctx);
  if (path === '/staff/session' || path.startsWith('/staff/session/')) return officeSessionRoute(ctx);
  if (path === '/staff/announcements' || path.startsWith('/staff/announcements/')) return officeAnnouncementRoute(ctx);
  if (path === '/staff/requests' && !form) {
    const filter = query.get('status');
    const status = ['waiting', 'ready', 'rejected', 'all'].includes(filter) ? filter : 'open';
    const group = query.get('category');
    const category = group === 'other' || Object.hasOwn(requestCategories, group) ? group : '';
    const requestedType = query.get('type');
    const categories = category ? [requestCategories[category]].filter(Boolean) : Object.values(requestCategories);
    const type = categories.some(({ types }) => Object.hasOwn(types, requestedType)) ? requestedType : '';
    const search = (query.get('q') || '').trim().slice(0, 80);
    const needle = search.toLocaleLowerCase('ru');
    const rows = store.officeRequests().filter((item) => status === 'all' || (status === 'open' ? !isRequestClosed(item.status) : item.status === status))
      .filter(({ service }) => (!category || serviceCategory(service) === category) && (!type || service === type))
      .map((item) => ({ ...item, name: peopleById.get(item.student_id)?.fullName || 'Студент' }))
      .filter((item) => !needle || [item.name, requestNumber(item.id)].some((value) => value.toLocaleLowerCase('ru').includes(needle)));
    return result('Очередь обращений', staffRequests(rows, status, search, category, type));
  }
  const id = /^\/staff\/requests\/([a-z0-9-]{1,48})$/.exec(path)?.[1];
  const item = id && store.officeRequest(id);
  if (!item) return null;
  const student = peopleById.get(item.student_id);
  const electronic = isCertificateService(item.service) && item.delivery === 'download';
  const show = (error, status = 200, fields = {}) => result('Обращение',
    staffRequest(item, student, csrf, store.requestComments(id), { error, ...fields, file: store.certificateFile(id) }), status);
  if (!form) return show();
  if (formError) return show(formError.message, formError.status);
  const attached = form.get('file');
  if (form.get('action') === 'replace') {
    if (!electronic) return show('К этой заявке файл не прилагается.', 422);
    if (!validSubmissionKey(form.get('submission'))) return show('Сеанс устарел. Откройте страницу заново.', 422);
    const attachment = hasAttachment(attached) ? await readAttachment(attached) : { error: 'Выберите файл готовой справки.' };
    if (attachment.error) return show(attachment.error, 422);
    store.saveRequestFile(id, person, attachment, form.get('submission'));
    return jump(path + '#certificate-file');
  }
  const expected = form.get('expected');
  const legacy = !form.has('status');
  const next = legacy ? item.status === 'submitted' ? 'processing' : 'ready' : form.get('status');
  const key = legacy ? newSubmissionKey() : form.get('submission');
  const comment = (form.get(legacy ? 'reply' : 'comment') || '').trim();
  const fields = { selected: next, comment };
  if (expected !== item.status) return show('Статус уже изменился. Проверьте карточку.', 409, fields);
  if (!validSubmissionKey(key) || !Object.hasOwn(requestStatuses, next) || (next === 'submitted' && expected !== next)) {
    return show('Выберите допустимый статус заявки.', 422, fields);
  }
  const changesStatus = next !== expected;
  const needsComment = !changesStatus || ['ready', 'waiting', 'rejected'].includes(next);
  if ((needsComment && !comment) || comment.length > 1500) {
    return show('Введите комментарий длиной до 1500 символов.', 422, fields);
  }
  if (next === 'ready' && changesStatus && electronic) {
    const attachment = hasAttachment(attached) ? await readAttachment(attached) : null;
    if (attachment?.error) return show(attachment.error, 422, fields);
    if (!attachment && !store.certificateFile(id)) {
      return show('Приложите готовый документ — студент получит его в карточке обращения.', 422, fields);
    }
    if (!store.issueReadyRequest(id, expected, date, person, comment, key, attachment)) {
      return show('Статус уже изменился. Обновите карточку.', 409, fields);
    }
    return jump(path + '#comments');
  }
  if (!store.saveRequestChange(id, expected, next, date, person, comment, key)) {
    return show('Статус уже изменился. Обновите карточку.', 409, fields);
  }
  return jump(path + (legacy ? '' : '#comments'));
}

export function staffRoute(ctx) {
  if (ctx.path === '/staff/notifications') {
    if (ctx.form) {
      const requested = new Set(ctx.form.getAll('notice'));
      ctx.store.markNoticesSeen(ctx.person.id, ctx.notices.filter(({ key }) => requested.has(key)).map(({ key }) => key));
      return jump(ctx.path);
    }
    return result('Уведомления', notificationsPage(ctx.notices, ctx.path, ctx.csrf));
  }
  if (ctx.path === '/staff/chats' || ctx.path.startsWith('/staff/chats/')) return coworkersChat(ctx);
  if (ctx.path === '/staff' && !ctx.form) return jump(staffHomePath(ctx.person.role));
  if (ctx.path === '/staff/profile' && !ctx.form) return result('Профиль сотрудника', staffProfile(ctx.person, teacherClassrooms(ctx.person), ctx.csrf));
  if (ctx.person.role === 'teacher') return teaching(ctx);
  if (ctx.path === '/staff/office' && !ctx.form) return officeHome(ctx);
  if (ctx.path === '/staff/schedule' || ctx.path.startsWith('/staff/schedule/')) return staffScheduling(ctx);
  return office(ctx);
}
