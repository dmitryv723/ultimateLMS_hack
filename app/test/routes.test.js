import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createApp } from '../server.js';
import { openStore } from '../store.js';
import { addDays, lessonsFor, today, weekStart } from '../fixtures.js';

const origin = 'http://127.0.0.1:3000';
const csrf = (html) => /name="csrf" value="([^"]+)"/.exec(html)[1];
const submission = (html) => /name="submission" value="([^"]+)"/.exec(html)[1];

// Drive the same request handler used by the server without reserving a network port.
function client(store) {
  const handler = createApp(store).listeners('request')[0];
  return async (url, { cookie, form, source = origin } = {}) => {
    const payload = form && new Response(form instanceof FormData ? form : new URLSearchParams(form));
    const req = Readable.from(payload ? [Buffer.from(await payload.arrayBuffer())] : []);
    Object.assign(req, {
      url, method: form ? 'POST' : 'GET',
      headers: { host: '127.0.0.1:3000', cookie, origin: source, 'content-type': payload?.headers.get('Content-Type') }
    });
    return new Promise((resolve) => {
      const res = {
        headers: {},
        setHeader(key, value) { this.headers[key] = value; },
        writeHead(status, headers = {}) {
          this.status = status;
          Object.assign(this.headers, headers);
          return this;
        },
        end(body) { resolve({ status: this.status, headers: this.headers, body }); }
      };
      handler(req, res);
    });
  };
}

async function signIn(request, { student, password }, next) {
  const form = { login: student.login, password };
  if (next) form.next = next;
  const reply = await request('/login', { form });
  assert.equal(reply.status, 303);
  assert.equal(reply.headers.Location, next ?? '/');
  assert.match(reply.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/);
  return reply.headers['Set-Cookie'].split(';')[0];
}

test('the office publishes session exams for a group and notifies students when dates change', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dean-session-'));
  const path = join(directory, 'session.sqlite');
  let store = openStore(path);
  try {
    const [anna, maksim, daria, teacher, dispatcher, office] = store.configureAccounts();
    let request = client(store);
    const [learner, outsider, classmate, faculty, schedule, staff] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, daria), signIn(request, teacher, '/staff/teaching'),
      signIn(request, dispatcher, '/staff/schedule'), signIn(request, office, '/staff/session')]);
    const list = '/staff/session';
    const create = list + '/new';
    const page = await request(create, { cookie: staff });
    assert.match(page.body, /<optgroup label="БА-24">[\s\S]*value="БА-24\/statistics"/);
    const exam = { csrf: csrf(page.body), submission: submission(page.body), classroom: 'БА-24/statistics', kind: 'Экзамен',
      day: addDays(today(), 12), time: '14:35', format: 'campus', place: 'В-420' };
    for (const cookie of [faculty, schedule]) assert.equal((await request(create, { cookie })).status, 404);
    assert.equal((await request(create, { cookie: learner })).status, 403);
    assert.equal((await request(create, { cookie: staff, form: { ...exam, classroom: 'МО-23/statistics' } })).status, 422);
    assert.equal((await request(create, { cookie: staff, form: exam })).headers.Location, list);
    assert.equal((await request(create, { cookie: staff, form: exam })).status, 303);
    assert.equal(store.sessionExams().length, 1);
    const id = 'exam-' + exam.submission;
    const session = `/study/${anna.student.id}/session`;
    assert.match((await request(session, { cookie: learner })).body, new RegExp(`id="${id}"[\\s\\S]*?14:35 МСК · Очно · ауд\\. В-420`));
    assert.match((await request(`/study/${daria.student.id}/session`, { cookie: classmate })).body, /В-420/);
    assert.doesNotMatch((await request(`/study/${maksim.student.id}/session`, { cookie: outsider })).body, /В-420/);
    assert.match((await request('/notifications', { cookie: learner })).body, new RegExp(`href="${session}#${id}"[\\s\\S]*?Опубликовано испытание`));
    assert.doesNotMatch((await request('/notifications', { cookie: outsider })).body, /Опубликовано испытание/);

    const edit = list + '/' + exam.submission;
    const editPage = await request(edit, { cookie: staff });
    const revision = /name="revision" value="([^"]+)"/.exec(editPage.body)[1];
    const changed = { csrf: csrf(editPage.body), revision, kind: exam.kind, day: addDays(exam.day, 1), time: '17:10',
      format: 'online', place: 'https://example.org/exam-room' };
    assert.equal((await request(edit, { cookie: staff, form: { ...changed, place: 'javascript:alert(1)' } })).status, 422);
    assert.equal((await request(edit, { cookie: staff, form: changed })).status, 303);
    assert.equal((await request(edit, { cookie: staff, form: changed })).status, 409);
    assert.match((await request('/notifications', { cookie: learner })).body, /Изменилось расписание сессии/);

    store.close();
    store = openStore(path);
    request = client(store);
    const updated = (await request(session, { cookie: learner })).body;
    assert.match(updated, /17:10 МСК · Онлайн · <a class="text-link" href="https:\/\/example\.org\/exam-room">Подключиться/);
    assert.doesNotMatch(updated, /В-420/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('teachers save private drafts and publish individual session results for their assigned courses', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, daria, teacher, , office] = store.configureAccounts();
    const request = client(store);
    const [learner, classmate, faculty, staff] = await Promise.all([signIn(request, anna), signIn(request, daria),
      signIn(request, teacher, '/staff/teaching'), signIn(request, office, '/staff/session')]);
    const date = today();
    const exam = { kind: 'Экзамен', day: addDays(date, -1), time: '14:00', format: 'campus', place: 'А-171' };
    const course = (student, id) => student.student.subjects.find((subject) => subject.id === id);
    const id = 'a'.repeat(24), denied = 'b'.repeat(24), credit = 'c'.repeat(24);
    store.createSessionExam(id, { group: anna.student.group, course: course(anna, 'statistics') }, exam, date);
    store.createSessionExam(denied, { group: maksim.student.group, course: maksim.student.subjects[0] }, exam, date);
    store.createSessionExam(credit, { group: anna.student.group, course: course(anna, 'micro') }, { ...exam, kind: 'Зачёт' }, date);
    const teacherPath = '/staff/teaching/session';
    const sheet = teacherPath + '/' + id;
    const list = (await request(teacherPath, { cookie: faculty })).body;
    assert.ok(list.includes(sheet));
    assert.ok(!list.includes(teacherPath + '/' + denied));
    assert.equal((await request(teacherPath + '/' + denied, { cookie: faculty })).status, 404);
    assert.equal((await request(sheet, { cookie: staff })).status, 404);
    const gradeForm = { csrf: csrf((await request(sheet, { cookie: faculty })).body), student: anna.student.id,
      revision: '0', action: 'draft', result: '91 / 100' };
    assert.equal((await request(sheet, { cookie: faculty, form: { ...gradeForm, student: maksim.student.id } })).status, 404);
    assert.equal((await request(sheet, { cookie: faculty, form: { ...gradeForm, result: '101 / 100' } })).status, 422);
    assert.equal((await request(sheet, { cookie: faculty, form: gradeForm })).status, 303);
    const studentPath = `/study/${anna.student.id}/session`;
    const draftPage = (await request(studentPath, { cookie: learner })).body;
    assert.match(draftPage, /Оценка ещё не опубликована/);
    assert.doesNotMatch(draftPage, /91 \/ 100/);
    assert.doesNotMatch((await request('/notifications', { cookie: learner })).body, /Опубликован результат сессии/);

    const publish = { ...gradeForm, action: 'publish', revision: '1' };
    assert.equal((await request(sheet, { cookie: faculty, form: publish })).status, 303);
    assert.equal((await request(sheet, { cookie: faculty, form: publish })).status, 409);
    assert.match((await request(studentPath, { cookie: learner })).body, /91 \/ 100/);
    assert.match((await request(`/study/${anna.student.id}/grades`, { cookie: learner })).body, /91 \/ 100/);
    assert.match((await request('/notifications', { cookie: learner })).body, /Опубликован результат сессии/);
    assert.doesNotMatch((await request(`/study/${daria.student.id}/session`, { cookie: classmate })).body, /91 \/ 100/);
    assert.doesNotMatch((await request('/notifications', { cookie: classmate })).body, /Опубликован результат сессии/);

    assert.equal((await request(sheet, { cookie: faculty, form: { ...gradeForm, revision: '2', result: '93 / 100' } })).status, 303);
    assert.doesNotMatch((await request(studentPath, { cookie: learner })).body, /93 \/ 100/);
    assert.equal((await request(sheet, { cookie: faculty, form: { ...publish, revision: '3', result: '93 / 100' } })).status, 303);
    assert.match((await request('/notifications', { cookie: learner })).body, /Результат сессии обновлён/);
    assert.equal((await request(teacherPath + '/' + credit, { cookie: faculty, form: { ...publish, revision: '0', result: '80' } })).status, 422);
    assert.equal((await request(teacherPath + '/' + credit, { cookie: faculty, form: { ...publish, revision: '0', result: 'Не зачтено' } })).status, 303);
    assert.match((await request(studentPath, { cookie: learner })).body, /Не зачтено/);
  } finally {
    store.close();
  }
});

test('office announcements reach only their selected group or active course', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, daria, teacher, dispatcher, office] = store.configureAccounts();
    const request = client(store);
    const staffPath = '/staff/announcements';
    const newPath = staffPath + '/new';
    const [learner, other, classmate, faculty, scheduler, staff] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, daria), signIn(request, teacher, '/staff/teaching'),
      signIn(request, dispatcher, '/staff/schedule'), signIn(request, office, staffPath)]);
    assert.equal((await request(newPath, { cookie: learner })).status, 403);
    assert.equal((await request(newPath, { cookie: faculty })).status, 404);
    assert.equal((await request(newPath, { cookie: scheduler })).status, 404);
    const form = (await request(newPath, { cookie: staff })).body;
    assert.match(form, /Группы[\s\S]*МО-23[\s\S]*Курсы[\s\S]*Прикладная статистика/);
    const group = { csrf: csrf(form), submission: submission(form), audience: 'group:МО-23',
      title: 'Встреча в корпусе А', body: 'Сбор в **14:00** у стойки учебного офиса.' };
    assert.equal((await request(newPath, { cookie: staff, form: { ...group, audience: 'group:unknown' } })).status, 422);
    assert.equal((await request(newPath, { cookie: staff, form: { ...group, csrf: 'invalid' } })).status, 403);
    assert.equal((await request(newPath, { cookie: staff, form: group })).headers.Location, staffPath);
    assert.equal((await request(newPath, { cookie: staff, form: group })).status, 303);
    assert.equal(store.officeAnnouncements().length, 1);
    const nextForm = (await request(newPath, { cookie: staff })).body;
    const course = { csrf: csrf(nextForm), submission: submission(nextForm), audience: 'course:statistics',
      title: 'Семинар по выборкам', body: '**Решите задачи 1–3** к следующей паре.' };
    assert.equal((await request(newPath, { cookie: staff, form: course })).status, 303);
    assert.match((await request(staffPath, { cookie: staff })).body, /Встреча в корпусе А/);
    const groupPath = '/announcements/' + group.submission;
    const coursePath = '/announcements/' + course.submission;
    for (const route of ['/', '/announcements', '/notifications']) {
      for (const cookie of [learner, classmate]) {
        const page = (await request(route, { cookie })).body;
        assert.ok(page.includes(`href="${coursePath}"`));
        assert.doesNotMatch(page, /Встреча в корпусе А/);
      }
      const otherPage = (await request(route, { cookie: other })).body;
      assert.ok(otherPage.includes(`href="${groupPath}"`));
      assert.doesNotMatch(otherPage, /Семинар по выборкам/);
    }
    assert.match((await request(coursePath, { cookie: learner })).body, /<strong>Решите задачи 1–3<\/strong>/);
    assert.equal((await request(coursePath, { cookie: other })).status, 404);
    assert.equal((await request(groupPath, { cookie: learner })).status, 404);
    assert.equal((await request(coursePath)).headers.Location, '/login?next=' + encodeURIComponent(coursePath));
  } finally {
    store.close();
  }
});

