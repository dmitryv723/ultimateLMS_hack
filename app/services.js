import { markdownContent } from './markdown.js';
import { formatToolbar } from './format-toolbar.js';
import { randomBytes } from 'node:crypto';
import { deliveryNames, fullDate, pickup, requestStatuses, requestType, students } from './fixtures.js';
import { backLink, badge, escape, icon, iconTile, intro, linkButton, tabs } from './layout.js';

const serviceTabs = [['catalog', 'Каталог', '/services'], ['history', 'Мои обращения', '/services/requests']];
export const serviceScenarios = {
  grade: { title: 'Сверка опубликованной оценки', summary: 'Передайте в студенческий офис запрос на сверку балла в ведомости.', prompt: 'Укажите дисциплину и опубликованный результат, который нужно сверить.', icon: 'study' },
  schedule: { title: 'Вопрос о расписании', summary: 'Сообщите о расхождении по времени, аудитории или формату занятия.', prompt: 'Укажите занятие, дату и какие сведения расходятся.', icon: 'calendar' },
  profile: { title: 'Исправление данных профиля', summary: 'Сообщите об ошибке в группе, программе или других учебных данных.', prompt: 'Укажите поле и опишите, что следует исправить.', icon: 'person' },
  retake: { title: 'Вопрос о пересдаче', summary: 'Уточните сроки и порядок записи на пересдачу.', prompt: 'Укажите дисциплину и свой вопрос о пересдаче.', icon: 'calendar' },
  transcript: { title: 'Выписка об успеваемости', summary: 'Запросите выписку с результатами за учебный период.', prompt: 'Укажите нужный период и язык выписки.', icon: 'file' },
  other: { title: 'Другой вопрос', summary: 'Обратитесь в студенческий офис по другой учебной или административной теме.', prompt: 'Кратко опишите ситуацию и укажите, какая помощь нужна.', icon: 'chat' }
};
export const requestCategories = {
  certificates: {
    title: 'Справки', icon: 'file', summary: 'Об обучении, успеваемости, стипендии и другие справки.',
    question: 'Какая справка вам нужна?', prompt: 'При необходимости укажите период, цель или получателя.',
    types: {
      'certificate-study': 'Справка о подтверждении факта обучения',
      'certificate-performance': 'Справка об успеваемости',
      'certificate-period': 'Справка о периоде обучения (академическая справка)',
      'certificate-scholarship': 'Справка о выплате стипендии',
      'certificate-call': 'Справка-вызов',
      'certificate-other': 'Другая справка'
    }
  },
  applications: {
    title: 'Заявления', icon: 'file', summary: 'Академический отпуск, материальная поддержка и другие заявления.',
    question: 'Какое заявление вам нужно?', prompt: 'Кратко укажите причину обращения и желаемый период, если он важен.',
    types: { 'academic-leave': 'Заявление на академический отпуск', 'financial-aid': 'Заявление на оказание материальной поддержки', 'application-other': 'Другое заявление' }
  },
  military: {
    title: 'Военкомат', icon: 'person', summary: 'Справка для военкомата, отсрочка или вопрос о воинском учёте.',
    question: 'По какому вопросу вы обращаетесь?', prompt: 'Опишите вопрос и укажите дату, к которой нужен ответ.',
    types: { 'military-proof': 'Справка для военкомата', 'military-deferment': 'Вопрос об отсрочке от призыва', 'military-record': 'Уточнение сведений воинского учёта' }
  },
  migration: {
    title: 'Миграционный учёт', icon: 'globe', summary: 'Постановка на учёт, продление или изменение места пребывания.',
    question: 'Что нужно сделать?', prompt: 'Опишите ситуацию и укажите нужную дату. Паспортные данные в обращении не нужны.',
    types: { 'migration-registration': 'Постановка на миграционный учёт', 'migration-extension': 'Продление миграционного учёта', 'migration-address': 'Изменение адреса пребывания' }
  },
  payments: {
    title: 'Оплата обучения', icon: 'check', summary: 'Счёт, проверка платежа и документы для налогового вычета.',
    question: 'Что нужно по оплате обучения?', prompt: 'Укажите учебный период, а для проверки платежа — дату и сумму оплаты.',
    types: { 'tuition-invoice': 'Счёт на оплату обучения', 'tuition-check': 'Проверка платежа за обучение', 'tuition-tax': 'Документы для налогового вычета' }
  },
  documents: {
    title: 'Другой документ', icon: 'file', summary: 'Запрос документа, которого нет в каталоге.',
    prompt: 'Укажите название документа, для чего он нужен и к какой дате.',
    types: { 'other-document': 'Запрос другого документа' }
  }
};
export const legacyServiceLinks = ['schedule', 'transcript', 'other'];
const legacyCategories = { certificate: 'certificates', transcript: 'certificates' };
const serviceTypes = new Map(Object.entries(requestCategories).flatMap(([category, { types }]) =>
  Object.entries(types).map(([id, title]) => [id, { category, title }])));
