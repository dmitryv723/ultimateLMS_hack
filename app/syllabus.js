import { students } from './fixtures.js';
import { escape, icon } from './layout.js';
import { teachingTopics } from './teaching-catalog.js';
import { programOverviews, syllabusDetails } from './syllabus-content.js';
import { teacherForCourse } from './people.js';

const universitySections = [
  ['Учёба и сессия', [
    ['exam-dates', 'Где посмотреть даты экзаменов?', 'Откройте «Сессию», чтобы посмотреть дату, время, аудиторию или ссылку для подключения.', 'Расписание сессии', '/study/{student}/session', 'сессия зачёт контрольная дедлайн'],
    ['missed-exam', 'Что делать, если я пропустил экзамен?', 'Уточните у учебного офиса порядок действий для вашей ситуации. Укажите дисциплину и дату экзамена.', 'Написать в учебный офис', '/services/new/other', 'неявка болезнь пересдача'],
    ['grades', 'Где посмотреть баллы и задать вопрос об оценке?', 'В разделе «Оценки и зачёты» выберите дисциплину. К опубликованной оценке за работу можно оставить комментарий преподавателю.', 'Мои оценки', '/study/{student}/grades', 'ведомость успеваемость'],
    ['schedule', 'Где узнать, перенесли ли пару?', 'Откройте занятие в расписании. Если его перенесли, в карточке видны прежние и актуальные данные.', 'Моё расписание', '/schedule', 'аудитория время отмена ошибка'],
  ]],
  ['Документы и заявления', [
    ['certificate', 'Как заказать справку об обучении?', 'Выберите тип справки, курс, факультет, направление и формат получения. Статус заявки виден в «Моих обращениях», а готовый электронный файл появится прямо в карточке обращения.', 'Заказать справку', '/services/categories/certificates', 'справка документ подтверждение обучения файл'],
    ['leave', 'Как подать заявление на академический отпуск?', 'Откройте «Заявления» и выберите академический отпуск. Учебный офис уточнит дальнейшие шаги в карточке обращения.', 'Открыть заявления', '/services/categories/applications', 'академ отпуск перерыв'],
    ['military', 'Куда обратиться по вопросам воинского учёта?', 'Выберите нужный тип обращения в разделе «Военкомат» и опишите вопрос.', 'Открыть раздел «Военкомат»', '/services/categories/military', 'отсрочка призыв'],
    ['migration', 'Куда обратиться по миграционному учёту?', 'Выберите тему в разделе «Миграционный учёт». Ответ учебного офиса будет доступен в карточке обращения.', 'Открыть миграционные обращения', '/services/categories/migration', 'регистрация иностранный студент'],
  ]],
  ['Оплата и поддержка', [
    ['tuition', 'Как получить счёт, проверить платёж или запросить документы для вычета?', 'В разделе «Оплата обучения» выберите тип запроса и отправьте его в учебный офис.', 'Открыть «Оплату обучения»', '/services/categories/payments', 'налог деньги квитанция'],
    ['support', 'Как запросить материальную поддержку?', 'Подайте заявление на материальную поддержку. Для подтверждения выплаты стипендии можно заказать отдельную справку.', 'Открыть заявления', '/services/categories/applications', 'помощь стипендия выплаты'],
  ]],
  ['Первые шаги и кампус', [
    ['profile', 'Где найти свою группу, учебную почту и студенческий билет?', 'Откройте профиль. Там собраны контактные данные, сведения об обучении и данные студенческого билета.', 'Открыть мой профиль', '/profile/{student}', 'группа доступ первокурсник'],
    ['campus', 'Где найти место проведения пары или мероприятия?', 'Аудитория пары указана в расписании. Место проведения мероприятия есть в его карточке в афише.', 'Открыть афишу', '/events', 'кампус корпус аудитория'],
  ]],
];

const allQuestions = universitySections.flatMap(([, questions]) => questions);
const programs = [...new Map(students.map((student) => [student.program, student])).values()];
const faculties = [...new Set(programs.map(({ faculty }) => faculty))];
const ownProgram = (student) => programs.find(({ program }) => program === student.program) ?? student;

function syllabusHref(params = {}) {
  const query = new URLSearchParams(params);
  return '/syllabus' + (query.size ? '?' + query : '');
}