test('the courses home shows dated work and keeps personal reminders private', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim] = store.configureAccounts();
    const request = client(store);
    const [cookie, otherCookie] = await Promise.all([signIn(request, anna), signIn(request, maksim)]);
    const home = await request('/', { cookie });
    assert.equal(home.status, 200);
    assert.match(home.body, /<h1>Активные курсы<\/h1>/);
    assert.match(home.body, /class="topbar-shortcuts"[\s\S]*Мои курсы[\s\S]*Расписание/);
    assert.match(home.body, /class="nav-group" data-current[\s\S]*href="\/courses\/active"[\s\S]*href="\/courses\/archive"/);
    assert.match(home.body, /Ближайшие активности/);
    const allActivities = await request('/?all=1', { cookie });
    assert.match(allActivities.body, /Домашнее задание/);
    assert.match(allActivities.body, /Начало в/);
    assert.match(allActivities.body, /Вне LMS/);
    assert.ok(home.body.indexOf('id="courses-heading"') < home.body.indexOf('id="activity-heading"'));
    const courseTitles = [...home.body.matchAll(/<span class="home-course-name">([^<]+)<\/span>/g)];
    assert.deepEqual(courseTitles.map(([, title]) => title), anna.student.subjects.map(({ name }) => name));
    assert.equal(courseTitles.length, 8);
    assert.doesNotMatch(home.body, /М\. В\. Ланцова/);
    const courseLinks = [...home.body.matchAll(/class="home-course home-course-tile" id="course-(\w+)" href=/g)].map((match) => match[1]);
    assert.deepEqual(courseLinks, anna.student.subjects.map(({ id }) => id));
    assert.doesNotMatch(home.body, /class="course-view"|<details class="home-course"|Конкурсный концепт|Данные вымышлены/);
    assert.match(home.body, /data-sidebar-toggle\s+aria-controls="student-sidebar" aria-expanded="false"/);
    assert.doesNotMatch((await request('/', { cookie: otherCookie })).body, /Доверительные интервалы/);

    const formPage = await request('/?new=1&course=english', { cookie });
    assert.match(formPage.body, /value="english" selected/);
    const form = { csrf: csrf(formPage.body), submission: submission(formPage.body), title: 'Прочитать главу',
      course: 'english', day: today(), time: '17:00', link: 'https://example.org/notes' };
    assert.equal((await request('/reminders', { cookie, form: { ...form, link: 'javascript:alert(1)' } })).status, 422);
    assert.equal((await request('/reminders', { cookie, form: { ...form, course: 'negotiations' } })).status, 422);
    assert.equal((await request('/reminders', { cookie, form })).status, 303);
    assert.equal((await request('/reminders', { cookie, form })).status, 303);
    const personal = store.remindersFor(anna.student.id).filter((item) => item.title === form.title);
    assert.equal(personal.length, 1);
    assert.match((await request('/?all=1', { cookie })).body, /href="https:\/\/example\.org\/notes"/);
    const action = '/reminders/' + personal[0].id;
    const otherHome = await request('/?new=1', { cookie: otherCookie });
    assert.doesNotMatch(otherHome.body, /Прочитать главу/);
    assert.equal((await request(action + '/done', { cookie: otherCookie, form: { csrf: csrf(otherHome.body) } })).status, 404);
    assert.equal((await request(action + '/done', { cookie, form: { csrf: form.csrf } })).status, 303);
    assert.match((await request('/?all=1', { cookie })).body, /Выполненные личные задачи/);
    assert.equal((await request(action + '/restore', { cookie, form: { csrf: form.csrf } })).status, 303);
    assert.equal(store.remindersFor(anna.student.id).find(({ id }) => id === personal[0].id).done, 0);
  } finally {
    store.close();
  }
});

test('standalone course pages show only the selected subject and open directly from activities', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim] = store.configureAccounts();
    const request = client(store);
    const [cookie, otherCookie] = await Promise.all([signIn(request, anna), signIn(request, maksim)]);
    const formerLink = await request('/?course=statistics&tab=tests', { cookie });
    assert.equal(formerLink.headers.Location, '/courses/statistics?tab=tests');
    assert.equal(formerLink.status, 302);
    const materials = (await request('/courses/statistics', { cookie })).body;
    assert.match(materials, /<h1>Прикладная статистика<\/h1>/);
    assert.match(materials, /href="\/#course-statistics"[^>]*>.*Мои курсы/);
    assert.doesNotMatch(materials, /aria-label="Разделы курса"|<h3>(Материалы|Домашние задания|Контрольные)<\/h3>/);
    assert.match(materials, /class="course-side"[\s\S]*Силлабус[\s\S]*Ближайший дедлайн[\s\S]*Чат курса/);
    const deadlineHref = /href="(\/courses\/statistics\?tab=topics&amp;item=[a-z]+)#(work-[a-z]+)">Открыть задание/.exec(materials);
    assert.ok(deadlineHref);
    const deadline = await request(deadlineHref[1].replace('&amp;', '&'), { cookie });
    assert.match(deadline.body, new RegExp('class="course-entry" open id="' + deadlineHref[2] + '"'));
    assert.match(materials, /href="\/syllabus"[\s\S]*href="\/profile\/anna"[\s\S]*id="student-sidebar"[\s\S]*id="main"/);
    const topic = /id="topic-intervals"([\s\S]+?)id="topic-hypotheses"/.exec(materials)[1];
    assert.match(topic, /Как построить доверительный интервал[\s\S]*Сдать до/);
    const syllabus = (await request('/syllabus', { cookie })).body;
    assert.match(syllabus, /Силлабус университета[\s\S]*Бизнес-аналитика[\s\S]*Международные отношения/);
    assert.match(materials, /Выборка и описательная статистика/);
    assert.doesNotMatch(materials.split('<main id="main"')[1], /home-cards|activity-heading|primary-nav|Академический английский/);
    const home = (await request('/?all=1', { cookie })).body;
    assert.match(home, /href="\/courses\/statistics\?tab=assignments&amp;item=hypotheses"/);
    assert.match(home, /href="\/courses\/statistics\?tab=tests"/);
    const homework = (await request('/courses/statistics?tab=assignments&item=hypotheses', { cookie })).body;
    assert.match(homework, /id="topic-hypotheses" open/);
    assert.match(homework, /class="course-entry" open id="work-hypotheses">\s*<summary><span><strong>Проверка гипотез о среднем/);
    const tests = (await request('/courses/statistics?tab=tests', { cookie })).body;
    assert.match(tests, /Работа длится 45 минут/);
    assert.match((await request('/study/anna/grades/statistics', { cookie })).body, /18 \/ 20/);
    const english = (await request('/courses/english?tab=assignments', { cookie })).body;
    assert.match(english, /<h1>Академический английский<\/h1>/);
    assert.match(english, /Письменная контрольная[\s\S]*27 \/ 30[\s\S]*Промежуточная аттестация[\s\S]*Зачтено/);
    assert.match(english, /Чат курса/);
    assert.doesNotMatch(english.split('<main id="main"')[1], /class="course-entry"|home-cards|activity-heading|Прикладная статистика/);
    const product = (await request('/courses/product', { cookie })).body;
    assert.match(product, /<h1>Продуктовая аналитика<\/h1>[\s\S]*Чат курса/);
    assert.equal((await request('/courses/english', { cookie: otherCookie })).status, 404);
  } finally {
    store.close();
  }
});

test('authenticated session opens the same transferred lesson from both lists', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim] = store.configureAccounts();
    const request = client(store);
    const unauthenticated = await request('/schedule/week');
    assert.equal(unauthenticated.status, 302);
    assert.equal(unauthenticated.headers.Location, '/login?next=%2Fschedule%2Fweek');

    const [annaCookie, maksimCookie] = await Promise.all([signIn(request, anna, '/schedule/week'), signIn(request, maksim)]);
    for (const [cookie, otherCookie] of [[annaCookie, maksimCookie], [maksimCookie, annaCookie]]) {
      const schedule = await request('/schedule/week?date=' + today(), { cookie });
      const notices = await request('/notifications', { cookie });
      assert.match(schedule.body, /<table class="week-table"/);
      assert.equal([...schedule.body.matchAll(/<th scope="col"/g)].length, 8);
      assert.equal([...schedule.body.matchAll(/<th scope="row"/g)].length, 10);
      assert.match(schedule.body, /<time>08:00<\/time><time>09:30<\/time>/);
      assert.match(schedule.body, /<time>09:40<\/time><time>11:10<\/time>/);
      assert.match(schedule.body, /<time>21:20<\/time><time>22:50<\/time>/);
      assert.match(schedule.body, /<td class="week-day(?: week-selected)?"><\/td>/);
      assert.doesNotMatch(schedule.body, /Московское время|Без занятий/);
      assert.doesNotMatch(schedule.body, /Период расписания/);
      const fourth = /href="(\/schedule\/lesson\/[a-z]+-\d{4}-\d{2}-\d{2}-4)"/.exec(schedule.body)[1];
      assert.equal((await request(fourth, { cookie })).status, 200);
      const path = /class="week-lesson lesson-moved" href="([^"]+)/.exec(schedule.body)[1];
      assert.ok(notices.body.includes('href="' + path + '"'));
      const details = await request(path, { cookie });
      assert.match(details.body, /Что изменилось/);
      assert.match(details.body, /<s>\d{2}:\d{2}–\d{2}:\d{2}<\/s>/);
      assert.match(details.body, /<s>Ауд\./);
      assert.equal((await request(path, { cookie: otherCookie })).status, 404);
      const futureDay = addDays(weekStart(today()), 7);
      const future = await request('/schedule/week?date=' + futureDay, { cookie });
      assert.ok(future.body.includes('id="day-' + futureDay + '"'));
      assert.doesNotMatch(future.body, /week-today/);
      assert.match(future.body, /class="week-day week-selected"/);
      const futureLessonPath = /class="week-lesson lesson-moved" href="([^"]+)/.exec(future.body)[1];
      const futureLesson = await request(futureLessonPath, { cookie });
      const lessonDate = /\d{4}-\d{2}-\d{2}/.exec(futureLessonPath)[0];
      assert.ok(futureLesson.body.includes('href="/schedule/week?date=' + lessonDate + '"'));
    }
  } finally {
    store.close();
  }
});