export const serviceCategory = (type) => serviceTypes.get(type)?.category ?? legacyCategories[type || 'certificate'] ?? 'other';
export const serviceCategoryTitle = (type) => requestCategories[serviceCategory(type)]?.title ?? 'Прочие обращения';
export const isCertificateService = (type) => !type || type === 'certificate' || serviceTypes.get(type)?.category === 'certificates';
const certificateFormats = { paper: 'Бумажная', electronic: 'Электронная', both: 'Бумажная и скан' };
const studyPrograms = new Map(students.map(({ program, faculty }) => [program, faculty]));
const faculties = [...new Set(studyPrograms.values())];
const studyYears = ['1', '2', '3', '4', '5', '6'];
const categoryPath = (id) => '/services/categories/' + id;
const servicePath = (service) => '/services/new/' + service;
export const serviceTitle = (type) => serviceTypes.get(type)?.title ?? serviceScenarios[type]?.title ?? requestType;
const statusBadge = (status) => badge(requestStatuses[status].label, requestStatuses[status].tone);
const requestPath = (id) => '/services/requests/' + id;
export const requestNumber = (id) => 'ДК-' + id.replace(/^demo-/, '').toUpperCase();
export const newSubmissionKey = () => randomBytes(12).toString('hex');
export const validSubmissionKey = (key) => /^[a-f0-9]{24}$/.test(key || '');

function catalog() {
  return `<div class="service-catalog">${Object.entries(requestCategories).map(([id, category]) =>
    `<a class="panel service-card service-category" href="${categoryPath(id)}">
      ${iconTile(category.icon)}<div><h2>${escape(category.title)}</h2><p>${escape(category.summary)}</p></div>${icon('chevron')}
    </a>`).join('')}</div>`;
}

function history(requests) {
  if (!requests.length) return `<div class="empty panel">${iconTile('file')}<div><strong>Обращений пока нет</strong><p>Здесь появятся ваши заявки и их статусы.</p></div></div>`;
  return `<div class="record-list">${requests.map((request) => `<a class="panel record-row" href="${requestPath(request.id)}">
    ${iconTile('file')}<div class="record-name"><h2>${escape(serviceTitle(request.service))}</h2><p>${requestNumber(request.id)} · ${escape(fullDate(request.created_on))}</p></div>
    ${statusBadge(request.status)}${icon('chevron')}</a>`).join('')}</div>`;
}

export function servicesPage(requests, consultations = false) {
  const isHistory = Boolean(requests);
  return `${intro('Справки и обращения', 'Выберите категорию, чтобы оформить обращение в учебный офис.')}
    <div class="section-toolbar services-toolbar">${tabs('Справки и обращения', consultations
      ? [...serviceTabs, ['consultations', 'Консультации', '/services/consultations']] : serviceTabs, isHistory ? 'history' : 'catalog')}</div>
    ${isHistory ? history(requests) : catalog()}`;
}

export function readServiceRequest(form) {
  const key = form.get('submission');
  const message = (form.get('message') || '').trim();
  return { key, message, error: validSubmissionKey(key) && message.length >= 5 && message.length <= 1500 ? ''
    : 'Опишите вопрос. Текст должен содержать от 5 до 1500 символов.' };
}