const universityHref = (question) => syllabusHref(question ? { view: 'university', question } : { view: 'university' });
const facultyHref = ({ faculty }) => syllabusHref({ view: 'faculty', faculty });
const programHref = ({ program }) => syllabusHref({ view: 'program', program });
const subjectHref = (id) => syllabusHref({ view: 'subject', subject: id });

export function syllabusBackLink(fallback) {
  return `<a class="back-link syllabus-back" href="${escape(fallback)}" data-syllabus-back>${icon('back')}Назад</a>`;
}

const statisticsQuestions = [
  ['late-work', 'Что делать, если пропустил дедлайн или контрольную?', 'Откройте карточку работы и уточните у преподавателя возможность сдачи или отработки. Общий порядок для экзаменов описан в правилах университета.', 'Правила университета', universityHref('missed-exam'), 'опоздание пересдача срок пропуск'],
  ['grading', 'Из чего складывается итоговая оценка?', 'В демонстрационной схеме практические задания дают 30%, контрольные — 30%, итоговый экзамен — 40%. Опубликованные баллы можно посмотреть в ведомости.', 'Мои оценки', '/study/{student}/grades', 'веса формула баллы экзамен'],
];

const businessQuestions = [
  ['electives', 'Где узнать, какие элективы можно выбрать?', 'Уточните перечень и сроки выбора у координатора программы через учебный офис. Укажите курс и семестр, на который хотите выбрать дисциплину.', 'Написать в учебный офис', '/services/new/other', 'выбор профиль учебный план факультатив'],
  ['practice', 'С кем согласовать практику или зачёт стажировки?', 'Напишите координатору программы через учебный офис. Укажите организацию, сроки и задачи стажировки, чтобы уточнить, подходит ли она для зачёта.', 'Написать в учебный офис', '/services/new/other', 'стажировка практика координатор'],
  ['graduation', 'Где уточнить требования к выпуску?', 'Для вопросов по своей программе укажите в обращении курс, предполагаемый семестр выпуска и то, что хотите уточнить: итоговую аттестацию, выпускную работу или учебный план.', 'Написать в учебный офис', '/services/new/other', 'диплом вкр выпуск требования'],
];

function questionsList(questions, student, current) {
  return `<div class="syllabus-questions">${questions.map(([id, question, answer, action, href]) => `
    <details class="panel syllabus-question"${id === current ? ' open' : ''}>
      <summary>${escape(question)}${icon('chevron')}</summary>
      <p>${escape(answer)}</p>
      <a class="text-link" href="${escape(href.replace('{student}', student.id))}">${escape(action)} ${icon('chevron')}</a>
    </details>`).join('')}</div>`;
}

function syllabusCard(title, description, href, glyph) {
  return `<a class="panel syllabus-card" href="${escape(href)}">
    <span class="icon-tile violet">${icon(glyph)}</span>
    <span><strong>${escape(title)}</strong><small>${escape(description)}</small></span>${icon('chevron')}</a>`;
}

function catalog(programsToShow, student, includeArchive = false) {
  const groups = programsToShow.map((program) => {
    const profile = program.program === student.program ? student : program;
    const sections = [['Текущие дисциплины', profile.subjects]];
    if (includeArchive && profile.archivedSubjects?.length) sections.push(['Пройденные дисциплины', profile.archivedSubjects]);
    return sections.map(([title, courses]) => `<section><h2>${title}</h2>
      <div class="syllabus-grid">${courses.map(({ id, name, teacher, semester }) => syllabusCard(name, teacher ?? semester ?? 'Дисциплина', subjectHref(id), 'book')).join('')}</div></section>`).join('');
  });
  return groups.join('');
}

const normalize = (value) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е');