test('grades, session and certificates use the updated navigation', async () => {
  const store = openStore(':memory:');
  try {
    const [anna] = store.configureAccounts();
    const request = client(store);
    const cookie = await signIn(request, anna);
    const grades = await request('/study/anna/grades', { cookie });
    assert.match(grades.body, /<h1>Оценки<\/h1>/);
    assert.match(grades.body, /Дисциплина[\s\S]*Итоговый балл[\s\S]*Балл за сессию/);
    const gradeLinks = [...grades.body.matchAll(/href="\/study\/anna\/grades\/([a-z]+)"/g)].map(([, courseId]) => courseId);
    assert.deepEqual(gradeLinks, anna.student.subjects.map(({ id }) => id));
    assert.match(grades.body, /SQL и базы данных[\s\S]*87 \/ 100[\s\S]*38 \/ 40/);
    assert.doesNotMatch(grades.body, /Контрольная работа № 2|18 \/ 20/);
    const statistics = (await request('/study/anna/grades/statistics', { cookie })).body;
    assert.match(statistics, /<h1>Прикладная статистика<\/h1>/);
    assert.match(statistics, /Контрольная работа № 2[\s\S]*18 \/ 20/);
    assert.match(statistics, /Доверительные интервалы[\s\S]*Оценка ещё не опубликована/);
    assert.doesNotMatch(statistics, /Письменная контрольная/);
    const empty = (await request('/study/anna/grades/probability', { cookie })).body;
    assert.match(empty, /Активности по этой дисциплине пока не опубликованы/);
    assert.equal((await request('/study/maksim/grades/negotiations', { cookie })).status, 404);
    const session = await request('/study/anna/session', { cookie });
    assert.match(session.body, /Предстоящие испытания/);
    assert.match(session.body, /10:00 МСК · ауд\. А-208/);
    assert.match((await request('/services', { cookie })).body, /<h1>Справки и обращения<\/h1>/);
  } finally {
    store.close();
  }
});

test('the notification bell exposes four entries from the full feed', async () => {
  const store = openStore(':memory:');
  try {
    const [anna] = store.configureAccounts();
    const request = client(store);
    const cookie = await signIn(request, anna);
    const home = (await request('/', { cookie })).body;
    assert.match(home, /popovertarget="notice-popover" aria-label="Уведомления"/);
    const popup = home.match(/<section id="notice-popover"[\s\S]*?<\/section>/)[0];
    assert.equal([...popup.matchAll(/<li><a href="/g)].length, 4);
    assert.match(popup, /href="\/notifications">Смотреть все уведомления/);
    assert.doesNotMatch(popup, /Неделя открытых лекций/);
    const feed = (await request('/notifications', { cookie })).body;
    assert.match(feed, /class="panel feed-item" href="\/notifications\/library-week"/);
    assert.match(feed, /class="panel feed-item" href="\/notifications\/project-deadline"/);
  } finally {
    store.close();
  }
});

test('the archive, syllabus and service cases work from their student entry points', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim] = store.configureAccounts();
    const request = client(store);
    const [cookie, otherCookie] = await Promise.all([signIn(request, anna), signIn(request, maksim)]);
    const archived = (await request('/courses/archive', { cookie })).body;
    assert.match(archived, /href="\/courses\/calculus"/);
    assert.match(archived, /Семестр закрытия[\s\S]*<td>2-й<\/td>/);
    assert.doesNotMatch(archived, /href="\/courses\/statistics"/);
    assert.match((await request('/courses/active', { cookie })).body, /Текущий семестр[\s\S]*<td>3-й<\/td>/);
    assert.match((await request('/courses/calculus', { cookie })).body, /Архив · Весенний семестр[\s\S]*Исследование функции/);
    assert.equal((await request('/courses/calculus', { cookie: otherCookie })).status, 404);
    const activeWork = (await request('/homework', { cookie })).body;
    assert.match(activeWork, /href="\/courses\/statistics\?tab=assignments&amp;item=intervals"/);
    assert.match(activeWork, /class="homework-course">Прикладная статистика<\/span>[\s\S]*Доверительные интервалы[\s\S]*23:59/);
    assert.doesNotMatch(activeWork, /Обработка данных из CSV|Контрольная работа № 3/);
    const archivedWork = (await request('/homework?view=archive', { cookie })).body;
    assert.match(archivedWork, /Обработка данных из CSV[\s\S]*Оценено · 20 \/ 20/);
    assert.match((await request('/courses/statistics?tab=syllabus', { cookie })).body, /href="\/courses\/statistics" data-syllabus-back[\s\S]*Силлабус · демо/);
    const search = (q) => '/syllabus?' + new URLSearchParams({ q });
    const faqSearch = (await request(search('справка'), { cookie })).body;
    assert.match(faqSearch, /href="\/syllabus" data-syllabus-back[\s\S]*name="q"[^>]+value="справка"/);
    assert.match(faqSearch, /Результаты поиска[\s\S]*view=university&amp;question=certificate/);
    const faq = (await request('/syllabus?view=university&question=certificate', { cookie })).body;
    assert.match(faq, /<details class="panel syllabus-question" open>[\s\S]*?Как заказать справку об обучении\?[\s\S]*?href="\/services\/categories\/certificates"/);
    const program = '/syllabus?' + new URLSearchParams({ view: 'program', program: 'Бизнес-аналитика' });
    assert.match((await request(program, { cookie })).body, /href="\/syllabus\?view=faculty&amp;faculty=[^"]+" data-syllabus-back[\s\S]*Учебный план[\s\S]*Вопросы по программе[\s\S]*view=subject&amp;subject=statistics/);
    assert.match((await request('/syllabus?view=courses', { cookie: otherCookie })).body, /Мои дисциплины[\s\S]*Международные отношения/);
    const statistics = '/syllabus?view=subject&subject=statistics&question=grading';
    assert.match((await request(statistics, { cookie })).body, /<dd>40%<\/dd>[\s\S]*?<details class="panel syllabus-question" open>[\s\S]*?Из чего складывается итоговая оценка/);
    assert.doesNotMatch((await request(statistics, { cookie: otherCookie })).body, /href="\/courses\/statistics["?]/);
    assert.match((await request(search('<script>'), { cookie })).body, /По запросу «&lt;script&gt;» ничего не найдено/);
    const catalog = (await request('/services', { cookie })).body;
    for (const category of ['certificates', 'applications', 'military', 'migration', 'payments', 'documents']) {
      assert.ok(catalog.includes('/services/categories/' + category));
    }
    for (const service of ['grade', 'profile', 'retake']) assert.equal((await request('/services/new/' + service, { cookie })).status, 404);
    const path = '/services/new/schedule';
    const form = (await request(path, { cookie })).body;
    const fields = { csrf: csrf(form), submission: submission(form), message: 'Хочу уточнить аудиторию для семинара.' };
    assert.equal((await request(path, { cookie, form: { ...fields, message: ' ' } })).status, 422);
    const created = await request(path, { cookie, form: fields });
    assert.equal(created.status, 303);
    assert.equal((await request(path, { cookie, form: fields })).headers.Location, created.headers.Location);
    assert.match((await request(created.headers.Location, { cookie })).body, /Ваше обращение[\s\S]*Хочу уточнить аудиторию/);
    assert.match((await request('/services/requests', { cookie })).body, /Вопрос о расписании/);
    assert.equal((await request(created.headers.Location, { cookie: otherCookie })).status, 404);
  } finally {
    store.close();
  }
});

test('weekly deadlines share the same data as the student dashboard', async () => {
  const store = openStore(':memory:');
  try {
    const [anna] = store.configureAccounts();
    const request = client(store);
    const cookie = await signIn(request, anna);
    const week = (await request('/schedule/week?date=' + today(), { cookie })).body;
    assert.match(week, /<tfoot>[\s\S]*Дедлайны[\s\S]*Доверительные интервалы/);
    assert.match(week, /<tfoot>[\s\S]*href="\/courses\/statistics\?tab=assignments&amp;item=intervals"/);
    const footer = /<tfoot>([\s\S]+?)<\/tfoot>/.exec(week)[1];
    const cells = [...footer.matchAll(/<td[^>]+>([\s\S]*?)<\/td>/g)];
    assert.equal([...cells[1][1].matchAll(/<li>/g)].length, 3);
    assert.equal([...cells[2][1].matchAll(/<li>/g)].length, 2);
    assert.match(week, /class="button-secondary week-current"[^>]*>Текущая неделя/);
  } finally {
    store.close();
  }
});

test('password reset consumes one code and invalidates old student sessions', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim] = store.configureAccounts();
    const request = client(store);
    const [cookie, otherCookie] = await Promise.all([signIn(request, anna), signIn(request, maksim)]);
    const superseded = store.issueResetCode(anna.student.login);
    const code = store.issueResetCode(anna.student.login);
    const password = 'testing-new-password-2026';
    const form = { code, password, confirm: password };
    assert.equal((await request('/reset-password', { form: { ...form, code: superseded } })).status, 422);
    assert.equal((await request('/reset-password', { form })).headers.Location, '/login?reset=1');
    assert.equal((await request('/reset-password', { form })).status, 422);
    assert.equal((await request('/', { cookie })).status, 302);
    assert.equal((await request('/', { cookie: otherCookie })).status, 200);
    assert.equal(await store.authenticate(anna.student.login, anna.password), null);
    assert.equal(await store.authenticate(anna.student.login, password), anna.student.id);
  } finally {
    store.close();
  }
});