export function serviceForm(service, csrf, key = newSubmissionKey(), message = '', error = '') {
  const scenario = serviceScenarios[service];
  return `<div class="detail">${backLink('/services', 'К справкам и обращениям')}
    ${intro(scenario.title, scenario.summary)}
    <form class="panel detail-panel request-form service-message" method="post" action="${servicePath(service)}">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      <input type="hidden" name="submission" value="${escape(key)}">
      <label for="service-message">Описание вопроса</label>
      <p id="service-hint">${escape(scenario.prompt)}</p>
      ${formatToolbar('service-message')}
      <textarea id="service-message" name="message" minlength="5" maxlength="1500" rows="5" aria-describedby="service-hint" required>${escape(message)}</textarea>
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      <button class="button" type="submit">Отправить обращение${icon('arrow')}</button>
    </form></div>`;
}

const option = (id, label, selected) =>
  `<option value="${escape(id)}"${id === selected ? ' selected' : ''}>${escape(label)}</option>`;
const field = (name, label, choices, selected) =>
  `<label>${label}<select name="${name}" required>
    ${option('', 'Выберите вариант', selected)}${choices.map(([id, title]) => option(id, title, selected)).join('')}
  </select></label>`;

export function categoryForm(category, student, csrf, values = {}, error = '') {
  const config = requestCategories[category];
  const key = validSubmissionKey(values.key) ? values.key : newSubmissionKey();
  const certificates = category === 'certificates';
  const types = Object.entries(config.types);
  const choices = (items) => items.map((value) => [value, value]);
  return `<div class="detail">${backLink('/services', 'К справкам и обращениям')}
    ${intro(config.title)}
    <form class="panel detail-panel staff-form service-category-form" method="post" action="${categoryPath(category)}">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      <input type="hidden" name="submission" value="${escape(key)}">
      ${config.question ? field('type', config.question, types, values.type) : `<input type="hidden" name="type" value="${types[0][0]}">`}
      ${certificates ? `<div class="certificate-study-fields">
        ${field('year', 'Курс', choices(studyYears), values.year ?? String(student.year))}
        ${field('faculty', 'Факультет', choices(faculties), values.faculty ?? student.faculty)}
        ${field('program', 'Направление', choices([...studyPrograms.keys()]), values.program ?? student.program)}
      </div>
      <fieldset><legend>Формат справки</legend><div class="certificate-formats">
        ${Object.entries(certificateFormats).map(([id, label]) => `<label>
          <input type="radio" name="format" value="${id}" required${values.format === id ? ' checked' : ''}>
          <span>${label}</span></label>`).join('')}
      </div></fieldset>` : ''}
      <label for="category-message">${certificates ? 'Комментарий к справке' : 'Детали обращения'}</label>
      <p class="muted" id="category-hint">${escape(config.prompt)}</p>
      ${formatToolbar('category-message')}
      <textarea id="category-message" name="message" rows="4" maxlength="1500" aria-describedby="category-hint"
        ${certificates ? '' : 'minlength="5" required'}>${escape(values.message || '')}</textarea>
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      <button class="button" type="submit">Подать заявку${icon('arrow')}</button>
    </form></div>`;
}

export function readCategoryRequest(category, form) {
  const value = (name) => (form.get(name) || '').trim();
  const key = value('submission');
  const type = value('type');
  const message = value('message');
  const fields = category === 'certificates'
    ? { year: value('year'), faculty: value('faculty'), program: value('program'), format: value('format') }
    : {};
  const values = { key, type, message, ...fields };
  const invalid = (error) => ({ values, error });
  if (!validSubmissionKey(key) || !Object.hasOwn(requestCategories[category].types, type)) {
    return invalid('Выберите тип обращения и отправьте форму ещё раз.');
  }
  if (message.length > 1500 || ((category !== 'certificates' || type === 'certificate-other') && message.length < 5)) {
    return invalid('Опишите обращение в 5–1500 символах.');
  }
  if (category === 'certificates' && (!studyYears.includes(fields.year) || !fields.faculty ||
      studyPrograms.get(fields.program) !== fields.faculty || !Object.hasOwn(certificateFormats, fields.format))) {
    return invalid('Укажите курс, факультет, направление этого факультета и формат справки.');
  }
  return { key, type, message, fields, delivery: fields.format && fields.format !== 'paper' ? 'download' : 'pickup' };
}

