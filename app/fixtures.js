// All profiles, classes and academic records are fictional.
export const students = [
  {
    id: 'anna', login: 'anna', name: 'Анна Миронова', initials: 'АМ',
    fullName: 'Миронова Анна Сергеевна', faculty: 'Управление и аналитика',
    program: 'Бизнес-аналитика', year: 2, group: 'БА-24',
    birthDate: '2006-04-12',
    contacts: { personalEmail: 'anna.mironova@personal.example', academicEmail: 'anna.mironova@university.example', phone: '+7 (000) 000-00-01' },
    education: { start: '2025-09-01', end: '2029-06-30', form: 'Очная' },
    studentCard: { number: 'ДЕМО-2025-001', issuedOn: '2025-09-01', validUntil: '2029-06-30' },
    subjects: [
      { id: 'statistics', name: 'Прикладная статистика', teacher: 'М. В. Ланцова', type: 'Семинар', room: 'Б-312', tone: 'violet' },
      { id: 'micro', name: 'Микроэкономика', teacher: 'М. В. Ланцова', type: 'Лекция', room: 'А-208', tone: 'mint' },
      { id: 'english', name: 'Академический английский', teacher: 'Д. О. Берестова', type: 'Практика', room: 'В-405', tone: 'blue', channel: 'Учебная почта', submission: 'На занятии' },
      { id: 'product', name: 'Продуктовая аналитика', teacher: 'Н. Р. Котова', type: 'Семинар', room: 'Б-216', tone: 'violet', channel: 'Чат курса', submission: 'В чате курса' },
      { id: 'sql', name: 'SQL и базы данных', teacher: 'А. П. Лебедев', type: 'Практика', room: 'Б-221', tone: 'blue' },
      { id: 'probability', name: 'Теория вероятностей', teacher: 'Е. Н. Соколова', type: 'Лекция', room: 'А-306', tone: 'violet' },
      { id: 'ai', name: 'Введение в искусственный интеллект', teacher: 'К. Д. Савин', type: 'Семинар', room: 'В-214', tone: 'mint' },
      { id: 'matrices', name: 'Основы матричных вычислений', teacher: 'О. В. Орлова', type: 'Практика', room: 'Б-315', tone: 'blue' }
    ],
    archivedSubjects: [
      { id: 'calculus', name: 'Математический анализ', semester: 'Весенний семестр 2025/26', closedSemester: 2, archived: true },
      { id: 'programming', name: 'Основы программирования', semester: 'Весенний семестр 2025/26', closedSemester: 2, archived: true }
    ],
    archivedHomework: [
      { courseId: 'calculus', title: 'Исследование функции', offset: -140, time: '23:59', status: 'Оценено', result: '18 / 20' },
      { courseId: 'programming', title: 'Обработка данных из CSV', offset: -146, time: '23:59', status: 'Оценено', result: '20 / 20' },
      { courseId: 'sql', title: 'Запросы с JOIN', offset: -12, time: '23:59', status: 'Сдано' }
    ],
    grades: [
      ['Прикладная статистика', 'Контрольная работа № 2', '18 / 20', 'баллов'],
      ['Микроэкономика', 'Промежуточный зачёт', 'Зачтено', null],
      ['Продуктовая аналитика', 'Защита проекта', null, null],
      ['Академический английский', 'Письменная контрольная', '27 / 30', 'баллов'],
      ['Академический английский', 'Промежуточная аттестация', 'Зачтено', null],
      ['SQL и базы данных', 'Практикум по JOIN', '24 / 25', 'баллов'],
      ['SQL и базы данных', 'Проектирование базы данных', '25 / 35', 'баллов']
    ],
    finalGrades: { english: 'Зачтено', sql: '87 / 100' },
    exams: [
      ['Микроэкономика', 'Экзамен', 5, '10:00', 'А-208', null],
      ['Прикладная статистика', 'Экзамен', 8, '12:30', 'Б-312', null],
      ['Продуктовая аналитика', 'Зачёт', -2, '11:00', 'Б-216', null],
      ['Академический английский', 'Зачёт', -5, '10:30', 'В-405', 'Зачтено'],
      ['SQL и базы данных', 'Экзамен', -7, '11:00', 'Б-221', '38 / 40']
    ],
    requests: [
      { id: 'demo-1041', status: 'ready', delivery: 'pickup', age: 6 },
      { id: 'demo-1058', status: 'processing', delivery: 'pickup', age: 2 }
    ]
  },
  {
    id: 'maksim', login: 'maksim', name: 'Максим Ветров', initials: 'МВ',
    fullName: 'Ветров Максим Андреевич', faculty: 'Международные коммуникации',
    program: 'Международные отношения', year: 3, group: 'МО-23',
    birthDate: '2005-02-24',
    contacts: { personalEmail: 'maksim.vetrov@personal.example', academicEmail: 'maksim.vetrov@university.example', phone: '+7 (000) 000-00-02' },
    education: { start: '2024-09-02', end: '2028-06-30', form: 'Очная' },
    studentCard: { number: 'ДЕМО-2024-002', issuedOn: '2024-09-02', validUntil: '2028-06-30' },
    subjects: [
      { id: 'negotiations', name: 'Международные переговоры', teacher: 'Е. Л. Волкова', type: 'Практика', room: 'А-304', tone: 'violet' },
      { id: 'history', name: 'История дипломатии', teacher: 'В. С. Громов', type: 'Лекция', room: 'А-402', tone: 'mint' },
      { id: 'geography', name: 'Политическая география', teacher: 'Л. М. Северова', type: 'Семинар', room: 'Б-110', tone: 'blue', channel: 'Учебная почта', submission: 'На занятии' },
      { id: 'culture', name: 'Межкультурная коммуникация', teacher: 'О. Д. Луговая', type: 'Семинар', room: 'А-114', tone: 'violet', channel: 'Чат курса', submission: 'В чате курса' },
      { id: 'law', name: 'Международное право', teacher: 'А. В. Тихонов', type: 'Лекция', room: 'А-302', tone: 'blue' },
      { id: 'economics', name: 'Мировая экономика', teacher: 'А. С. Викторов', type: 'Семинар', room: 'Б-210', tone: 'violet' },
      { id: 'policy', name: 'Внешняя политика', teacher: 'Н. И. Петрова', type: 'Семинар', room: 'А-314', tone: 'mint' },
      { id: 'translation', name: 'Практика перевода', teacher: 'Д. Е. Селиванов', type: 'Практика', room: 'В-203', tone: 'blue' }
    ],
    archivedSubjects: [
      { id: 'relations', name: 'Теория международных отношений', semester: 'Весенний семестр 2025/26', closedSemester: 4, archived: true }
    ],
    archivedHomework: [
      { courseId: 'relations', title: 'Сравнение теорий международных отношений', offset: -142, time: '23:59', status: 'Оценено', result: '19 / 20' }
    ],
    grades: [
      ['Международные переговоры', 'Учебные переговоры', '22 / 25', 'баллов'],
      ['История дипломатии', 'Промежуточный зачёт', 'Зачтено', null],
      ['Политическая география', 'Аналитическое эссе', null, null],
      ['Межкультурная коммуникация', 'Групповой проект', '16 / 20', 'баллов']
    ],
    finalGrades: { culture: 'Зачтено' },
    exams: [
      ['История дипломатии', 'Экзамен', 4, '09:30', 'А-402', null],
      ['Международные переговоры', 'Экзамен', 7, '11:00', 'А-304', null],
      ['Политическая география', 'Зачёт', -3, '14:00', 'Б-110', null],
      ['Межкультурная коммуникация', 'Зачёт', -6, '12:00', 'А-114', 'Зачтено']
    ],
    requests: [
      { id: 'demo-2014', status: 'ready', delivery: 'download', age: 7 },
      { id: 'demo-2032', status: 'submitted', delivery: 'pickup', age: 1 }
    ]
  }
];