test('the teacher publishes course files and text assignments by topic and grades each enrolled student', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, daria, teacher] = store.configureAccounts();
    const request = client(store);
    const [studentCookie, otherCookie, peerCookie, cookie] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, daria), signIn(request, teacher, '/staff/courses')
    ]);
    const root = '/staff/teaching/publications';
    assert.equal((await request(root, { cookie: studentCookie })).status, 403);
    assert.equal((await request('/staff/requests', { cookie })).status, 404);
    assert.equal((await request('/study/anna/grades', { cookie })).status, 403);
    const topics = (await request(root, { cookie })).body;
    assert.match(topics, /Прикладная статистика[\s\S]*Доверительные интервалы[\s\S]*Микроэкономика[\s\S]*Спрос и предложение/);
    assert.doesNotMatch(topics, /type="file"/);
    assert.equal([...topics.matchAll(/<details class="panel course-topic-row staff-publication-topic"/g)].length, 8);
    assert.match(topics, /id="publication-topic-statistics-general">\s*<summary>[\s\S]*?Введение и организационные материалы[\s\S]*?\/statistics\/general\?kind=test/);
    assert.match(topics, /id="publication-topic-micro-demand">[\s\S]*?<a href="\/staff\/teaching\/publications\/micro\/demand\/sample-[a-f0-9]{24}"><span><strong>Построить кривую спроса/);
    const sample = (await request(root + '/statistics/samples/sample-material', { cookie })).body;
    assert.match(sample, /Выборочное среднее показывает центр данных/);
    assert.doesNotMatch(sample, />Редактировать</);
    assert.equal((await request(root + '/statistics/general/sample-material', { cookie })).status, 404);
    const samplesOpen = (await request(root + '?course=statistics&topic=samples', { cookie })).body;
    assert.match(samplesOpen, /id="publication-topic-statistics-samples" open>/);
    const path = root + '/statistics/samples';
    const form = (await request(path + '?kind=homework', { cookie })).body;
    const fields = new FormData();
    for (const [name, value] of Object.entries({ csrf: csrf(form), submission: submission(form), title: 'Практикум по выборкам',
      kind: 'homework', day: today(), time: '20:00', description: 'Набор примеров для практикума.' })) fields.set(name, value);
    assert.equal((await request(path, { cookie, form: fields })).status, 303);
    assert.equal((await request(path, { cookie, form: fields })).status, 303);
    const home = (await request('/homework', { cookie: studentCookie })).body;
    assert.equal([...home.matchAll(/Практикум по выборкам/g)].length, 1);
    assert.doesNotMatch((await request('/homework', { cookie: otherCookie })).body, /Практикум по выборкам/);
    assert.match((await request('/schedule/week?date=' + today(), { cookie: studentCookie })).body, /<tfoot>[\s\S]*Практикум по выборкам/);
    const assignments = (await request('/courses/statistics?tab=assignments', { cookie: peerCookie })).body;
    assert.match(assignments, /Практикум по выборкам[\s\S]*Набор примеров для практикума/);
    assert.doesNotMatch(assignments, /\/course-files\//);
    const materialForm = (await request(path, { cookie })).body;
    const material = new FormData();
    material.set('csrf', csrf(materialForm));
    material.set('submission', submission(materialForm));
    material.set('kind', 'material');
    material.set('title', 'Конспект лекции для скачивания');
    material.set('attachment', new File(['a'.repeat(11 * 1024 * 1024)], 'Конспект.txt'));
    const oversized = await request(path, { cookie, form: material });
    assert.equal(oversized.status, 413);
    assert.match(oversized.body, /Выборка и описательная статистика[\s\S]*Файл слишком большой/);
    material.set('attachment', new File(['Набор примеров.', 'a'.repeat(620_000)], 'Конспект.txt'));
    assert.equal((await request(path, { cookie, form: material })).status, 303);
    const homeworkPublication = store.coursePublications(anna.student.group, 'statistics').find(({ kind }) => kind === 'homework');
    const detailPath = path + '/' + homeworkPublication.id;
    assert.ok((await request(root, { cookie })).body.includes(`href="${detailPath}"`));
    const detail = (await request(detailPath, { cookie })).body;
    assert.match(detail, /Практикум по выборкам[\s\S]*Набор примеров для практикума[\s\S]*Редактировать/);
    assert.match(detail, /\?course=statistics&amp;topic=samples#publication-topic-statistics-samples/);
    assert.equal((await request(root + '/statistics/general/' + homeworkPublication.id, { cookie })).status, 404);
    assert.equal((await request(detailPath, { cookie: studentCookie })).status, 403);
    const files = (await request('/courses/statistics?tab=materials', { cookie: studentCookie })).body;
    const filePath = /href="(\/course-files\/[a-f0-9]{32})"/.exec(files)?.[1];
    assert.ok(filePath);
    const file = await request(filePath, { cookie: studentCookie });
    assert.equal(file.status, 200);
    assert.match(file.headers['Content-Disposition'], /^attachment/);
    assert.equal(file.body.length, Buffer.byteLength('Набор примеров.') + 620_000);
    assert.equal((await request(filePath, { cookie })).status, 200);
    assert.equal((await request(filePath, { cookie: otherCookie })).status, 404);
    const gradeIndex = (await request('/staff/teaching/grades', { cookie })).body;
    assert.match(gradeIndex, /Прикладная статистика[\s\S]*Практикум по выборкам[\s\S]*Микроэкономика[\s\S]*Контрольная № 2/);
    const homeworkGrades = (await request('/staff/teaching/grades?type=homework', { cookie })).body;
    assert.match(homeworkGrades, /aria-current="page">Домашние задания/);
    assert.match(homeworkGrades, /Практикум по выборкам/);
    assert.doesNotMatch(homeworkGrades, /Контрольная работа № 2/);
    const controlGrades = (await request('/staff/teaching/grades?type=test', { cookie })).body;
    assert.match(controlGrades, /Контрольная работа № 2/);
    assert.doesNotMatch(controlGrades, /Практикум по выборкам/);
    const studentControls = (await request('/study/anna/grades/statistics?type=test', { cookie: studentCookie })).body;
    assert.match(studentControls, /Контрольная работа № 2/);
    assert.doesNotMatch(studentControls, /Практикум по выборкам/);
    const gradePath = /href="(\/staff\/teaching\/grades\/statistics\/[a-f0-9]+)"><span><strong>Практикум по выборкам/.exec(gradeIndex)?.[1];
    assert.ok(gradePath);
    const gradeForm = (await request(gradePath, { cookie })).body;
    assert.match(gradeForm, /Миронова Анна Сергеевна[\s\S]*Соколова Дарья Ильинична/);
    const grade = { csrf: csrf(gradeForm), student: 'anna', score: '9', max: '10' };
    assert.equal((await request(gradePath, { cookie, form: { ...grade, student: 'maksim' } })).status, 422);
    assert.equal((await request(gradePath, { cookie, form: grade })).status, 303);
    assert.equal((await request(gradePath, { cookie, form: { ...grade, student: 'daria', score: '7' } })).status, 303);
    assert.match((await request('/study/anna/grades/statistics', { cookie: studentCookie })).body, /Практикум по выборкам[\s\S]*9 \/ 10/);
    assert.match((await request('/study/daria/grades/statistics', { cookie: peerCookie })).body, /Практикум по выборкам[\s\S]*7 \/ 10/);
    const secondTopic = root + '/statistics/intervals';
    const anotherForm = (await request(secondTopic + '?kind=homework', { cookie })).body;
    fields.set('submission', submission(anotherForm));
    assert.equal((await request(secondTopic, { cookie, form: fields })).status, 303);
    const updatedIndex = (await request('/staff/teaching/grades', { cookie })).body;
    const sameTitle = [...updatedIndex.matchAll(/href="(\/staff\/teaching\/grades\/statistics\/[a-f0-9]+)"><span><strong>Практикум по выборкам/g)];
    assert.equal(sameTitle.length, 2);
    const secondGradePath = sameTitle.find(([, candidate]) => candidate !== gradePath)?.[1];
    assert.ok(secondGradePath);
    assert.match((await request(secondGradePath, { cookie })).body, /Балл не выставлен/);
    assert.match((await request(gradePath, { cookie })).body, /9 \/ 10[\s\S]*7 \/ 10/);
    const update = async (record, changes, expected = 303) => {
      const editPath = path + '/' + record.id + '/edit';
      const edit = await request(editPath, { cookie });
      assert.match(edit.body, /Редактирование публикации/);
      const form = new FormData();
      const values = { csrf: csrf(edit.body), submission: submission(edit.body), title: record.title,
        description: record.description, day: record.due_on ?? '', time: record.due_at ?? '', ...changes };
      for (const [name, value] of Object.entries(values)) form.set(name, value);
      assert.equal((await request(editPath, { cookie, form })).status, expected);
    };
    const records = store.coursePublications(anna.student.group, 'statistics').filter(({ topic_id }) => topic_id === 'samples');
    const materialRecord = records.find(({ kind }) => kind === 'material');
    await update(materialRecord, { title: 'Конспект выборок' });
    assert.deepEqual((await request(filePath, { cookie: studentCookie })).body, file.body);
    await update(materialRecord, { attachment: new File(['Новая версия'], 'выборки.txt') });
    assert.equal((await request(filePath, { cookie: studentCookie })).body.toString(), 'Новая версия');
    await update(records.find(({ kind }) => kind === 'homework'), { title: 'Практикум с разбором', time: '21:00' });
    assert.match((await request(gradePath, { cookie })).body, /Практикум с разбором[\s\S]*9 \/ 10/);
    assert.match((await request('/study/anna/grades/statistics', { cookie: studentCookie })).body, /Практикум с разбором[\s\S]*9 \/ 10/);
    const controlForm = new FormData();
    for (const [name, value] of Object.entries({ csrf: csrf(form), submission: submission((await request(path + '?kind=test', { cookie })).body),
      kind: 'test', day: today(), time: '12:00', title: 'Контрольная по выборкам', description: 'Две задачи.' })) controlForm.set(name, value);
    assert.equal((await request(path, { cookie, form: controlForm })).status, 303);
    const control = store.coursePublications(anna.student.group, 'statistics').find(({ kind }) => kind === 'test');
    await update(control, { title: 'Контрольная по выборкам и интервалам', time: '13:00' });
    assert.match((await request('/courses/statistics?tab=tests', { cookie: studentCookie })).body, /Контрольная по выборкам и интервалам/);
  } finally {
    store.close();
  }
});

test('staff profiles are personal and course chats separate group messages from private threads', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, daria, teacher, dispatcher, office] = store.configureAccounts();
    const request = client(store);
    const [studentCookie, otherCookie, peerCookie, cookie, dispatcherCookie, officeCookie] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, daria), signIn(request, teacher, '/staff/courses'),
      signIn(request, dispatcher, '/staff/schedule'), signIn(request, office, '/staff/requests')
    ]);
    for (const [account, session] of [[teacher, cookie], [dispatcher, dispatcherCookie], [office, officeCookie]]) {
      const profile = await request('/staff/profile', { cookie: session });
      assert.equal(profile.status, 200);
      assert.ok(profile.body.includes(account.student.fullName));
      assert.ok(profile.body.includes(account.student.email));
      assert.match(profile.body, /<header class="staff-topbar">[\s\S]*href="\/staff\/profile"[\s\S]*Профиль<\/a>/);
      assert.equal([...profile.body.matchAll(/href="\/staff\/profile"/g)].length, 1);
      assert.match(profile.body, /class="staff-signout" method="post" action="\/logout"/);
    }
    const index = (await request('/staff/teaching/chats', { cookie })).body;
    assert.match(index, /Чаты курсов[\s\S]*Прикладная статистика[\s\S]*Микроэкономика[\s\S]*Личные чаты[\s\S]*Миронова Анна Сергеевна/);
    assert.equal([...index.matchAll(/Миронова Анна Сергеевна/g)].length, 1);
    assert.doesNotMatch(index, /action="\/logout"/);
    const learnerChat = (await request('/courses/statistics?tab=chat', { cookie: studentCookie })).body;
    const studentMessage = { csrf: csrf(learnerChat), submission: submission(learnerChat), message: 'Когда начнётся контрольная?' };
    assert.equal((await request('/courses/statistics/chat', { cookie: studentCookie, form: studentMessage })).status, 303);
    const teacherChat = (await request('/staff/teaching/chats/statistics', { cookie })).body;
    assert.match(teacherChat, /Когда начнётся контрольная/);
    const privateView = '/courses/statistics?tab=chat&item=private';
    const privatePage = (await request(privateView, { cookie: studentCookie })).body;
    assert.match(privatePage, /Личный чат/);
    assert.equal((await request('/courses/statistics/chat/private', { cookie: studentCookie,
      form: { csrf: csrf(privatePage), submission: submission(privatePage), message: 'Это личный вопрос.' } })).status, 303);
    const direct = '/staff/teaching/chats/private/anna';
    assert.equal((await request('/staff/teaching/chats/statistics/anna', { cookie })).headers.Location, direct);
    assert.equal((await request('/staff/teaching/chats/micro/anna', { cookie })).headers.Location, direct);
    const privateThread = (await request(direct, { cookie })).body;
    assert.match(privateThread, /Это личный вопрос/);
    assert.doesNotMatch(privateThread, /Когда начнётся контрольная/);
    assert.equal((await request(direct, { cookie,
      form: { csrf: csrf(privateThread), submission: submission(privateThread), message: 'Это личный ответ преподавателя.' } })).status, 303);
    assert.match((await request(privateView, { cookie: studentCookie })).body, /Это личный ответ преподавателя/);
    assert.match((await request('/courses/micro?tab=chat&item=private', { cookie: studentCookie })).body, /Это личный вопрос[\s\S]*Это личный ответ преподавателя/);
    assert.doesNotMatch((await request(privateView, { cookie: peerCookie })).body, /Это личный (вопрос|ответ)/);
    assert.doesNotMatch((await request('/courses/statistics?tab=chat', { cookie: peerCookie })).body, /Это личный (вопрос|ответ)/);
    assert.equal((await request('/staff/teaching/chats/statistics/maksim', { cookie })).status, 404);
    assert.equal((await request('/courses/statistics?tab=chat', { cookie: otherCookie })).status, 404);
  } finally {
    store.close();
  }
});