function requestFields(request) {
  try { return JSON.parse(request.details || '{}') || {}; } catch { return {}; }
}

export function requestDetails(request) {
  const fields = requestFields(request);
  const rows = isCertificateService(request.service) ? [
    ['Курс', fields.year], ['Факультет', fields.faculty], ['Направление', fields.program],
    [fields.format ? 'Формат справки' : 'Способ получения', certificateFormats[fields.format] ?? deliveryNames[request.delivery]]
  ] : [];
  return `${rows.length ? `<dl class="facts">${rows.filter(([, value]) => value).map(([label, value]) =>
    `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : ''}
    ${request.message ? markdownContent(request.message) : ''}`;
}

export const isRequestClosed = (status) => status === 'ready' || status === 'rejected';

export function submittedRequestForm(request) {
  const category = requestCategories[serviceCategory(request.service)];
  const details = requestFields(request);
  const certificate = isCertificateService(request.service);
  const study = certificate && request.service !== 'certificate'
    ? [['Курс', details.year], ['Факультет', details.faculty], ['Направление', details.program]]
    : [];
  const format = certificate
    ? [[details.format ? 'Формат справки' : 'Способ получения', certificateFormats[details.format] ?? deliveryNames[request.delivery]]]
    : [];
  const rows = [
    [category?.question ?? 'Тип обращения', serviceTitle(request.service)],
    ...study, ...format,
    [certificate ? 'Комментарий к справке' : 'Детали обращения', request.message]
  ];
  return `<section class="panel staff-section submitted-request"><h2>Заполненная форма</h2>
    <dl class="facts submitted-request-fields">${rows.map(([label, value]) =>
      `<div><dt>${escape(label)}</dt><dd>${label === 'Детали обращения' || label === 'Комментарий к справке' ? markdownContent(value || 'Не указано') : escape(value || 'Не указано')}</dd></div>`).join('')}</dl>
  </section>`;
}

const commentTime = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow'
});

export function requestCommentHistory(comments) {
  return comments.length ? `<ol class="request-comments">${comments.map(({ author_name, body, posted_at }) => {
    const stamp = posted_at.length > 10 ? commentTime.format(new Date(posted_at)) + ' МСК'
      : posted_at ? fullDate(posted_at) + ' · время неизвестно' : 'Дата и время неизвестны';
    return `<li><header><strong>${escape(author_name)}</strong>
      ${posted_at ? `<time datetime="${escape(posted_at)}">${escape(stamp)}</time>` : `<small>${escape(stamp)}</small>`}
      </header>${markdownContent(body)}</li>`;
  }).join('')}</ol>` : '<p class="muted">Комментариев пока нет.</p>';
}

export function certificateForm(csrf, key = newSubmissionKey(), error = '', selected = 'pickup') {
  const choices = [
    ['pickup', 'Лично в студенческом офисе', pickup + '.'],
    ['download', 'Файл в кабинете', 'После подготовки файл появится в карточке обращения.']
  ];
  return `<div class="detail">${backLink('/services', 'К справкам и обращениям')}
    ${intro(requestType, 'Подготовка занимает до двух рабочих дней.')}
    <form class="panel detail-panel request-form" method="post" action="/services/certificate">
      <input type="hidden" name="csrf" value="${escape(csrf)}">
      <input type="hidden" name="submission" value="${escape(key)}">
      <fieldset><legend>Как вам удобнее получить справку?</legend>
        ${choices.map(([value, label, hint]) => `<label class="choice">
          <input type="radio" name="delivery" value="${value}" required ${selected === value ? 'checked' : ''}>
          <span><strong>${label}</strong><small>${escape(hint)}</small></span></label>`).join('')}
      </fieldset>
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      <button class="button" type="submit">Отправить запрос${icon('arrow')}</button>
    </form></div>`;
}