function searchResults(term, student) {
  const words = normalize(term).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const matches = (value) => words.length && words.every((word) => normalize(value).includes(word));
  const questionMatches = (q) => matches(`${q[1]} ${q[2]} ${q[3]} ${q[5]}`);
  const results = [
    ...allQuestions.filter(questionMatches)
      .map(([id, title]) => syllabusCard(title, 'Университет · ответ на вопрос', universityHref(id), 'file')),
    ...faculties.filter(matches).map((faculty) => syllabusCard(faculty, 'Факультет', facultyHref({ faculty }), 'study')),
    ...programs.filter(({ program, faculty }) => matches(`${program} ${faculty}`))
      .map((program) => syllabusCard(program.program, 'Программа · ' + program.faculty, programHref(program), 'study')),
    ...availableSubjects(student).filter(({ name, teacher }) => matches(`${name} ${teacher ?? ''}`))
      .map(({ id, name, teacher }) => syllabusCard(name, 'Дисциплина' + (teacher ? ' · ' + teacher : ''), subjectHref(id), 'book')),
    ...businessQuestions.filter(questionMatches)
      .map(([id, title]) => syllabusCard(title, 'Программа · Бизнес-аналитика', syllabusHref({ view: 'program', program: 'Бизнес-аналитика', question: id }), 'file')),
    ...statisticsQuestions.filter(questionMatches)
      .map(([id, title]) => syllabusCard(title, 'Дисциплина · Прикладная статистика', syllabusHref({ view: 'subject', subject: 'statistics', question: id }), 'file')),
  ];
  return results.length ? `<div class="syllabus-grid">${results.join('')}</div>`
    : `<div class="panel syllabus-empty"><p>По запросу «${escape(term)}» ничего не найдено. Попробуйте ввести название дисциплины или одно слово, например «справка».</p>
      <a class="text-link" href="/services">Справки и обращения ${icon('chevron')}</a></div>`;
}

function availableSubjects(student) {
  const sources = [...programs, student].flatMap(({ subjects, archivedSubjects = [] }) => [...subjects, ...archivedSubjects]);
  return [...new Map(sources.map((course) => [course.id, course])).values()];
}