test('personal chat migration keeps messages from both courses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dean-chat-'));
  const path = join(dir, 'chat.sqlite');
  try {
    const setup = openStore(path);
    setup.configureAccounts();
    setup.close();
    const legacy = new DatabaseSync(path);
    try {
      legacy.exec(`
        DROP TABLE private_course_messages;
        CREATE TABLE private_course_messages (
          id INTEGER PRIMARY KEY, group_name TEXT NOT NULL, course_id TEXT NOT NULL,
          teacher_id TEXT NOT NULL, student_id TEXT NOT NULL, author_id TEXT NOT NULL,
          author_name TEXT NOT NULL, message TEXT NOT NULL, sent_at TEXT NOT NULL, submission_key TEXT NOT NULL
        );
        INSERT INTO private_course_messages VALUES
          (1,'БА-24','statistics','teacher','anna','anna','Анна','По статистике','2026-11-21 12:00:00','one'),
          (2,'БА-24','micro','teacher','anna','teacher','Мария','По микроэкономике','2026-11-21 13:00:00','two');
      `);
    } finally {
      legacy.close();
    }
    const upgraded = openStore(path);
    try {
      assert.deepEqual(upgraded.privateCourseMessages('teacher','anna').map(({ message }) => message), ['По статистике','По микроэкономике']);
      assert.deepEqual(upgraded.privateCourseMessages('teacher','daria'), []);
    } finally {
      upgraded.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the office sees which group an empty day belongs to and can jump to the nearest lessons', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dean-empty-day-'));
  const store = openStore(join(dir, 'empty-day.sqlite'));
  try {
    const [, maksim, , , , office] = store.configureAccounts();
    const request = client(store);
    const officeCookie = await signIn(request, office, '/staff/schedule');
    const saturday = addDays(weekStart(today()), 5);
    const monday = addDays(saturday, 2);
    const otherGroup = encodeURIComponent(maksim.student.group);
    const emptyBA = await request('/staff/schedule?view=day&date=' + saturday, { cookie: officeCookie });
    assert.equal(emptyBA.status, 200);
    assert.match(emptyBA.body, /У группы БА-24 на эту дату занятий нет/);
    assert.ok(emptyBA.body.includes('/staff/schedule?group=%D0%91%D0%90-24&amp;date=' + monday),
      'БА-24 empty day links the nearest lessons of the same group');
    const emptyMO = await request('/staff/schedule?view=day&date=' + saturday + '&group=' + otherGroup, { cookie: officeCookie });
    assert.match(emptyMO.body, /У группы МО-23 на эту дату занятий нет/);
    assert.doesNotMatch(emptyMO.body, /У группы БА-24/);
    assert.ok(emptyMO.body.includes('/staff/schedule?group=' + otherGroup + '&amp;date=' + monday),
      'МО-23 empty day links the nearest lessons of the same group');
    assert.match((await request('/staff/schedule?view=day&date=' + monday, { cookie: officeCookie })).body, /class="staff-records"/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dispatch updates a group lesson and the office completes a student request', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dean-staff-'));
  const database = join(dir, 'staff.sqlite');
  let store = openStore(database);
  try {
    const [anna, maksim, , , dispatcher, office] = store.configureAccounts();
    let request = client(store);
    const [studentCookie, otherCookie, dispatcherCookie, officeCookie] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, dispatcher, '/staff/schedule'),
      signIn(request, office, '/staff/requests')
    ]);
    const day = addDays(weekStart(today()), 7);
    const schedule = '/staff/schedule/' + day + '/1';
    const move = { csrf: csrf((await request(schedule, { cookie: dispatcherCookie })).body), slot: '2', room: 'Б-777', reason: 'Обновили аудиторию' };
    assert.equal((await request(schedule, { cookie: officeCookie })).status, 200);
    assert.equal((await request(schedule, { cookie: dispatcherCookie, form: { ...move, slot: '1' } })).status, 422);
    assert.equal((await request(schedule, { cookie: dispatcherCookie, form: move })).status, 303);
    assert.match((await request('/schedule/lesson/anna-' + day + '-1', { cookie: studentCookie })).body, /Б-777[\s\S]*Обновили аудиторию/);
    assert.doesNotMatch((await request('/schedule/week?date=' + day, { cookie: otherCookie })).body, /Б-777/);
    assert.match((await request('/notifications', { cookie: studentCookie })).body, /Обновили аудиторию/);
    const dashboard = (await request('/staff/requests', { cookie: officeCookie })).body;
    assert.match(dashboard, /popovertarget="notice-popover" aria-label="Уведомления · новых 1"/);
    const otherGroup = encodeURIComponent(maksim.student.group);
    assert.equal((await request(schedule + '?group=' + otherGroup, { cookie: dispatcherCookie })).status, 404);
    const officeSchedule = (await request('/staff/schedule?group=' + otherGroup + '&date=' + day, { cookie: officeCookie })).body;
    assert.match(officeSchedule, /<select name="group">[\s\S]*МО-23/);
    assert.doesNotMatch(officeSchedule, /class="week-table"/);
    const currentWeek = (await request('/staff/schedule', { cookie: officeCookie })).body;
    assert.match(currentWeek, /class="week-day week-today"/);
    const weekPath = '/staff/schedule?group=' + otherGroup + '&date=' + day + '&view=week';
    const week = (await request(weekPath, { cookie: officeCookie })).body;
    assert.match(week, /class="week-table" aria-label="Занятия группы МО-23 на неделю"/);
    assert.equal([...week.matchAll(/scope="col"/g)].length, 8);
    assert.match(week, /Предыдущая неделя[\s\S]*Текущая неделя[\s\S]*Следующая неделя/);
    assert.doesNotMatch(week, /Б-777/);
    const lessonPath = schedule + '?group=' + otherGroup + '&view=week';
    assert.ok(week.includes('href="' + lessonPath.replaceAll('&', '&amp;') + '"'));
    const officeLesson = (await request(lessonPath, { cookie: officeCookie })).body;
    assert.match(officeLesson, /К расписанию на неделю/);
    const officeMove = await request(lessonPath, { cookie: officeCookie,
      form: { csrf: csrf(officeLesson), slot: '2', room: 'В-555', reason: 'Перенос второй группы' } });
    assert.equal(officeMove.status, 303);
    assert.equal(officeMove.headers.Location, weekPath);
    const updatedWeek = (await request(weekPath, { cookie: officeCookie })).body;
    assert.match(updatedWeek, /week-lesson lesson-moved[\s\S]*В-555/);
    assert.match((await request('/notifications', { cookie: otherCookie })).body, /Перенос второй группы/);
    assert.doesNotMatch((await request('/notifications', { cookie: studentCookie })).body, /Перенос второй группы/);
    const notices = (await request('/staff/notifications', { cookie: officeCookie })).body;
    assert.match(notices, /Перенос второй группы[\s\S]*Обновили аудиторию/);
    const seen = new URLSearchParams({ csrf: csrf(notices) });
    for (const [, key] of notices.matchAll(/name="notice" value="([^"]+)"/g)) seen.append('notice', key);
    assert.equal((await request('/staff/notifications', { cookie: officeCookie, form: seen })).status, 303);
    const createdForm = (await request('/services/new/other', { cookie: studentCookie })).body;
    const submitted = await request('/services/new/other', { cookie: studentCookie,
      form: { csrf: csrf(createdForm), submission: submission(createdForm), message: 'Прошу сверить результат за курс.' } });
    const staffPath = '/staff/requests/' + submitted.headers.Location.split('/').at(-1);
    const form = (await request(staffPath, { cookie: officeCookie })).body;
    assert.match(form, /Прошу сверить результат/);
    assert.equal((await request(staffPath, { cookie: dispatcherCookie })).status, 404);
    const token = csrf(form);
    assert.equal((await request(staffPath, { cookie: officeCookie, form: { csrf: token, expected: 'submitted' } })).status, 303);
    assert.equal((await request(staffPath, { cookie: officeCookie, form: { csrf: token, expected: 'submitted' } })).status, 409);
    assert.equal((await request(staffPath, { cookie: officeCookie,
      form: { csrf: token, expected: 'processing', reply: 'Результат сверили с ведомостью.' } })).status, 303);
    store.close();
    store = openStore(database);
    request = client(store);
    assert.match((await request(submitted.headers.Location, { cookie: studentCookie })).body, /Результат сверили с ведомостью/);
    assert.equal((await request(submitted.headers.Location, { cookie: otherCookie })).status, 404);
    assert.match((await request('/notifications', { cookie: studentCookie })).body, /На обращение ответили/);
    assert.match((await request('/schedule/week?date=' + day, { cookie: studentCookie })).body, /Б-777/);
    const afterRestart = (await request('/staff/notifications', { cookie: officeCookie })).body;
    assert.match(afterRestart, /Перенос второй группы/);
    assert.doesNotMatch(afterRestart, /новых \d|Отметить все прочитанными/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('certificate remains private after retry, restart and repeat sign-in', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dean-store-'));
  const path = join(dir, 'test.sqlite');
  let store = openStore(path);
  try {
    const [anna, maksim] = store.configureAccounts();
    let request = client(store);
    const annaCookie = await signIn(request, anna);
    const maksimCookie = await signIn(request, maksim);
    const formPage = await request('/services/certificate', { cookie: annaCookie });
    const form = { csrf: csrf(formPage.body), submission: submission(formPage.body), delivery: 'download', student_id: 'maksim' };
    assert.equal((await request('/services/certificate', { cookie: annaCookie, form, source: 'http://example.test' })).status, 403);
    assert.equal((await request('/services/certificate', { cookie: annaCookie, form: { ...form, csrf: csrf((await request('/services/certificate', { cookie: maksimCookie })).body) } })).status, 403);
    assert.equal((await request('/services/certificate', { cookie: annaCookie, form: { ...form, delivery: 'unknown' } })).status, 422);
    const create = () => request('/services/certificate', { cookie: annaCookie, form });
    const [created, retry] = await Promise.all([create(), create()]);
    const detail = created.headers.Location;
    assert.equal(created.status, 303);
    assert.equal(retry.headers.Location, detail);
    assert.match((await request(detail, { cookie: annaCookie })).body, /Принято/);
    assert.equal((await request(detail, { cookie: maksimCookie })).status, 404);
    assert.equal((await request(detail + '/download', { cookie: annaCookie })).status, 404);

    store.close();
    store = openStore(path);
    request = client(store);
    assert.equal((await request(detail, { cookie: annaCookie })).status, 200);
    const renewedCookie = await signIn(request, anna, detail);
    const history = (await request('/services/requests', { cookie: renewedCookie })).body;
    assert.ok(history.includes('href="' + detail + '"'));
    assert.ok(!(await request('/services/requests', { cookie: maksimCookie })).body.includes(detail));

    const ready = '/services/requests/demo-2014';
    assert.ok((await request('/notifications', { cookie: maksimCookie })).body.includes('href="' + ready + '"'));
    assert.match((await request('/services/requests/demo-1041', { cookie: annaCookie })).body, /корпус А, кабинет 108/);
    assert.match((await request('/services/requests/demo-1058', { cookie: annaCookie })).body, /В работе/);
    const download = await request(ready + '/download', { cookie: maksimCookie });
    assert.equal(download.status, 200);
    assert.match(download.headers['Content-Disposition'], /attachment/);
    assert.match(download.body, /КОНКУРСНЫЙ КОНЦЕПТ/);
    assert.equal((await request(ready + '/download', { cookie: annaCookie })).status, 404);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('teacher proposes a move and office resolves conflicts before publishing to the group', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, , teacher, , office] = store.configureAccounts();
    const request = client(store);
    const [student, other, instructor, employee] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, teacher, '/staff/teaching'),
      signIn(request, office, '/staff/office')
    ]);
    const teacherHome = await request('/staff/teaching', { cookie: instructor });
    assert.equal(teacherHome.status, 200);
    assert.match(teacherHome.body, /Сегодня[\s\S]*К проверке[\s\S]*Нет новых домашних работ[\s\S]*Мои переносы/);
    const day = addDays(weekStart(today()), 7);
    const lessons = lessonsFor(anna.student, day);
    const index = lessons.findIndex(({ id }) => teacher.student.teaching.some(({ courseId }) => courseId === id));
    assert.ok(index >= 0);
    const group = encodeURIComponent(anna.student.group);
    const lessonPath = '/staff/teaching/schedule/' + day + '/' + (index + 1) + '?group=' + group;
    const schedule = await request('/staff/teaching/schedule?date=' + day, { cookie: instructor });
    assert.ok(schedule.body.includes('href="' + lessonPath + '"'));
    const weekly = await request('/staff/teaching/schedule?view=week&date=' + day, { cookie: instructor });
    assert.match(weekly.body, /<table class="week-table"/);
    assert.match(weekly.body, /href="\/staff\/courses\/(statistics|micro)"/);
    const coursePage = await request('/staff/courses/' + lessons[index].id, { cookie: instructor });
    assert.ok(coursePage.body.includes('<h1>' + lessons[index].name + '</h1>'));
    assert.equal((await request('/staff/courses/geography', { cookie: instructor })).status, 404);
    assert.equal((await request(lessonPath.replace(group, encodeURIComponent(maksim.student.group)), { cookie: instructor })).status, 404);
    const changeForm = { csrf: csrf((await request(lessonPath, { cookie: instructor })).body),
      room: 'В-421', reason: 'Аудитория на ремонте', slot: String(lessons.find((_, number) => number !== index).slot) };
    const proposalPath = '/staff/schedule/proposals/';
    assert.equal((await request(lessonPath, { cookie: instructor, form: changeForm })).status, 303);
    assert.equal((await request(lessonPath, { cookie: instructor, form: changeForm })).status, 409);
    const conflictId = store.scheduleProposals()[0].id;
    const conflict = await request(proposalPath + conflictId, { cookie: employee });
    assert.match(conflict.body, /у группы уже есть занятие/);
    const review = { csrf: csrf(conflict.body), action: 'publish' };
    assert.equal((await request(proposalPath + conflictId, { cookie: employee, form: review })).status, 409);
    assert.equal((await request(proposalPath + conflictId, { cookie: employee,
      form: { ...review, action: 'decline', note: 'Нужен свободный слот' } })).status, 303);
    assert.match((await request(lessonPath, { cookie: instructor })).body, /Нужен свободный слот/);
    assert.equal((await request(lessonPath, { cookie: instructor, form: { ...changeForm, slot: '8' } })).status, 303);
    const path = proposalPath + store.scheduleProposals()[0].id;
    const officeHome = await request('/staff/office', { cookie: employee });
    assert.ok(officeHome.body.includes('href="' + path + '"'));
    assert.match(officeHome.body, /Дольше всего ждут ответа/);
    assert.doesNotMatch(officeHome.body, /Встречи сегодня|href="\/staff\/consultations"/);
    const officeQueue = await request('/staff/requests', { cookie: employee });
    assert.match(officeQueue.body, /Выписка об успеваемости/);
    assert.match(officeQueue.body, /Исправление данных профиля/);
    assert.match(officeHome.body, /office-queue[\s\S]*Расписание групп/);
    const scheduleOffice = (await request('/staff/schedule', { cookie: employee })).body;
    assert.doesNotMatch(scheduleOffice.split('</nav>')[0], /href="\/staff\/schedule\/proposals"/);
    assert.match(scheduleOffice, /Переносы занятий/);
    const filtered = (await request('/staff/requests?status=all&q=1065', { cookie: employee })).body;
    assert.match(filtered, /Выписка об успеваемости/);
    assert.doesNotMatch(filtered, /Исправление данных профиля/);
    const service = '/services/new/other';
    const servicePage = await request(service, { cookie: student });
    const sent = await request(service, { cookie: student, form: { csrf: csrf(servicePage.body),
      submission: submission(servicePage.body), message: 'Как записаться на пересдачу по статистике?' } });
    assert.equal(sent.status, 303);
    const ticket = sent.headers.Location.replace('/services/requests/', '/staff/requests/');
    assert.match((await request(ticket, { cookie: employee })).body, /Как записаться на пересдачу по статистике/);
    assert.doesNotMatch((await request('/notifications', { cookie: student })).body, /Аудитория на ремонте/);
    assert.equal((await request(path, { cookie: employee, form: review })).status, 303);
    assert.equal((await request(path, { cookie: employee, form: review })).status, 303);
    assert.match((await request('/notifications', { cookie: student })).body, /Аудитория на ремонте/);
    assert.match((await request('/schedule/week?date=' + day, { cookie: student })).body, /В-421/);
    assert.doesNotMatch((await request('/notifications', { cookie: other })).body, /Аудитория на ремонте/);
    assert.match((await request(lessonPath, { cookie: instructor })).body, /Перенос опубликован/);
    assert.equal(store.scheduleNotices(office.student.id).length, 1);
  } finally {
    store.close();
  }
});