function timeline(status) {
  const states = ['submitted', 'processing', 'ready'];
  if (status === 'waiting') states.splice(2, 0, 'waiting');
  if (status === 'rejected') states[2] = 'rejected';
  const current = states.indexOf(status);
  return `<ol class="status-steps">${states.map((state, index) => `<li ${index === current ? 'aria-current="step"' : ''}>
    <span class="step-dot" aria-hidden="true">${index < current ? icon('check') : ''}</span><span>${requestStatuses[state].label}</span></li>`).join('')}</ol>`;
}

export function requestPage(request, consultations = false, { comments = [], csrf, error, comment = '', file = null } = {}) {
  const status = requestStatuses[request.status];
  const path = requestPath(request.id);
  const certificate = isCertificateService(request.service);
  const detail = !certificate && request.status === 'ready' ? 'Студенческий офис завершил рассмотрение обращения.'
    : !certificate && request.status === 'processing' ? 'Студенческий офис рассматривает обращение.' : status.detail;
  return `<div class="detail">${backLink('/services/requests', 'К моим обращениям')}
    <div class="detail-heading">${intro(serviceTitle(request.service), 'Обращение ' + requestNumber(request.id) + ' · ' + serviceCategoryTitle(request.service))}${statusBadge(request.status)}</div>
    ${consultations ? `<a class="home-button home-button-outline" href="/services/consultations?request=${encodeURIComponent(request.id)}">${icon('calendar')}Записаться на консультацию</a>` : ''}
    <section class="panel detail-panel"><h2>Статус обращения</h2>${timeline(request.status)}<p class="status-explanation">${detail}</p></section>
    <section class="panel detail-panel" id="comments"><h2>Комментарии</h2>
      ${requestCommentHistory(comments)}
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      ${csrf && !isRequestClosed(request.status) ? `<form class="staff-form" method="post" action="${path}">
        <input type="hidden" name="csrf" value="${escape(csrf)}">
        <input type="hidden" name="expected" value="${request.status}">
        <input type="hidden" name="submission" value="${newSubmissionKey()}">
        <label>Комментарий${formatToolbar('request-comment')}<textarea id="request-comment" name="comment" rows="3" maxlength="1500" required>${escape(comment)}</textarea></label>
        <button class="button-secondary" type="submit">Отправить комментарий</button>
      </form>` : ''}
    </section>
    ${certificate ? `
    <section class="panel detail-panel"><h2>Получение справки</h2>${requestDetails(request)}
    <p class="muted">${escape(fullDate(request.created_on))}</p>
    ${request.status === 'ready' && (request.delivery === 'pickup' || requestFields(request).format === 'both') ? `<p class="status-explanation"><strong>${pickup}.</strong> Возьмите студенческий билет. Пункт выдачи работает по будням с 10:00 до 17:00 МСК.</p>` : ''}
    ${request.status === 'ready' && request.delivery === 'download' ? `<div class="detail-footer">
      ${linkButton(path + '/download', file ? 'Скачать справку' : 'Скачать образец справки (демонстрационный)', 'download')}
      ${file ? `<p class="muted">Готовый файл: ${escape(file.filename)}</p>`
        : '<p class="muted">Пока доступен подписанный демонстрационный образец.</p>'}</div>` : ''}
    </section>` : `<section class="panel detail-panel"><h2>Ваше обращение</h2>
      <p class="service-body">${escape(request.message)}</p><p class="muted">${escape(fullDate(request.created_on))}</p>
    </section>`}</div>`;
}

export function certificateText(student, request) {
  return ['ОБРАЗЕЦ СПРАВКИ',
    '', serviceTitle(request.service), 'Номер обращения: ' + requestNumber(request.id),
    'Студент: ' + student.fullName, 'Направление: ' + (requestFields(request).program ?? student.program),
    'Курс: ' + (requestFields(request).year ?? student.year), 'Группа: ' + student.group,
    '', 'Вымышленные данные. Образец не является официальным документом.', ''].join('\r\n');
}
