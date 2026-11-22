import { addDays, lessonsFor, lessonSlots, validDate, weekStart } from './fixtures.js';
import { peopleById } from './people.js';
import { staffLesson, staffSchedule, staffScheduleHref } from './staff.js';
import { officeProposal, officeProposals, teacherLessonHref, teacherLessonPage, teacherSchedule } from './staff-dashboard.js';

const result = (title, body, status = 200) => ({ title, body, status });
const jump = (redirect) => ({ redirect });
const validStaffDay = (day) => validDate(day) && day >= '2000-01-01' && day <= '2099-12-31';
const proposalsPath = '/staff/schedule/proposals';
const clock = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });

export function groupCalendars(store) {
  const groups = new Map();
  for (const student of peopleById.values()) {
    if (!student.role && !groups.has(student.group)) {
      groups.set(student.group, { ...student, lessonChanges: store.lessonChanges(student.group) });
    }
  }
  return groups;
}

export function teacherLessons(calendars, classrooms, day) {
  return [...calendars].flatMap(([group, base]) => lessonsFor(base, day)
    .map((lesson, index) => ({ group, day, number: index + 1, lesson }))
    .filter(({ lesson }) => classrooms.some((item) => item.group === group && item.id === lesson.id)))
    .sort((first, second) => first.lesson.slot - second.lesson.slot);
}

function transferConflict(calendars, group, day, number, lesson, slot, room) {
  for (const [otherGroup, base] of calendars) {
    const items = lessonsFor(base, day);
    for (const [index, other] of items.entries()) {
      if (other.slot !== slot || (otherGroup === group && index + 1 === number)) continue;
      if (otherGroup === group) return 'В это время у группы уже есть занятие.';
      if (other.teacher === lesson.teacher) return 'В это время преподаватель занят на другой паре.';
      if (other.room.toLowerCase() === room.toLowerCase()) return 'На это время аудитория занята.';
    }
  }
  return '';
}

function transferFields(form, lesson) {
  const raw = form.get('slot') || '';
  const slot = Number(raw);
  const room = (form.get('room') || '').trim();
  const reason = (form.get('reason') || '').trim();
  const valid = /^\d$/.test(raw) && lessonSlots[slot] && room && room.length <= 25 && reason &&
    reason.length <= 200 && (slot !== lesson.slot || room !== lesson.room);
  return { slot, room, reason, valid };
}

export function teacherTimetable(ctx, classrooms) {
  const { path, date, query, person, csrf, form, store } = ctx;
  const calendars = groupCalendars(store);
  const proposals = store.scheduleProposals({ teacher: person.id });
  if (path === '/staff/teaching/schedule' && !form) {
    const requested = query.get('date') || '';
    const day = validStaffDay(requested) ? requested : date;
    const week = query.get('view') === 'week' ? Array.from({ length: 7 }, (_, index) => {
      const dayInWeek = addDays(weekStart(day), index);
      return { day: dayInWeek, lessons: teacherLessons(calendars, classrooms, dayInWeek) };
    }) : null;
    return result('Мои пары', teacherSchedule(day, date, week ? [] : teacherLessons(calendars, classrooms, day), proposals, week));
  }
  const match = /^\/staff\/teaching\/schedule\/(\d{4}-\d{2}-\d{2})\/([1-9])$/.exec(path);
  if (!match || !validStaffDay(match[1])) return null;
  const day = match[1];
  const entry = teacherLessons(calendars, classrooms, day).find(({ group, number }) =>
    group === query.get('group') && number === Number(match[2]));
  if (!entry) return null;
  const { lesson, group, number } = entry;
  const history = proposals.filter((item) => item.group_name === group && item.day === day && item.lesson_number === number);
  const now = clock.format(new Date());
  const notStarted = day > date || (day === date && lesson.start > now);
  const allowed = notStarted && !history.some(({ status }) => status === 'pending');
  const show = (error, fields, status = 200) => result(lesson.name, teacherLessonPage(entry, history, csrf, allowed, error, fields), status);
  if (!form) return show();
  if (!allowed) return show('Сейчас для этой пары нельзя отправить новое предложение.', null, 409);
  const fields = transferFields(form, lesson);
  if (!fields.valid || (day === date && lessonSlots[fields.slot].start <= now)) {
    return show('Укажите будущее время или новую аудиторию и добавьте причину.', fields, 422);
  }
  if (!store.proposeLesson(person.id, group, lesson, day, number, fields.slot, fields.room, fields.reason, date)) {
    return show('Для этой пары уже есть предложение на согласовании.', fields, 409);
  }
  return jump(teacherLessonHref(group, day, number));
}