test('consultation booking links only owned requests and preserves a single private reservation', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, , , dispatcher, office] = store.configureAccounts();
    const request = client(store);
    const [student, other, delegated, employee] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, dispatcher, '/staff/office'),
      signIn(request, office, '/staff/office')
    ]);
    const officePath = '/staff/consultations';
    const listPath = '/services/consultations';
    const day = addDays(today(), 1);
    assert.equal((await request(officePath, { cookie: delegated })).status, 404);
    const open = { csrf: csrf((await request(officePath, { cookie: employee })).body), action: 'create', day, time: '14:30', place: 'Кабинет 302' };
    assert.equal((await request(officePath, { cookie: employee, form: { ...open, time: '14:15' } })).status, 422);
    assert.equal((await request(officePath, { cookie: employee, form: open })).status, 303);
    assert.equal((await request(officePath, { cookie: employee, form: open })).status, 409);
    const { id } = store.consultationsForOffice(office.student.id, day)[0];
    const path = listPath + '/' + id;
    const source = await request('/services/requests/demo-1041', { cookie: student });
    assert.ok(source.body.includes('href="' + listPath + '?request=demo-1041"'));
    const list = await request(listPath + '?request=demo-1041', { cookie: student });
    assert.ok(list.body.includes('href="' + path + '?request=demo-1041"'));
    const slotForm = await request(path + '?request=demo-1041', { cookie: student });
    assert.match(slotForm.body, /value="demo-1041" selected/);
    const book = { csrf: csrf(slotForm.body), action: 'book', topic: 'Обсудить статус справки', request: 'demo-1041' };
    const otherToken = csrf((await request(path, { cookie: other })).body);
    assert.equal((await request(path, { cookie: student, form: { ...book, request: 'demo-2014' } })).status, 422);
    assert.equal((await request(path, { cookie: student, form: book })).status, 303);
    assert.equal((await request(path, { cookie: student, form: book })).status, 303);
    const taken = await request(path, { cookie: other, form: { ...book, csrf: otherToken, request: '' } });
    assert.equal(taken.status, 409);
    assert.doesNotMatch(taken.body, /Обсудить статус справки/);
    assert.equal((await request(path, { cookie: other })).status, 404);
    assert.match((await request(officePath, { cookie: employee })).body, /Обсудить статус справки[\s\S]*href="\/staff\/requests\/demo-1041"/);
    const withdraw = { csrf: open.csrf, action: 'withdraw', slot: id };
    assert.equal((await request(officePath, { cookie: employee, form: withdraw })).status, 409);
    assert.equal((await request(path, { cookie: student, form: { csrf: book.csrf, action: 'cancel' } })).status, 303);
    assert.equal((await request(path, { cookie: other })).status, 200);
    assert.equal((await request(officePath, { cookie: employee, form: withdraw })).status, 303);
    assert.equal((await request(officePath, { cookie: employee, form: open })).status, 303);
    assert.equal((await request(path, { cookie: other })).status, 404);
  } finally {
    store.close();
  }
});

test('homework answers accept text or files and are private to their author and teacher', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, daria, teacher, , office] = store.configureAccounts();
    const request = client(store);
    const [student, other, classmate, instructor, employee] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, daria),
      signIn(request, teacher, '/staff/teaching'), signIn(request, office, '/staff/office')
    ]);
    const path = '/homework/statistics/intervals';
    const course = '/courses/statistics?tab=assignments&item=intervals';
    const source = (await request(course, { cookie: student })).body;
    assert.match(source, /action="\/homework\/statistics\/intervals"[^>]*multipart\/form-data/);
    assert.match(source, /name="attachment" type="file"[^>]* multiple/);
    const token = csrf(source);
    const form = { csrf: token, submission: submission(source), answer: 'Мой расчёт интервала' };
    assert.equal((await request(path, { cookie: student, form: { ...form, answer: '' } })).status, 422);
    assert.equal((await request(path, { cookie: student, form })).headers.Location, course);
    const after = (await request(course, { cookie: student })).body;
    assert.match(after, /Ваш ответ[\s\S]*Мой расчёт интервала/);
    assert.doesNotMatch(after.split('<aside class="course-side"')[1], /work-intervals|Доверительные интервалы/);
    const invalid = new FormData();
    invalid.set('csrf', token);
    invalid.set('submission', submission(after));
    invalid.set('attachment', new File(['not a PDF'], 'answer.pdf'));
    assert.equal((await request(path, { cookie: student, form: invalid })).status, 422);
    const upload = new FormData();
    upload.set('csrf', token);
    upload.set('submission', submission(after));
    upload.append('attachment', new File(['выборка'], 'sample.txt'));
    upload.append('attachment', new File(['value\n2'], 'calculation.csv'));
    const [save, retry] = await Promise.all([request(path, { cookie: student, form: upload }), request(path, { cookie: student, form: upload })]);
    assert.equal(save.status, 303);
    assert.equal(retry.status, 303);
    assert.equal(store.recentHomeworkAnswers(anna.student.group, 'statistics').length, 2);
    const answer = (await request(course, { cookie: student })).body;
    const links = [...answer.matchAll(/href="(\/homework-files\/[a-f0-9]{32})"/g)].map(([, url]) => url);
    assert.equal(links.length, 2);
    assert.match(answer, /sample\.txt[\s\S]*calculation\.csv/);
    assert.equal((await request(path, { cookie: other, form: { ...form, csrf: csrf((await request('/?new=1', { cookie: other })).body) } })).status, 404);
    assert.doesNotMatch((await request(course, { cookie: classmate })).body, /sample\.txt/);
    assert.equal((await request(links[0], { cookie: classmate })).status, 404);
    assert.equal((await request(links[0], { cookie: employee })).status, 404);
    const download = await request(links[0], { cookie: instructor });
    assert.equal(download.status, 200);
    assert.match(download.headers['Content-Disposition'], /attachment.*sample\.txt/);
    assert.equal(download.body.toString(), 'выборка');
    const notices = (await request('/staff/notifications', { cookie: instructor })).body;
    assert.match(notices, /Студент сдал домашнее задание/);
    const sheetPath = /href="(\/staff\/teaching\/grades\/statistics\/[0-9a-f]{24})"/.exec(notices)[1];
    const sheet = (await request(sheetPath, { cookie: instructor })).body;
    assert.match(sheet, /Миронова Анна Сергеевна[\s\S]*Ответ студента[\s\S]*sample\.txt/);
    const reviewPath = sheetPath + '/anna';
    assert.ok(sheet.includes('href="' + reviewPath + '">Посмотреть работу'));
    const queue = await request('/staff/teaching/review', { cookie: instructor });
    assert.ok(queue.body.includes('href="' + reviewPath + '"'));
    assert.equal((await request(reviewPath, { cookie: employee })).status, 404);
    const review = await request(reviewPath, { cookie: instructor });
    assert.match(review.body, /Работа студента[\s\S]*Посмотреть файл[\s\S]*Комментарий студенту/);
    const preview = await request(links[0] + '?view=1', { cookie: instructor });
    assert.match(preview.headers['Content-Disposition'], /^inline/);
    assert.equal(preview.body.toString(), 'выборка');
    assert.equal((await request(links[0] + '?view=1', { cookie: classmate })).status, 404);
    const reviewForm = { csrf: csrf(review.body), answerId: /name="answerId" value="(\d+)"/.exec(review.body)[1],
      score: '9', max: '10', feedback: 'Уточни округление в последней строке.' };
    assert.equal((await request(reviewPath, { cookie: instructor, form: reviewForm })).status, 303);
    assert.match((await request('/study/anna/grades/statistics', { cookie: student })).body, /9 \/ 10/);
    const checkedCourse = (await request(course, { cookie: student })).body;
    assert.match(checkedCourse, /Комментарий преподавателя[\s\S]*Уточни округление/);
    assert.doesNotMatch((await request('/staff/teaching/review', { cookie: instructor })).body, /Доверительные интервалы/);
    assert.equal((await request(path, { cookie: student, form: { csrf: token,
      submission: submission(checkedCourse), answer: 'Уточнил округление.' } })).status, 303);
    assert.equal((await request(reviewPath, { cookie: instructor, form: reviewForm })).status, 409);
    assert.ok((await request('/staff/teaching/review', { cookie: instructor })).body.includes(reviewPath));
  } finally {
    store.close();
  }
});

