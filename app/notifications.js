import { addDays, formatDate, lessonsFor, shortDate, weekStart } from './fixtures.js';
import { isCertificateService, serviceTitle } from './services.js';

export function transferNotice(student, date) {
  const start = weekStart(date);
  const recent = student.lessonChanges?.find(({ day }) => day >= start && day <= addDays(start, 6));
  const friday = recent?.day ?? addDays(start, 4);
  const lessons = lessonsFor(student, friday);
  const lesson = recent ? lessons[recent.lesson_number - 1] : lessons.find((item) => item.previous);
  return {
    title: 'Перенос занятия', text: lesson.name, path: lesson.path, date: friday,
    glyph: 'shift', tone: 'amber', label: 'Изменение',
    detail: `${shortDate(friday)}, ${lesson.start} · ауд. ${lesson.room}`,
    before: `${lesson.previous.start} · ауд. ${lesson.previous.room}`
  };
}

export function notificationItems(student, date) {
  const example = student.requests.find((request) => request.status === 'ready');
  const deadline = formatDate(addDays(date, 3), { day: 'numeric', month: 'long' });
  return [
    ...(student.accountNotices || []),
    ...(student.lessonChanges || []).map(({ day, lesson_number, published_on, reason }) => {
      const lesson = lessonsFor(student, day)[lesson_number - 1];
      return { title: 'Перенос занятия', text: lesson.name, date: published_on, path: lesson.path,
        glyph: 'shift', tone: 'amber', label: 'Изменение',
        detail: shortDate(day) + ', ' + lesson.start + ' · ауд. ' + lesson.room, body: reason };
    }),
    ...(student.onlineLessons || []).flatMap(({ day, lesson_number, link, published_on }) => {
      const lesson = lessonsFor(student, day)[lesson_number - 1];
      return lesson ? [{ title: 'Пара пройдёт онлайн', text: lesson.name, date: published_on, path: lesson.path,
        glyph: 'video', tone: 'blue', label: 'Онлайн',
        detail: shortDate(day) + ', ' + lesson.start + ' · ссылка в карточке занятия' }] : [];
    }),
    ...(student.requestUpdates || []).map(({ id, service, status, staff_date }) => ({
      title: status === 'waiting' ? 'Учебный офис запросил уточнение' : status === 'rejected' ? 'Обращение отклонено'
        : service === 'certificate' ? 'Справка об обучении готова' : isCertificateService(service)
          ? serviceTitle(service) + ' · готово' : 'На обращение ответили',
      date: staff_date, path: '/services/requests/' + id, glyph: 'file', tone: 'mint', label: 'Обращение',
      body: status === 'waiting' ? 'Ответьте на комментарий в карточке обращения.' : 'Подробности доступны в карточке обращения.'
    })),
    { ...transferNotice(student, date), date, body: 'Изменились время и аудитория. Проверьте актуальные данные перед занятием.' },
    example && { title: 'Справка об обучении готова', date: addDays(date, -1), glyph: 'file', tone: 'mint', label: 'Справка',
      body: 'Способ получения указан в карточке обращения.', path: '/services/requests/' + example.id },
    { id: 'project-deadline', title: 'Срок сдачи учебного проекта', date: addDays(date, -1), glyph: 'clock', tone: 'blue', label: 'Дедлайн',
      body: 'Загрузите итоговую версию проекта до ' + deadline + ', 23:59 МСК. Один участник отправляет материалы за всю команду.' },
    { id: 'office-hours', title: 'График студенческого офиса', date: addDays(date, -2), glyph: 'megaphone', tone: 'violet', label: 'Объявление',
      body: 'Студенческий офис работает по будням с 10:00 до 17:00 МСК. Обед с 13:00 до 14:00. Кабинет 108 в корпусе А.' },
    { id: 'library-week', title: 'Неделя открытых лекций', date: addDays(date, -3), glyph: 'news', tone: 'mint', label: 'Новость',
      body: 'Университетская библиотека проведёт открытые лекции о работе с академическими источниками. Вход свободный, начало в 16:00 МСК в читальном зале.' }
  ].filter(Boolean).filter((item, index, items) => item.key || !item.path || items.findIndex((candidate) => candidate?.path === item.path) === index)
    .sort((first, second) => second.date.localeCompare(first.date));
}

export const notificationHref = (item) => item.path || '/notifications/' + item.id;
