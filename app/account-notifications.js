import { lessonSlots, shortDate } from './fixtures.js';
import { peopleById, teacherClassrooms } from './people.js';
import { teacherLessonHref } from './staff-dashboard.js';
import { chatsPath, gradesPath, staffScheduleHref } from './staff.js';
import { gradeActivityId } from './staff-store.js';
import { announcementAudience } from './announcements.js';

function messageNotices(store, person) {
  return store.incomingDirectMessages(person.id).map(({ id, author_id, author_name, sent_at }) => ({
    key: 'message:' + id, title: 'Новое личное сообщение', label: 'Чаты', glyph: 'chat', tone: 'neutral',
    body: author_name, date: sent_at.slice(0, 10),
    path: !person.role ? '/chats/private/' + author_id : peopleById.get(author_id)?.role
      ? '/staff/chats/' + author_id : chatsPath + '/private/' + author_id
  }));
}

function examNotices(store, student) {
  return store.sessionExams(student.group).flatMap((exam) => {
    const course = student.subjects.find(({ id }) => id === exam.course_id);
    if (!course) return [];
    return [{ key: `session-exam:${exam.id}:${exam.revision}`, title: exam.revision ? 'Изменилось расписание сессии' : 'Опубликовано испытание',
      text: course.name, label: 'Сессия', glyph: 'calendar', tone: 'blue', date: exam.updated_on,
      detail: `${exam.kind} · ${shortDate(exam.day)}, ${exam.time} МСК · ${exam.format === 'online' ? 'онлайн' : 'ауд. ' + exam.place}`,
      path: `/study/${student.id}/session#exam-${exam.id}` }];
  });
}

function examResultNotices(store, student) {
  return store.publishedSessionResults(student.id).flatMap((result) => {
    const course = result.group_name === student.group && student.subjects.find(({ id }) => id === result.course_id);
    if (!course) return [];
    return [{ key: `session-result:${result.exam_id}:${result.publication_revision}`,
      title: result.publication_revision > 1 ? 'Результат сессии обновлён' : 'Опубликован результат сессии',
      text: course.name, label: 'Сессия', glyph: 'check', tone: 'mint', date: result.published_on,
      path: `/study/${student.id}/session#exam-${result.exam_id}` }];
  });
}

function scheduleEvents(store, person, classrooms) {
  const teacher = person.role === 'teacher';
  return store.scheduleNotices(person.id)
    .filter((row) => !teacher || classrooms.some(({ group, course }) => group === row.group_name && course.name === row.title))
    .map((row) => ({
      key: 'schedule:' + row.id, previouslyRead: !row.unread,
      title: row.title, text: row.group_name, date: row.published_on, label: 'Перенос', glyph: 'shift', tone: 'amber',
      detail: shortDate(row.day) + ', ' + lessonSlots[row.slot].start + ' · ауд. ' + row.room,
      body: row.reason, path: teacher ? teacherLessonHref(row.group_name, row.day, row.lesson_number)
        : staffScheduleHref(row.group_name, row.day, row.lesson_number)
    }));
}

function staffEvents(store, person) {
  const classrooms = teacherClassrooms(person);
  const events = scheduleEvents(store, person, classrooms);
  if (person.role === 'teacher') {
    events.push(...classrooms.flatMap(({ group, course }) => store.recentHomeworkAnswers(group, course.id)
      .map((row) => ({ key: 'homework:' + row.id, title: 'Студент сдал домашнее задание', label: 'Задание', glyph: 'file',
        body: peopleById.get(row.student_id)?.fullName ?? 'Студент', text: course.name, tone: 'neutral',
        date: row.sent_at.slice(0, 10), path: gradesPath + '/' + course.id + '/' + gradeActivityId(row.activity_key)
      }))));
  }
  const proposals = store.scheduleProposals({ teacher: person.role === 'teacher' ? person.id : null });
  for (const item of proposals) {
    const teacher = person.role === 'teacher';
    if (teacher ? item.status !== 'declined' : item.status !== 'pending') continue;
    events.push({ key: 'proposal:' + item.id, title: teacher ? 'Перенос отклонён' : 'Предложен перенос занятия',
      label: 'Расписание', glyph: 'calendar', tone: 'neutral', text: item.title, date: item.created_on,
      body: teacher ? item.decision_note : item.reason, path: teacher ? teacherLessonHref(item.group_name, item.day, item.lesson_number)
        : '/staff/schedule/proposals/' + item.id });
  }
  return events;
}

export function accountNotices(store, person) {
  const seen = new Set(store.seenNoticeKeys(person.id));
  const discussions = store.incomingGradeComments(person.id).map(({ id, course_id, student_id, author_id, activity_key, sent_at }) => {
    const activity = gradeActivityId(activity_key);
    return {
      key: 'grade-comment:' + id, title: person.role ? 'Вопрос об оценке' : 'Ответ преподавателя об оценке',
      body: peopleById.get(author_id)?.fullName, date: sent_at.slice(0, 10),
      label: 'Оценки', glyph: 'check', tone: 'neutral',
      path: person.role ? gradesPath + '/' + course_id + '/' + activity + '?discussion=' + student_id + '#grade-discussion-' + student_id
        : '/study/' + student_id + '/grades/' + course_id + '?discussion=' + activity + '#grade-discussion-' + activity
    };
  });
  const announcementNotices = person.role ? [] : store.studentAnnouncements(person, 50).map((item) => ({
    key: 'announcement:' + item.id, title: item.title, detail: announcementAudience(item), date: item.published_at.slice(0, 10),
    label: 'Объявление', glyph: 'megaphone', tone: 'violet', path: '/announcements/' + item.id
  }));
  const academic = person.role ? staffEvents(store, person) : [...examResultNotices(store, person), ...examNotices(store, person)];
  return [...announcementNotices, ...discussions, ...messageNotices(store, person), ...academic]
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, 50).map((item) => ({ ...item, unread: !item.previouslyRead && !seen.has(item.key) }));
}