test('chat shortcuts use the same personal thread and all staff have private notification feeds', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, , , teacher, dispatcher, office] = store.configureAccounts();
    const request = client(store);
    const [student, instructor, delegated, employee] = await Promise.all([
      signIn(request, anna), signIn(request, teacher, '/staff/teaching'),
      signIn(request, dispatcher, '/staff/office'), signIn(request, office, '/staff/office')
    ]);
    const index = (await request('/chats', { cookie: student })).body;
    assert.match(index, /href="\/chats" aria-label="Чаты"[\s\S]*popovertarget="notice-popover"/);
    assert.match(index, /Чаты курсов[\s\S]*Личные чаты/);
    assert.equal([...index.matchAll(/href="\/chats\/private\/teacher"/g)].length, 1);
    const direct = '/chats/private/teacher';
    const learnerForm = (await request(direct, { cookie: student })).body;
    assert.equal((await request(direct, { cookie: student, form: {
      csrf: csrf(learnerForm), submission: submission(learnerForm), message: 'Уточню тему контрольной'
    } })).status, 303);
    assert.match((await request('/courses/micro?tab=chat&item=private', { cookie: student })).body, /Уточню тему контрольной/);
    assert.match((await request('/staff/notifications', { cookie: instructor })).body, /Новое личное сообщение/);
    for (const cookie of [instructor, delegated, employee]) {
      const reply = await request('/staff/notifications', { cookie });
      assert.equal(reply.status, 200);
      assert.match(reply.body, /href="\/staff\/chats" aria-label="Чаты"[\s\S]*popovertarget="notice-popover"/);
    }
    const toOffice = '/staff/chats/office';
    const coworker = (await request(toOffice, { cookie: delegated })).body;
    assert.equal((await request(toOffice, { cookie: delegated, form: {
      csrf: csrf(coworker), submission: submission(coworker), message: 'Согласуем расписание группы'
    } })).status, 303);
    const officeFeed = (await request('/staff/notifications', { cookie: employee })).body;
    assert.match(officeFeed, /Новое личное сообщение/);
    assert.match((await request('/staff/chats/dispatcher', { cookie: employee })).body, /Согласуем расписание группы/);
    assert.doesNotMatch((await request('/staff/chats/dispatcher', { cookie: instructor })).body, /Согласуем расписание группы/);
    const notice = /name="notice" value="([^"]+)"/.exec(officeFeed)[1];
    assert.equal((await request('/staff/notifications', { cookie: employee, form: { csrf: csrf(officeFeed), notice } })).status, 303);
    assert.doesNotMatch((await request('/staff/notifications', { cookie: employee })).body, /новых \d|Отметить все прочитанными/);
  } finally {
    store.close();
  }
});


test('students edit their profile and discuss a published grade separately from chat', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, , daria, teacher, , office] = store.configureAccounts();
    const request = client(store);
    const [student, peer, instructor, employee] = await Promise.all([
      signIn(request, anna), signIn(request, daria), signIn(request, teacher, '/staff/teaching'), signIn(request, office, '/staff/office')
    ]);
    const profile = '/profile/anna';
    const profilePage = (await request(profile, { cookie: student })).body;
    assert.equal((await request(profile, { cookie: student,
      form: { csrf: csrf(profilePage), action: 'display', name: 'Анна М.' } })).status, 303);
    const changed = (await request(profile, { cookie: student })).body;
    assert.match(changed, /Анна М\.[\s\S]*Миронова Анна Сергеевна/);
    assert.doesNotMatch((await request('/profile/daria', { cookie: peer })).body, /Анна М\./);
    const correction = await request(profile, { cookie: student, form: {
      csrf: csrf(changed), submission: submission(changed), action: 'correction', field: 'Факультет', message: 'Прошу уточнить факультет.'
    } });
    assert.equal(correction.status, 303);
    assert.match((await request(correction.headers.Location.replace('/services', '/staff'), { cookie: employee })).body, /Прошу уточнить факультет/);

    const grades = '/study/anna/grades/statistics';
    const gradePage = (await request(grades, { cookie: student })).body;
    const [action] = [...gradePage.matchAll(/action="(\/study\/anna\/grades\/statistics\/comments\/[a-f0-9]{24})"/g)].map(([, path]) => path);
    assert.ok(action);
    const comment = { csrf: csrf(gradePage), submission: submission(gradePage), comment: 'За что сняли два балла?' };
    assert.equal((await request(action, { cookie: peer, form: { ...comment, csrf: csrf((await request('/profile/daria', { cookie: peer })).body) } })).status, 404);
    const posted = await request(action, { cookie: student, form: comment });
    assert.equal(posted.status, 303);
    assert.equal((await request(action, { cookie: student, form: comment })).status, 303);
    assert.match((await request(posted.headers.Location.split('#')[0], { cookie: student })).body, /Обсуждение оценки \(1\)[\s\S]*За что сняли два балла/);
    const notices = (await request('/staff/notifications', { cookie: instructor })).body;
    const teacherPage = /href="(\/staff\/teaching\/grades\/statistics\/[a-f0-9]{24}\?discussion=anna)#[^"]+"/.exec(notices)[1];
    const discussion = (await request(teacherPage, { cookie: instructor })).body;
    assert.match(discussion, /За что сняли два балла/);
    const reply = /action="(\/staff\/teaching\/grades\/statistics\/[a-f0-9]{24}\/comments\/anna)"/.exec(discussion)[1];
    const saved = await request(reply, { cookie: instructor, form: {
      csrf: csrf(discussion), submission: submission(discussion), comment: 'В последней задаче пропущен вывод.'
    } });
    assert.equal(saved.status, 303);
    assert.match((await request(grades, { cookie: student })).body, /В последней задаче пропущен вывод/);
    assert.match((await request('/notifications', { cookie: student })).body, /Ответ преподавателя об оценке/);
    assert.doesNotMatch((await request('/chats/private/teacher', { cookie: student })).body, /За что сняли два балла|пропущен вывод/);
  } finally {
    store.close();
  }
});


test('new request categories reach the office with their type and certificate details', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, , , , office] = store.configureAccounts();
    const request = client(store);
    const [student, peer, employee] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, office, '/staff/office')
    ]);
    const examples = [
      ['certificates', 'certificate-period', 'академическая справка'],
      ['applications', 'academic-leave', 'Заявление на академический отпуск'],
      ['military', 'military-deferment', 'Вопрос об отсрочке'],
      ['migration', 'migration-registration', 'Постановка на миграционный учёт'],
      ['payments', 'tuition-tax', 'Документы для налогового вычета'],
      ['documents', 'other-document', 'Запрос другого документа']
    ];
    for (const [category, type, label] of examples) {
      const path = '/services/categories/' + category;
      const page = await request(path, { cookie: student });
      assert.equal(page.status, 200);
      const form = { csrf: csrf(page.body), submission: submission(page.body), type, message: 'Детали учебного обращения.' };
      if (category === 'certificates') {
        assert.match(page.body, /Справка о подтверждении факта обучения[\s\S]*Справка о выплате стипендии[\s\S]*Справка-вызов/);
        Object.assign(form, { year: '2', faculty: anna.student.faculty, program: anna.student.program, format: 'both' });
        const invalid = await request(path, { cookie: student, form: { ...form, faculty: maksim.student.faculty } });
        assert.equal(invalid.status, 422);
        assert.match(invalid.body, /направление этого факультета/);
      }
      assert.equal((await request(path, { cookie: student, form: { ...form, type: 'unknown' } })).status, 422);
      const created = await request(path, { cookie: student, form });
      assert.equal(created.status, 303);
      assert.equal((await request(path, { cookie: student, form })).headers.Location, created.headers.Location);
      assert.equal((await request(created.headers.Location, { cookie: peer })).status, 404);
      const officePath = created.headers.Location.replace('/services/', '/staff/');
      const staffPage = await request(officePath, { cookie: employee });
      assert.ok(staffPage.body.includes(label));
      assert.match(staffPage.body, /Детали учебного обращения/);
      const queue = await request('/staff/requests?category=' + category + '&type=' + type, { cookie: employee });
      assert.ok(queue.body.includes('href="' + officePath + '"'));
      if (category === 'certificates') {
        assert.match(staffPage.body, /Курс<\/dt><dd>2[\s\S]*Факультет[\s\S]*Управление и аналитика[\s\S]*Бизнес-аналитика[\s\S]*Бумажная и скан/);
        const token = csrf(staffPage.body);
        assert.equal((await request(officePath, { cookie: employee, form: { csrf: token, expected: 'submitted' } })).status, 303);
        assert.equal((await request(officePath, { cookie: employee, form: { csrf: token, expected: 'processing', reply: 'Бумажная справка готова.' } })).status, 303);
        const result = await request(created.headers.Location, { cookie: student });
        assert.match(result.body, /Бумажная и скан[\s\S]*кабинет 108[\s\S]*Скачать образец справки/);
        const sample = await request(created.headers.Location + '/download', { cookie: student });
        assert.match(sample.body, /академическая справка/);
      }
    }
  } finally {
    store.close();
  }
});


