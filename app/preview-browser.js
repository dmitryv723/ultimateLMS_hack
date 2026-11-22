/* Browser actions for the standalone demo. Views come from the server's modules. */
const dom = window.document;
const student = students[0];
const storageKey = 'dean-courses-preview-reminders-v1';
const requestStorageKey = 'dean-courses-preview-requests-v1';
let reminders = initialReminders;
let localRequests = [];
const chatStorageKey = 'dean-courses-preview-chat-v1';
let demoChat = {};
const eventStorageKey = 'dean-courses-preview-events-v1';
let eventChoices = {};
try { eventChoices = JSON.parse(localStorage.getItem(eventStorageKey)) || {}; } catch {}
const previewEvents = () => demoEvents.map((event) => ({ ...event, ...eventChoices[event.id] }));
try { demoChat = JSON.parse(localStorage.getItem(chatStorageKey)) || {}; } catch {}
try {
  const savedRequests = JSON.parse(localStorage.getItem(requestStorageKey));
  if (Array.isArray(savedRequests)) localRequests = savedRequests;
} catch {}

try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(stored)) reminders = stored;
} catch {}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(reminders)); } catch {}
}

const getUrl = () => new URL(decodeURIComponent(location.hash.slice(1) || '%2F'), 'https://preview.invalid');
function go(path) {
  const hash = '#' + encodeURIComponent(path);
  if (location.hash === hash) return;
  location.hash = hash;
  history.replaceState({ ...history.state, deanInternalPreviewNavigation: true }, '');
}

function showMessage(message) {
  const notice = dom.querySelector('#preview-status');
  notice.textContent = message;
  notice.hidden = false;
  notice.focus();
}