students.push({
  ...students[0],
  id: 'daria', login: 'daria', name: 'Дарья Соколова', initials: 'ДС',
  fullName: 'Соколова Дарья Ильинична', archivedHomework: [], finalGrades: {}, exams: [],
  birthDate: '2006-08-09',
  contacts: { personalEmail: 'daria.sokolova@personal.example', academicEmail: 'daria.sokolova@university.example', phone: '+7 (000) 000-00-03' },
  studentCard: { number: 'ДЕМО-2025-003', issuedOn: '2025-09-01', validUntil: '2029-06-30' },
  grades: [['Прикладная статистика', 'Контрольная работа № 2', '16 / 20', 'баллов']],
  requests: []
});

const courseWork = {
  'БА-24': [
    { id: 'intervals', courseId: 'statistics', topic: 'intervals', kind: 'homework', title: 'Доверительные интервалы', dueWeekday: 1, time: '23:59', description: 'Для выборки 18, 21, 24, 20 и 22 оцените среднее и постройте 95%-й доверительный интервал.', instructions: 'Покажите расчёт стандартной ошибки, границы интервала и кратко объясните результат.' },
    { courseId: 'micro', topic: 'costs', kind: 'test', title: 'Контрольная № 2', offset: 1, time: '13:00', room: 'А-208', description: 'Темы контрольной: издержки фирмы и совершенная конкуренция.' },
    { courseId: 'product', kind: 'homework', title: 'Подготовить разбор воронки', dueWeekday: 1, time: '10:00', description: 'Данные и требования опубликованы в чате курса.', external: true },
    { courseId: 'statistics', topic: 'hypotheses', kind: 'test', title: 'Контрольная работа № 3', offset: 3, time: '11:20', room: 'Б-312', description: 'Темы: доверительные интервалы и проверка гипотез о среднем.', instructions: 'Работа длится 45 минут. Будут две расчётные задачи и один вопрос на интерпретацию результатов. Можно пользоваться калькулятором.' },
    { id: 'hypotheses', courseId: 'statistics', topic: 'hypotheses', kind: 'homework', title: 'Проверка гипотез о среднем', dueWeekday: 2, time: '23:59', description: 'По наблюдениям 49, 52, 51, 54 и 53 проверьте на уровне значимости 5%, отличается ли среднее от 50.', instructions: 'Запишите гипотезы, используйте двусторонний t-критерий и сформулируйте вывод.' },
    { id: 'demand-curve', courseId: 'micro', topic: 'demand', kind: 'homework', title: 'Построить кривую спроса', dueWeekday: 1, time: '20:00', description: 'Постройте график спроса Q = 40 − 2P и отметьте пересечения с осями.' },
    { id: 'sql-aggregate', courseId: 'sql', kind: 'homework', title: 'Запросы с группировкой', dueWeekday: 2, time: '21:00', description: 'Напишите запрос, который считает число заказов по каждому клиенту.' }
  ],
  'МО-23': [
    { courseId: 'negotiations', kind: 'homework', title: 'Подготовить позицию делегации', dueWeekday: 1, time: '23:59', description: 'Опишите цели делегации и предложите два варианта соглашения.' },
    { courseId: 'history', kind: 'test', title: 'Контрольная по истории дипломатии', offset: 1, time: '11:00', room: 'А-402', description: 'Подготовьте темы о дипломатических отношениях XIX века.' },
    { courseId: 'geography', kind: 'homework', title: 'Подготовить разбор региона', dueWeekday: 2, time: '10:00', description: 'Тема и требования опубликованы в учебной почте.', external: true },
    { courseId: 'history', kind: 'homework', title: 'Сравнить дипломатические кризисы', dueWeekday: 1, time: '20:00', description: 'Сравните причины и итоги двух кризисов XIX века.' },
    { courseId: 'culture', kind: 'homework', title: 'Разобрать пример межкультурного общения', dueWeekday: 1, time: '21:00', description: 'Опишите ситуацию и объясните причины недопонимания.' },
    { courseId: 'law', kind: 'homework', title: 'Разобрать положения договора', dueWeekday: 2, time: '22:00', description: 'Выберите договор и выпишите основные обязательства сторон.' }
  ]
};