test('office sees the submitted form and exchanges dated comments with the student', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, , , , office] = store.configureAccounts();
    const request = client(store);
    const [student, peer, employee] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, office, '/staff/office')
    ]);
    const category = '/services/categories/migration';
    const form = (await request(category, { cookie: student })).body;
    const submitted = await request(category, { cookie: student, form: {
      csrf: csrf(form), submission: submission(form), type: 'migration-extension', message: 'Продление нужно к 15 декабря.'
    } });
    const studentPath = submitted.headers.Location;
    const officePath = studentPath.replace('/services/', '/staff/');
    const card = (await request(officePath, { cookie: employee })).body;
    assert.match(card, /Заполненная форма[\s\S]*Что нужно сделать\?[\s\S]*Продление миграционного учёта[\s\S]*Детали обращения[\s\S]*Продление нужно к 15 декабря/);
    assert.doesNotMatch(card, /Ответ студенту/);
    const update = { csrf: csrf(card), submission: submission(card), expected: 'submitted', status: 'waiting' };
    assert.equal((await request(officePath, { cookie: employee, form: update })).status, 422);
    assert.equal((await request(officePath, { cookie: employee, form: { ...update, comment: 'Уточните дату окончания учёта.' } })).status, 303);
    const waiting = (await request(studentPath, { cookie: student })).body;
    assert.match(waiting, /Ждём ответа студента[\s\S]*Комментарии/);
    assert.ok(waiting.includes(office.student.fullName));
    assert.match(waiting, /<time datetime="\d{4}-\d{2}-\d{2}T[^"]+">[^<]+ МСК<\/time>[\s\S]*Уточните дату/);
    assert.match((await request('/notifications', { cookie: student })).body, /Учебный офис запросил уточнение/);
    const reply = { csrf: csrf(waiting), submission: submission(waiting), expected: 'waiting', comment: 'Текущий учёт действует до 15 декабря.' };
    assert.equal((await request(studentPath, { cookie: peer, form: { ...reply, csrf: csrf((await request(category, { cookie: peer })).body) } })).status, 404);
    assert.equal((await request(studentPath, { cookie: student, form: reply })).status, 303);
    const updated = (await request(officePath, { cookie: employee })).body;
    assert.match(updated, /<strong>В работе<\/strong>/);
    assert.match(updated, /Уточните дату[\s\S]*Миронова Анна Сергеевна[\s\S]*Текущий учёт действует/);
    assert.equal((await request(officePath, { cookie: employee, form: {
      csrf: csrf(updated), submission: submission(updated), expected: 'processing', status: 'rejected', comment: 'Заявка подана повторно.'
    } })).status, 303);
    const closed = (await request(studentPath, { cookie: student })).body;
    assert.match(closed, /Отклонено[\s\S]*Заявка подана повторно/);
    assert.doesNotMatch(closed, /Отправить комментарий/);
    assert.ok((await request('/staff/requests?status=rejected', { cookie: employee })).body.includes(officePath));
    assert.ok(!(await request('/staff/requests?status=open', { cookie: employee })).body.includes(officePath));
  } finally {
    store.close();
  }
});

test('request status migration keeps consultation links and legacy replies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dean-request-migration-'));
  const path = join(dir, 'dean.sqlite');
  try {
    const old = new DatabaseSync(path);
    try {
      old.exec(`
        CREATE TABLE accounts(id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, salt BLOB NOT NULL, password_hash BLOB NOT NULL);
        INSERT INTO accounts VALUES ('anna', 'anna', x'00', x'00'), ('office', 'office', x'00', x'00');
        CREATE TABLE requests (
          id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES accounts(id),
          status TEXT NOT NULL CHECK (status IN ('submitted', 'processing', 'ready')),
          delivery TEXT NOT NULL CHECK (delivery IN ('pickup', 'download')),
          created_on TEXT NOT NULL, submission_key TEXT, staff_reply TEXT NOT NULL DEFAULT '',
          staff_date TEXT, UNIQUE (student_id, submission_key)
        );
        INSERT INTO requests VALUES ('old-request', 'anna', 'ready', 'pickup', '2026-11-20', NULL, 'Старый ответ.', '2026-11-21');
        CREATE TABLE consultation_slots (
          id INTEGER PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES accounts(id),
          day TEXT NOT NULL, time TEXT NOT NULL, meeting_place TEXT NOT NULL,
          student_id TEXT REFERENCES accounts(id), topic TEXT, request_id TEXT REFERENCES requests(id),
          UNIQUE (employee_id, day, time)
        );
        INSERT INTO consultation_slots VALUES (1, 'office', '2026-12-01', '12:00', '108', 'anna', 'Справка', 'old-request');
      `);
    } finally {
      old.close();
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const store = openStore(path);
      try {
        assert.equal(store.request('anna', 'old-request').status, 'ready');
        assert.deepEqual(store.requestComments('old-request').map(({ body, posted_at }) => [body, posted_at]),
          [['Старый ответ.', '2026-11-21']]);
        assert.equal(store.consultationsForOffice('office', '2026-11-22')[0].request_id, 'old-request');
      } finally {
        store.close();
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('office events support private LMS calendar entries, registration and ICS export', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, maksim, , teacher, , office] = store.configureAccounts();
    const request = client(store);
    const [student, peer, employee, instructor] = await Promise.all([
      signIn(request, anna), signIn(request, maksim), signIn(request, office, '/staff/office'),
      signIn(request, teacher, '/staff/teaching')
    ]);
    const creation = '/staff/events/new';
    assert.equal((await request(creation, { cookie: instructor })).status, 404);
    assert.equal((await request(creation, { cookie: student })).status, 403);
    const page = (await request(creation, { cookie: employee })).body;
    const day = addDays(today(), 15);
    const form = { csrf: csrf(page), submission: submission(page), title: 'Встреча, разбор кейса',
      place: 'Корпус А; 108', description: 'Первая строка\n' + 'Аналитика '.repeat(18), day, start: '18:00', end: '19:30' };
    assert.equal((await request(creation, { cookie: employee, form: { ...form, end: '17:00' } })).status, 422);
    const created = await request(creation, { cookie: employee, form });
    assert.equal(created.status, 303);
    assert.equal((await request(creation, { cookie: employee, form })).headers.Location, created.headers.Location);
    const staffPath = created.headers.Location;
    const path = staffPath.replace('/staff', '');
    assert.match((await request('/events', { cookie: student })).body, /Встреча, разбор кейса/);
    const studentPage = (await request(path, { cookie: student })).body;
    const change = (action) => request(path, { cookie: student, form: { csrf: csrf(studentPage), action } });
    assert.equal((await change('save')).status, 303);
    assert.doesNotMatch((await request(path, { cookie: student })).body, /Вы записаны на событие/);
    assert.equal((await change('register')).status, 303);
    assert.equal((await change('register')).status, 303);
    assert.match((await request(path, { cookie: student })).body, /Вы записаны на событие/);
    const week = (date, cookie = student) => request('/schedule/week?date=' + date, { cookie });
    assert.match((await week(day)).body, /События[\s\S]*Встреча, разбор кейса/);
    assert.doesNotMatch((await week(day, peer)).body, /Встреча, разбор кейса/);
    const eventIcs = await request(path + '/calendar.ics', { cookie: student });
    assert.match(eventIcs.headers['Content-Type'], /^text\/calendar/);
    assert.match(eventIcs.headers['Content-Disposition'], /\.ics"/);
    assert.ok(eventIcs.body.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
    const unfolded = eventIcs.body.replaceAll('\r\n ', '');
    assert.ok(unfolded.includes('DTSTART:' + day.replaceAll('-', '') + 'T150000Z'));
    assert.ok(unfolded.includes('SUMMARY:Встреча\\, разбор кейса'));
    assert.ok(unfolded.includes('LOCATION:Корпус А\\; 108'));
    const current = (await request(staffPath, { cookie: employee })).body;
    assert.match(current, /Зарегистрировались: 1/);
    const revision = /name="revision" value="(\d+)"/.exec(current)[1];
    const nextDay = addDays(day, 8);
    const edit = { ...form, csrf: csrf(current), submission: submission(current), revision, day: nextDay, title: 'Встреча перенесена' };
    assert.equal((await request(staffPath, { cookie: employee, form: edit })).status, 303);
    assert.equal((await request(staffPath, { cookie: employee, form: edit })).status, 409);
    assert.doesNotMatch((await week(day)).body, /Встреча, разбор кейса/);
    assert.match((await week(nextDay)).body, /Встреча перенесена/);
    assert.equal((await change('unregister')).status, 303);
    assert.match((await week(nextDay)).body, /Встреча перенесена/);
    assert.equal((await change('remove')).status, 303);
    assert.doesNotMatch((await week(nextDay)).body, /Встреча перенесена/);
  } finally {
    store.close();
  }
});


test('event cover and inline photos are distinct and Markdown works outside the event', async () => {
  const store = openStore(':memory:');
  try {
    const [anna, , , , , office] = store.configureAccounts();
    const request = client(store);
    const [student, employee] = await Promise.all([signIn(request, anna), signIn(request, office, '/staff/office')]);
    const newEvent = '/staff/events/new';
    const editor = (await request(newEvent, { cookie: employee })).body;
    assert.match(editor, /enctype="multipart\/form-data"/);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+UuXcAAAAASUVORK5CYII=', 'base64');
    const data = new FormData();
    const fields = { csrf: csrf(editor), submission: submission(editor), title: 'Мастер-класс Markdown',
      day: addDays(today(), 7), start: '18:00', end: '20:00', place: 'А-108',
      description: '## План\n- **Практика**\n\n![Тетрадь](photo:1)\n\n<img src=x onerror=alert(1)> [Перейти](javascript:alert)' };
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    data.set('cover', new File(['not an image'], 'cover.png', { type: 'image/png' }));
    assert.equal((await request(newEvent, { cookie: employee, form: data })).status, 422);
    data.set('cover', new File([png], 'cover.png', { type: 'image/png' }));
    data.append('photos', new File([png], 'photo.png', { type: 'image/png' }));
    const saved = await request(newEvent, { cookie: employee, form: data });
    assert.equal(saved.status, 303);
    assert.equal((await request(newEvent, { cookie: employee, form: data })).headers.Location, saved.headers.Location);
    const path = saved.headers.Location.replace('/staff', '');
    const listing = (await request('/events', { cookie: student })).body;
    assert.match(listing, /<nav class="topbar-shortcuts"[^>]*>\s*<a href="\/events"[\s\S]*?<a href="\/"/);
    assert.doesNotMatch(listing.split('id="student-sidebar"')[1].split('</aside>')[0], /href="\/events"/);
    const card = new RegExp('href="' + path + '">([\\s\\S]+?)</a>').exec(listing)[1];
    assert.match(card, /class="event-cover"[\s\S]*<h2>Мастер-класс Markdown<\/h2>[\s\S]*18:00–20:00/);
    const cover = /src="([^"]+)"/.exec(card)[1];
    const event = (await request(path, { cookie: student })).body;
    assert.match(event, /<h2>План<\/h2><ul><li><strong>Практика<\/strong>/);
    const photo = /src="(\/event-images\/[a-f0-9]+)" alt="Тетрадь"/.exec(event)[1];
    assert.notEqual(cover, photo);
    assert.doesNotMatch(event, /<img src=x|href="javascript:/);
    assert.match(event, /&lt;img src=x/);
    assert.deepEqual((await request(photo, { cookie: student })).body, png);
    assert.equal((await request(cover)).status, 302);
    assert.equal(store.eventForOffice(path.split('/').at(-1)).photos.length, 1);

    const chatPath = '/courses/statistics?tab=chat';
    const chat = (await request(chatPath, { cookie: student })).body;
    assert.equal((await request('/courses/statistics/chat', { cookie: student, form: {
      csrf: csrf(chat), submission: submission(chat), message: '**Важно**: [расписание](/schedule)'
    } })).status, 303);
    assert.match((await request(chatPath, { cookie: student })).body, /<strong>Важно<\/strong>: <a href="\/schedule">расписание<\/a>/);
    const homework = '/courses/statistics?tab=assignments&item=intervals';
    const work = (await request(homework, { cookie: student })).body;
    const upload = new FormData();
    upload.set('csrf', csrf(work));
    upload.set('submission', submission(work));
    upload.set('attachment', new File(['# Отчёт\n\n**Результат**'], 'report.md', { type: 'text/markdown' }));
    assert.equal((await request('/homework/statistics/intervals', { cookie: student, form: upload })).status, 303);
    const answer = (await request(homework, { cookie: student })).body;
    const attachment = /href="(\/homework-files\/[a-f0-9]+)"/.exec(answer)[1];
    assert.match((await request(attachment + '?view=1', { cookie: student })).body, /<h1>Отчёт<\/h1><p><strong>Результат<\/strong>/);
  } finally {
    store.close();
  }
});