function render(formError, formValues) {
  const { pathname, searchParams, hash } = getUrl();
  let section = 'home', title = 'Мои курсы', body;
  if (pathname === '/') {
    if (searchParams.get('courses') === 'archive') return go('/courses/archive');
    const selectedCourse = searchParams.get('course');
    const showForm = searchParams.has('new');
    if (!showForm && student.subjects.some(({id}) => id === selectedCourse)) {
      location.replace('#' + encodeURIComponent(courseHref(selectedCourse, searchParams.get('tab'), searchParams.get('item'))));
      return;
    }
    body = homePage(student, previewDay, reminders, '', {
      showAll: searchParams.has('all'), formError,
      formValues: formValues || (showForm ? { courseId: selectedCourse } : null)
    });
  } else if (pathname === '/homework') {
    const archived = searchParams.get('view') === 'archive';
    section = archived ? 'homework-archive' : 'homework';
    title = archived ? 'Архивные задания' : 'Активные задания';
    body = homeworkPage(student, previewDay, archived);
  } else if (pathname === '/courses/active' || pathname === '/courses/archive') {
    const archived = pathname.endsWith('/archive');
    section = archived ? 'courses-archive' : 'courses-active';
    title = archived ? 'Архивные курсы' : 'Активные курсы';
    body = courseCatalogPage(student, archived);
  } else if (pathname === '/chats') {
    section = 'chats'; title = 'Чаты';
    body = learnerChatIndex(student);
  } else if (pathname.startsWith('/courses/')) {
    const course = studentCourse(student, pathname.slice('/courses/'.length));
    section = 'course';
    title = course?.name ?? 'Курс недоступен';
    const tab = searchParams.get('tab');
    const chat = course && tab === 'chat' && !course.archived
      ? courseChat(demoChat[course.id] || [], courseHref(course.id) + '/chat', '', formError)
      : '';
    body = course
      ? coursePage(student, course, previewDay, tab, searchParams.get('item'), chat)
      : backLink('/', 'Мои курсы') + intro(title);
  } else if (pathname === '/events' || pathname.startsWith('/events/')) {
    section = 'events'; title = 'Афиша';
    const event = previewEvents().find(({ id }) => pathname === '/events/' + id);
    body = pathname === '/events' ? eventList(previewEvents())
      : event && learnerEvent(event, eventNow(previewDay), '', formError);
  } else if (pathname === '/schedule' || pathname === '/schedule/week') {
    section = 'schedule'; title = 'Расписание';
    const focus = searchParams.get('date') || '';
    const selected = validDate(focus) ? focus : previewDay;
    const start = weekStart(selected);
    body = schedulePage(student, previewDay, selected, reminders,
      previewEvents().filter((event) => event.saved && event.day >= start && event.day <= addDays(start, 6)));
  } else if (pathname.startsWith('/schedule/lesson/')) {
    section = 'schedule'; title = 'Занятие';
    const match = /-(\d{4}-\d{2}-\d{2})-([1-9])$/.exec(pathname);
    const lesson = match && validDate(match[1]) && lessonsFor(student, match[1])[Number(match[2]) - 1];
    body = lesson && lessonPage(lesson);
  } else if (pathname === '/syllabus') {
    section = 'syllabus'; title = 'Силлабус университета';
    body = universitySyllabus(student, searchParams);
  } else if (pathname.startsWith('/study')) {
    section = 'study';
    const gradePrefix = '/study/' + student.id + '/grades/';
    if (pathname.startsWith(gradePrefix)) {
      const course = student.subjects.find(({id}) => pathname === gradePrefix + id);
      title = course?.name ?? 'Дисциплина недоступна';
      body = course ? courseGradesPage(student, course, previewDay, searchParams.get('type')) : intro(title);
    } else {
      title = 'Оценки';
      body = studyPage(student, previewDay, pathname.endsWith('/session') ? 'session' : 'grades');
    }
  } else if (pathname === '/services' || pathname === '/services/requests') {
    section = 'services'; title = 'Справки и обращения';
    body = servicesPage(pathname.endsWith('/requests') ? [...localRequests, ...demoRequests] : undefined);
  } else if (pathname.startsWith('/services/categories/')) {
    section = 'services';
    const category = pathname.slice('/services/categories/'.length);
    const config = Object.hasOwn(requestCategories, category) && requestCategories[category];
    title = config?.title || 'Обращение';
    body = config && categoryForm(category, student, '', formValues, formError);
  } else if (pathname === '/services/certificate') {
    section = 'services'; title = requestType;
    body = certificateForm('', undefined, formError);
  } else if (pathname.startsWith('/services/new/')) {
    section = 'services';
    const service = pathname.slice('/services/new/'.length);
    title = legacyServiceLinks.includes(service) ? serviceScenarios[service].title : 'Обращение';
    body = legacyServiceLinks.includes(service) && serviceForm(service, '', undefined, formValues?.message, formError);
  } else if (pathname.startsWith('/services/requests/')) {
    section = 'services'; title = 'Обращение';
    const request = [...localRequests, ...demoRequests].find(({id}) => pathname === '/services/requests/' + id);
    body = request && requestPage(request);
  } else if (pathname.startsWith('/notifications')) {
    section = 'notifications'; title = 'Уведомления';
    const items = notificationItems(student, previewDay);
    const item = items.find(({id}) => id && pathname === '/notifications/' + id);
    body = item ? notificationPage(item) : notificationsPage(items);
  } else if (pathname.startsWith('/profile')) {
    section = 'profile'; title = 'Мой профиль';
    body = profilePage(student, '');
  }
  dom.title = title + ' · Деканат';
  dom.querySelector('#preview-root').innerHTML = page(student, section, title, body || intro('Страница недоступна'), previewDay).split('<body>')[1].split('</body>')[0];
  dom.dispatchEvent(new Event('dean:render'));
  dom.querySelector('#preview-status').hidden = true;
  if (hash) {
    const destination = dom.getElementById(hash.slice(1));
    destination?.focus({preventScroll:true});
    destination?.scrollIntoView({block:'nearest'});
  }
  else window.scrollTo(0, 0);
  if (section === 'course') dom.querySelector('#main')?.focus({preventScroll:true});
  if (searchParams.has('new')) dom.querySelector('#personal-form input[name=title]')?.focus({preventScroll:true});
}

