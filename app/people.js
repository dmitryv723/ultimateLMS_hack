import { students, studentWork } from './fixtures.js';

export const employees = [
  { id: 'teacher', login: 'teacher', fullName: 'Мария Викторовна Ланцова', role: 'teacher', roleName: 'Преподаватель',
    unit: 'Кафедра экономики и аналитики', email: 'teacher@dean.example',
    profile: {
      degree: 'Кандидат экономических наук', title: 'Доцент',
      room: 'А-208', phone: '+7 (000) 000-00-11',
      hours: 'Среда и пятница, 14:00–16:00 МСК, ауд. А-208'
    },
    teaching: [{ group: 'БА-24', courseId: 'statistics' }, { group: 'БА-24', courseId: 'micro' }] },
  { id: 'office', login: 'office', fullName: 'Софья Андреевна Егорова', role: 'office',
    roleName: 'Сотрудник студенческого офиса', unit: 'Студенческий офис', email: 'office@dean.example',
    profile: {
      room: 'Корпус А, кабинет 108', phone: '+7 (000) 000-00-12',
      hours: 'Будни, 10:00–17:00 МСК, обед с 13:00 до 14:00'
    } }
];

export const peopleById = new Map([...students, ...employees].map((person) => [person.id, person]));

export function teacherClassrooms(employee) {
  return (employee.teaching || []).flatMap(({ group, courseId }) => {
    const learners = students.filter((student) => student.group === group && student.subjects.some(({ id }) => id === courseId));
    const course = learners[0]?.subjects.find(({ id }) => id === courseId);
    return course ? [{ course, group, learners, id: courseId }] : [];
  });
}

export function teacherForCourse(student, courseId) {
  return employees.find(({ teaching }) => teaching?.some((item) => item.group === student.group && item.courseId === courseId));
}

export function learnerChatTeachers(student, store) {
  return [...new Set(student.subjects.map(({ id }) => teacherForCourse(student, id)))]
    .filter((teacher) => teacher && store.hasAccount(teacher.id));
}

export const staffChatPair = (first, second) => [first, second].sort();

export function studentData(store, base, date) {
  const courseFiles = store.coursePublications(base.group)
    .filter(({ course_id }) => base.subjects.some(({ id }) => id === course_id));
  const publishedWork = courseFiles.filter(({ kind }) => kind !== 'material').map((record) => ({
    id: record.id, attachment: record.filename, courseId: record.course_id, title: record.title,
    description: record.description, topic: record.topic_id, activityKey: 'publication:' + record.id,
    kind: record.kind, time: record.due_at,
    offset: Math.round((Date.parse(record.due_on) - Date.parse(date)) / 86_400_000)
  }));
  const results = new Map();
  for (const { course_id, activity_key, title, score } of store.publishedGrades(base.id)) {
    const course = base.subjects.find(({ id }) => id === course_id);
    if (!course) continue;
    const attachments = publishedWork.filter((work) => work.courseId === course_id && work.title === title);
    const hasSeedActivity = studentWork(base).some((work) => work.courseId === course_id && work.title === title) ||
      base.grades.some(([name, work]) => name === course.name && work === title);
    const key = activity_key.startsWith('title:') && attachments.length === 1 && !hasSeedActivity ? attachments[0].activityKey : activity_key;
    const currentTitle = publishedWork.find((work) => work.activityKey === key)?.title ?? title;
    results.set(course_id + '/' + key, [course.name, currentTitle, score, 'баллов', key]);
  }
  const publishedGrades = [...results.values()];
  const originalGrades = base.grades.filter(([name, title]) =>
    !publishedGrades.some(([course, , , , key]) => course === name && key === 'title:' + title));
  const requestUpdates = store.requestsFor(base.id).filter(({ status, staff_date }) =>
    staff_date && ['waiting', 'ready', 'rejected'].includes(status));
  const examResults = new Map(store.publishedSessionResults(base.id).map(({ exam_id, published }) => [exam_id, published]));
  const publishedExams = store.sessionExams(base.group).flatMap((exam) => {
    const course = base.subjects.find(({ id }) => id === exam.course_id);
    if (!course) return [];
    const offset = Math.round((Date.parse(exam.day) - Date.parse(date)) / 86_400_000);
    return [[course.name, exam.kind, offset, exam.time, exam.place, examResults.get(exam.id) ?? null, { id: exam.id, format: exam.format }]];
  });
  const exams = base.exams.filter(([subject, kind, offset]) => offset < 0 ||
    !publishedExams.some(([name, type]) => subject === name && kind === type)).concat(publishedExams)
    .sort((a, b) => a[2] - b[2] || a[3].localeCompare(b[3]));
  const displayName = store.studentDisplayName(base.id);
  const profile = displayName ? { name: displayName, initials: displayName.split(/\s+/).slice(0, 2)
    .map((part) => [...part][0]).join('').toUpperCase() } : {};
  return { ...base, ...profile, workDate: date, courseFiles, publishedWork, exams, grades: [...originalGrades, ...publishedGrades],
    lessonChanges: store.lessonChanges(base.group), onlineLessons: store.lessonLinks(base.group).filter(({ day }) => day >= date),
    requestUpdates };
}