function review(ctx, calendars) {
  const { path, date, person, store, csrf, form } = ctx;
  if (path === proposalsPath && !form) return result('Переносы занятий', officeProposals(store.scheduleProposals()));
  const id = Number(/^\/staff\/schedule\/proposals\/(\d+)$/.exec(path)?.[1]);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const item = store.scheduleProposal(id);
  if (!item) return null;
  const { day, group_name: group, lesson_number: number, slot, room, reason } = item;
  const base = calendars.get(group);
  const lesson = base && lessonsFor(base, day)[number - 1];
  const now = clock.format(new Date());
  const stale = !lesson || lesson.slot !== item.original_slot || lesson.room !== item.original_room;
  const conflict = day < date || (day === date && (lessonSlots[slot].start <= now || lesson?.start <= now))
    ? 'Время занятия или предложенного слота уже прошло.'
    : stale ? 'Расписание этой пары изменилось после подачи предложения.'
    : transferConflict(calendars, group, day, number, lesson, slot, room);
  const teacher = peopleById.get(item.teacher_id)?.fullName || 'Преподаватель';
  const show = (error, status = 200) => result(item.title, officeProposal(item, teacher, csrf, conflict, error), status);
  if (!form) return show();
  if (item.status !== 'pending') return jump(path);
  if (form.get('action') === 'decline') {
    const note = (form.get('note') || '').trim();
    if (!note || note.length > 200) return show('Укажите причину отказа до 200 символов.', 422);
    store.declineScheduleProposal(id, note);
    return jump(path);
  }
  if (form.get('action') !== 'publish') return show('Выберите действие.', 422);
  if (conflict) return show('Публикация недоступна, пока есть конфликт.', 409);
  const hasConflict = () => transferConflict(groupCalendars(store), group, day, number, lesson, slot, room);
  if (!store.moveLesson(group, lesson, day, number, slot, room, reason, date, person.id, { proposalId: id, hasConflict })) {
    return show('Расписание или статус заявки уже изменились. Обновите страницу.', 409);
  }
  return jump(path);
}

export function staffScheduling(ctx) {
  const { person, store, date, csrf, path, query, form } = ctx;
  const calendars = groupCalendars(store);
  if (path === proposalsPath || path.startsWith(proposalsPath + '/')) return review(ctx, calendars);
  const options = [...calendars.keys()];
  const group = query.get('group') ?? options[0];
  if (!options.includes(group)) return null;
  const student = calendars.get(group);
  if (!student) return null;
  const scope = options.length > 1 ? group : '';
  const view = query.get('view') === 'week' ? 'week' : 'day';
  if (path === '/staff/schedule' && !form) {
    const requested = query.get('date') || '';
    const weekly = view === 'week' || (!requested && !query.has('view'));
    const day = validStaffDay(requested) ? requested : weekly ? date : Array.from({ length: 7 }, (_, index) => addDays(date, index))
      .find((value) => lessonsFor(student, value).length) || date;
    const week = weekly ? Array.from({ length: 7 }, (_, index) => {
      const dateInWeek = addDays(weekStart(day), index);
      return { day: dateInWeek, lessons: lessonsFor(student, dateInWeek).map((lesson, index) => ({ lesson, number: index + 1 })) };
    }) : null;
    const lessons = lessonsFor(student, day);
    const nearest = !week && !lessons.length ? Array.from({ length: 14 }, (_, index) => addDays(day, index + 1))
      .find((value) => lessonsFor(student, value).length) : null;
    return result('Расписание группы', staffSchedule(group, day, week ? [] : lessons, options, date, week, nearest));
  }
  const match = /^\/staff\/schedule\/(\d{4}-\d{2}-\d{2})\/([1-9])$/.exec(path);
  if (!match || !validStaffDay(match[1])) return null;
  const day = match[1];
  const number = Number(match[2]);
  const list = lessonsFor(student, day);
  const lesson = list[number - 1];
  if (!lesson) return null;
  const blocked = new Set(list.filter((item) => item !== lesson).map(({ slot }) => slot));
  const show = (error, status = 200) => result(lesson.name,
    staffLesson(lesson, day, number, group, scope, blocked, csrf, error, view, store.lessonLink(group, day, number)), status);
  if (!form) return show();
  const linkAction = form.get('link-action');
  if (linkAction === 'save' || linkAction === 'remove') {
    if (linkAction === 'remove') {
      store.setLessonLink(group, day, number, '', date, person.id);
      return jump(staffScheduleHref(scope, day, number, view));
    }
    const url = URL.parse((form.get('online') || '').trim());
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 500) {
      return show('Укажите ссылку для подключения, начинающуюся с https:// или http://.', 422);
    }
    store.setLessonLink(group, day, number, url.href, date, person.id);
    return jump(staffScheduleHref(scope, day, number, view));
  }
  const { valid, slot, room, reason } = transferFields(form, lesson);
  if (!valid) return show('Выберите свободный слот или новую аудиторию и добавьте комментарий.', 422);
  const conflict = transferConflict(calendars, group, day, number, lesson, slot, room);
  if (conflict) return show(conflict, 422);
  const hasConflict = () => transferConflict(groupCalendars(store), group, day, number, lesson, slot, room);
  if (!store.moveLesson(group, lesson, day, number, slot, room, reason, date, person.id, { hasConflict })) {
    return show('Расписание уже изменилось. Обновите страницу и проверьте свободные слоты.', 409);
  }
  return jump(staffScheduleHref(scope, day, null, view));
}