dom.addEventListener('click', (event) => {
  if (event.defaultPrevented) return;
  const target = event.target.closest('a')?.getAttribute('href');
  if (!target) return;
  const download = /^\/events\/([a-z0-9-]+)\/calendar\.ics$/.exec(target);
  if (download) {
    event.preventDefault();
    const item = previewEvents().find(({ id }) => id === download[1]);
    if (!item) return;
    const url = URL.createObjectURL(new Blob([eventCalendarFile(item)], { type: 'text/calendar;charset=utf-8' }));
    const link = dom.createElement('a');
    link.href = url;
    link.download = 'event-' + item.id + '.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (target.startsWith('/')) {
    event.preventDefault();
    go(target);
  } else if (target.startsWith('#')) {
    event.preventDefault();
    const url = getUrl();
    go(url.pathname + url.search + target);
  }
});
dom.addEventListener('submit', (event) => {
  event.preventDefault();
  const route = event.target.getAttribute('action');
  if (route === '/syllabus') {
    go(route + '?' + new URLSearchParams({ q: new FormData(event.target).get('q') }));
    return;
  }
  const item = route?.startsWith('/events/') && previewEvents().find(({ id }) => route === '/events/' + id);
  if (item) {
    const action = event.submitter?.value;
    if (action === 'register' || action === 'unregister') {
      if (eventStarted(item, eventNow(previewDay))) return render('Регистрация уже закрыта.');
      item.registered = action === 'register';
    } else if (action === 'save' || action === 'remove') {
      item.saved = action === 'save';
    }
    eventChoices[item.id] = { registered: item.registered, saved: item.saved };
    try { localStorage.setItem(eventStorageKey, JSON.stringify(eventChoices)); } catch {}
    render();
    return;
  }
  const chatCourse = /^\/courses\/([a-z]+)\/chat$/.exec(route)?.[1];
  if (chatCourse && student.subjects.some(({ id }) => id === chatCourse)) {
    const { message, key, valid } = readCourseMessage(new FormData(event.target));
    if (!valid) return render('Введите сообщение длиной до 1000 символов.');
    const messages = demoChat[chatCourse] ??= [];
    if (!messages.some((item) => item.key === key)) {
      messages.push({ key, author_name: student.fullName, message, sent_at: new Date().toISOString().slice(0, 19) });
      try { localStorage.setItem(chatStorageKey, JSON.stringify(demoChat)); } catch {}
    }
    render();
    return;
  }
  const category = /^\/services\/categories\/([a-z]+)$/.exec(route)?.[1];
  if (category || route === '/services/certificate' || route.startsWith('/services/new/')) {
    const form = new FormData(event.target);
    let data;
    if (category) {
      if (!Object.hasOwn(requestCategories, category)) return;
      data = readCategoryRequest(category, form);
      if (data.error) return render(data.error, data.values);
    } else {
      const certificate = route === '/services/certificate';
      const type = certificate ? 'certificate' : route.slice('/services/new/'.length);
      if (!certificate && !legacyServiceLinks.includes(type)) return;
      const delivery = certificate ? form.get('delivery') : 'pickup';
      const legacy = certificate ? { key: form.get('submission'), message: '' } : readServiceRequest(form);
      if (legacy.error) return render(legacy.error, { message: legacy.message });
      data = { ...legacy, type, delivery };
    }
    if (!Object.hasOwn(deliveryNames, data.delivery) || !validSubmissionKey(data.key)) return render('Проверьте данные обращения.');
    const id = 'preview-' + data.key;
    if (!localRequests.some((request) => request.id === id)) {
      localRequests.unshift({ id, service: data.type, delivery: data.delivery, message: data.message,
        details: JSON.stringify(data.fields || {}), status: 'submitted', created_on: previewDay });
      try { localStorage.setItem(requestStorageKey, JSON.stringify(localRequests)); } catch {}
    }
    go('/services/requests/' + id);
    return;
  }
  if (route === '/reminders') {
    const { reminder, error } = readReminder(new FormData(event.target), student);
    if (error) return render(error, reminder);
    reminders.push({ id: newSubmissionKey(), title: reminder.title, course_id: reminder.courseId,
      due_on: reminder.day, due_at: reminder.time, link: reminder.link || null, done: 0 });
  } else if (route.startsWith('/reminders/')) {
    const [, , id, action] = route.split('/');
    const row = reminders.find((record) => record.id === id);
    if (!row) return;
    row.done = action === 'done' ? 1 : 0;
  } else {
    showMessage('Это демонстрационная копия. Отправка обращения и выход доступны в приложении с аккаунтом.');
    return;
  }
  save();
  if (location.hash === '#' + encodeURIComponent('/?all=1#activity-heading')) render();
  else go('/?all=1#activity-heading');
});
window.addEventListener('hashchange', () => render());
render();