export const studentWork = (student, date = student.workDate ?? today()) => [
  ...(courseWork[student.group] || []).map((work) => work.dueWeekday === undefined ? work
    : { ...work, offset: work.dueWeekday - weekday(date) }),
  ...(student.publishedWork || [])
];
export const workKey = ({ title, activityKey }) => activityKey ?? 'title:' + title;

const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' });
export const today = () => dateFormatter.format(new Date());
const utcDate = (value) => new Date(value + 'T00:00:00Z');
export function addDays(date, offset) {
  const day = utcDate(date);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

export function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(+utcDate(date)) && utcDate(date).toISOString().slice(0, 10) === date;
}

export function formatDate(date, options) {
  return new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(utcDate(date));
}
export const fullDate = (date) => formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = (date) => formatDate(date, { day: 'numeric', month: 'short' });
export const weekDay = (date) => formatDate(date, { weekday: 'long' });
const weekday = (date) => (utcDate(date).getUTCDay() + 6) % 7;
export const weekStart = (date) => addDays(date, -weekday(date));

const clockTime = (minutes) => [Math.floor(minutes / 60), minutes % 60].map((part) => String(part).padStart(2, '0')).join(':');
export const lessonSlots = Array.from({ length: 9 }, (_, index) => {
  const start = 8 * 60 + index * 100;
  return { start: clockTime(start), end: clockTime(start + 90) };
});