export function subjectSyllabus(course, student, current) {
  const enrolled = [...student.subjects, ...(student.archivedSubjects ?? [])].some(({ id }) => id === course.id);
  const topics = teachingTopics[course.id] ?? [];
  const details = syllabusDetails[course.id];
  const teacher = teacherForCourse(student, course.id);
  const info = details ? `<section class="panel syllabus-info"><h2>Силлабус · демо</h2>
      <p>${escape(details.summary)}</p>
      <h3>Оценивание</h3>
      <dl class="syllabus-weights">${details.weights.map(([label, value]) =>
        `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
      <h3>${details.completed ? 'Итог дисциплины' : 'Сдача и допуск'}</h3>
      <p>${details.completed
        ? `Дисциплина завершена${course.semester ? ' (' + escape(course.semester) + ')' : ''}. Итоговая отметка — ${escape(details.final)}.`
        : escape(details.admission)}</p>
      <p class="muted">Веса и условия приведены для демонстрации структуры силлабуса.</p></section>`
    : '<section class="panel syllabus-info"><h2>О дисциплине</h2><p>Подробные условия оценивания и допуска ещё не опубликованы.</p></section>';
  return `<div class="syllabus-content">
    ${info}
    ${topics.length ? `<section class="panel syllabus-info"><h2>Темы дисциплины</h2><ol>${topics.map(([, title]) => `<li>${escape(title)}</li>`).join('')}</ol></section>` : ''}
    ${course.id === 'statistics' ? `<section><h2>Вопросы по дисциплине</h2>${questionsList(statisticsQuestions, student, current)}</section>` : ''}
    ${enrolled ? `<div class="syllabus-actions"><a class="button" href="/courses/${escape(course.id)}">К темам курса</a>
      ${teacher ? `<a class="button-secondary" href="/courses/${escape(course.id)}?tab=chat&amp;item=private">Написать преподавателю</a>` : ''}</div>` : ''}
  </div>`;
}

export function universitySyllabus(student, query = new URLSearchParams()) {
  const view = query.get('view');
  const term = (query.get('q') ?? '').trim().slice(0, 120);
  const current = query.get('question');
  const own = ownProgram(student);
  const program = programs.find(({ program }) => program === query.get('program'));
  const faculty = faculties.find((faculty) => faculty === query.get('faculty')) ?? own.faculty;
  const subject = availableSubjects(student).find(({ id }) => id === query.get('subject'));
  const subjectProgram = subject && programs.find(({ subjects, archivedSubjects = [] }) =>
    [...subjects, ...archivedSubjects].some(({ id }) => id === subject.id));
  let title = 'Силлабус университета';
  let description = 'Правила университета, учебные программы и требования по дисциплинам';
  let contents;

  if (term) {
    contents = `<section><h2>Результаты поиска</h2>${searchResults(term, student)}</section>`;
  } else if (view === 'university') {
    title = 'Правила университета';
    description = 'Учебные вопросы, документы и поддержка';
    const ordered = [...universitySections].sort(([, a], [, b]) =>
      Number(b.some(([id]) => id === current)) - Number(a.some(([id]) => id === current)));
    contents = ordered.map(([label, questions]) => `<section><h2>${label}</h2>${questionsList(questions, student, current)}</section>`).join('');
  } else if (view === 'faculty') {
    title = faculty;
    description = 'Факультет · учебные программы';
    contents = `<section><h2>Программы факультета</h2><div class="syllabus-grid">${programs.filter((program) => program.faculty === faculty)
      .map((program) => syllabusCard(program.program, 'Дисциплины и учебные вопросы', programHref(program), 'study')).join('')}</div></section>
      <section><h2>Другие факультеты</h2><div class="syllabus-grid">${faculties.filter((name) => name !== faculty)
        .map((name) => syllabusCard(name, 'Программы факультета', facultyHref({ faculty: name }), 'study')).join('')}</div></section>`;
  } else if (view === 'program' && program) {
    title = program.program;
    description = program.faculty + ' · учебная программа';
    const questions = program.program === 'Бизнес-аналитика' ? businessQuestions : [];
    contents = `<section class="panel syllabus-info"><h2>Учебный план</h2>
      <p>${escape(programOverviews[program.program] ?? 'Каталог текущих и пройденных дисциплин программы.')}</p>
      <p class="muted">Каталог дисциплин демонстрационный и показывает структуру силлабуса.</p>
      <a class="text-link" href="/services/new/other">Задать вопрос по программе ${icon('chevron')}</a></section>
      ${questions.length ? `<section><h2>Вопросы по программе</h2>${questionsList(questions, student, current)}</section>` : ''}${catalog([program], student, true)}`;
  } else if (view === 'courses') {
    title = 'Мои дисциплины';
    description = `${student.program} · ${student.group}`;
    contents = catalog([own], student, true);
  } else if (view === 'subject' && subject) {
    title = subject.name;
    description = [subject.teacher, subject.type ?? subject.semester].filter(Boolean).join(' · ');
    contents = subjectSyllabus(subject, student, current);
  } else {
    contents = `<nav class="syllabus-grid" aria-label="Разделы силлабуса">
      ${syllabusCard('Правила университета', 'Сессия, документы и поддержка', universityHref(), 'file')}
      ${syllabusCard('Мой факультет', student.faculty, facultyHref(own), 'study')}
      ${syllabusCard('Мои дисциплины', student.program, syllabusHref({ view: 'courses' }), 'book')}
    </nav><section><h2>Популярные вопросы</h2>${questionsList(['exam-dates', 'missed-exam', 'certificate', 'grades', 'schedule']
      .map((id) => allQuestions.find(([key]) => key === id)), student, current)}</section>
    <section><h2>Факультеты и программы</h2><div class="syllabus-grid">${programs.map((program) => syllabusCard(program.program, program.faculty, programHref(program), 'study')).join('')}</div></section>`;
  }

  let fallback = view || term ? '/syllabus' : '/';
  if (!term && view === 'program' && program) fallback = facultyHref(program);
  if (!term && view === 'subject') fallback = subjectProgram ? programHref(subjectProgram) : syllabusHref({ view: 'courses' });
  return `<div class="syllabus-screen">
    <nav class="syllabus-breadcrumbs" aria-label="Навигация по силлабусу">${syllabusBackLink(fallback)}${view || term ? `<a href="/syllabus">Силлабус университета</a>${program && !term ? `${icon('chevron')}<a href="${escape(facultyHref(program))}">${escape(program.faculty)}</a>` : ''}` : ''}</nav>
    <header class="panel syllabus-header"><h1>${escape(title)}</h1><p>${escape(description)}</p>
      <form class="syllabus-search" method="get" action="/syllabus" role="search">
        <label for="syllabus-search">Что хочешь узнать?</label><div>
        <input id="syllabus-search" name="q" type="search" maxlength="120" value="${escape(term)}" placeholder="Например, справка или статистика" required>
        <button class="button" type="submit">Найти</button></div>
      </form>
    </header>${contents}
  </div>`;
}