// Subject index and zero-based time slot, in the order used by lesson links.
const pattern = [
  [[2, 0], [3, 1], [1, 3], [4, 6]],
  [[3, 1], [0, 2], [5, 4]],
  [[1, 0], [2, 2], [3, 5], [6, 6]],
  [[0, 2], [1, 3], [7, 5], [4, 7]],
  [[1, 0], [0, 3], [2, 4], [6, 7]],
  [], []
];
export function lessonsFor(student, date) {
  return pattern[weekday(date)].map(([subjectIndex, initialSlot], index) => {
    const subject = student.subjects[subjectIndex];
    const moved = weekday(date) === 4 && index === 1;
    const previousRoom = student.id === 'anna' ? 'Б-204' : 'А-206';
    const change = student.lessonChanges?.find(({ day, lesson_number }) => day === date && lesson_number === index + 1);
    const slot = change?.slot ?? initialSlot;
    return {
      ...subject, date, slot, ...lessonSlots[slot], room: change?.room ?? subject.room, reason: change?.reason,
      path: '/schedule/lesson/' + [student.id, date, index + 1].join('-'),
      previous: change ? { ...lessonSlots[change.previous_slot], room: change.previous_room }
        : moved ? { ...lessonSlots[1], room: previousRoom } : null
    };
  });
}

export const requestType = 'Справка об обучении';
export const requestStatuses = {
  submitted: { label: 'Принято', tone: 'blue', detail: 'Обращение зарегистрировано. Студенческий офис возьмёт его в работу.' },
  processing: { label: 'В работе', tone: 'amber', detail: 'Студенческий офис проверяет данные и готовит справку.' },
  waiting: { label: 'Ждём ответа студента', tone: 'amber', detail: 'Учебный офис запросил уточнение. Ответьте в комментариях к заявке.' },
  ready: { label: 'Готово', tone: 'mint', detail: 'Справка подготовлена и доступна выбранным способом.' },
  rejected: { label: 'Отклонено', tone: 'neutral', detail: 'Учебный офис отклонил заявку. Причина указана в комментариях.' }
};
export const pickup = 'Студенческий офис, корпус А, кабинет 108';
export const deliveryNames = { pickup: 'Лично в студенческом офисе', download: 'Файл в кабинете' };
