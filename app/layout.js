import { shortDate, today } from './fixtures.js';
import { notificationHref, notificationItems } from './notifications.js';

export function escape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

// Original line icons for the interface. They have adjacent accessible text.
const shapes = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18M8 15h2m4 0h2m-8 3h2"/>',
  study: '<path d="m2 9 10-5 10 5-10 5-10-5Zm4 2v6c3 3 9 3 12 0v-6m4-2v7"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8m-8 4h6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  moon: '<path d="M20 15A8.5 8.5 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pin: '<path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  person: '<circle cx="12" cy="7" r="3"/><path d="M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/>',
  shift: '<path d="M4 8h15m-4-4 4 4-4 4m5 4H5m4-4-4 4 4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 4v16h16M8 16v-4m4 4V8m4 8V5"/>',
  trend: '<path d="M4 4v16h16M7 8l5 5 4-2 4 5m-4 0h4v-4"/>',
  book: '<path d="M12 6v14m0-14C9 4 6 4 3 5v13c3-1 6-1 9 2 3-3 6-3 9-2V5c-3-1-6-1-9 1Z"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16m-9 0v10"/>',
  chat: '<path d="M20 14a3 3 0 0 1-3 3H9l-5 4V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Zm-12-4h8m-8 3h6"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16m-8-8c4 4 4 12 0 16-4-4-4-12 0-16Z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2m1-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v1"/>',
  megaphone: '<path d="m3 10 16-5v14L3 14v-4Zm5 6 2 5h3l-2-4m8-7h2v4h-2"/>',
  news: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8Z"/>',
  logout: '<path d="M10 4H5v16h5m-1-8h12m-4-4 4 4-4 4"/>'
};
export const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
export const badge = (label, tone) => `<span class="badge ${tone}">${escape(label)}</span>`;
export const iconTile = (name, tone = 'violet') => `<span class="icon-tile ${tone}">${icon(name)}</span>`;
export const linkButton = (path, label, glyph = 'arrow') => `<a class="button" href="${path}">${escape(label)}${icon(glyph)}</a>`;
export const backLink = (path, label) => `<a class="back-link" href="${path}">${icon('back')}${escape(label)}</a>`;
export const intro = (title, summary) => `<div class="page-intro"><h1>${escape(title)}</h1>${summary ? `<p>${escape(summary)}</p>` : ''}</div>`;
export function tabs(label, options, selected) {
  return `<nav class="tabs" aria-label="${escape(label)}">${options.map(([id, text, href]) =>
    `<a href="${href}"${id === selected ? ' aria-current="page"' : ''}>${escape(text)}</a>`).join('')}</nav>`;
}

const mark = `<span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
const brand = (path) => `<a class="brand" href="${path}">${mark}<span><strong>Деканат</strong><small>Студенческий кабинет</small></span></a>`;
const sections = [
  ['study', 'Оценки', '/study', 'news'],
  ['schedule', 'Расписание', '/schedule', 'calendar'],
  ['services', 'Справки и обращения', '/services', 'file']
];

function navigationGroup(label, glyph, active, links, current = false) {
  const containsPage = links.some(([key]) => key === active);
  return `<details class="nav-group"${current || containsPage ? ' data-current' : ''}${containsPage ? ' open' : ''}>
    <summary aria-label="${escape(label)}" title="${escape(label)}">${icon(glyph)}<span>${label}</span><span class="nav-chevron">${icon('chevron')}</span></summary>
    <div>${links.map(([key, text, href]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ''}>${text}</a>`).join('')}</div>
  </details>`;
}

function document(title, body, studentNavigation = false) {
  return `<!doctype html><html lang="ru"${studentNavigation ? ' data-navigation="student" data-sidebar="collapsed"' : ''}><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark"><title>${escape(title)} · Деканат</title>
  <script src="/assets/interface.js"></script><link rel="icon" href="data:,"><link rel="stylesheet" href="/assets/style.css"></head><body>${body}</body></html>`;
}

const themeToggle = () => `<button class="toolbar-icon" type="button" data-theme-toggle aria-label="Включить тёмную тему">
  <span class="theme-moon">${icon('moon')}</span><span class="theme-sun">${icon('sun')}</span></button>`;
const sidebarToggle = (target) => `<button class="toolbar-icon sidebar-toggle" type="button" data-sidebar-toggle
  aria-controls="${target}" aria-expanded="${target !== 'student-sidebar'}" aria-label="${target === 'student-sidebar' ? 'Развернуть меню' : 'Свернуть меню'}">${icon('chevron')}</button>`;
const chatsLink = (path, active) => `<a class="toolbar-icon" href="${path}" aria-label="Чаты" title="Чаты"${active ? ' aria-current="page"' : ''}>${icon('chat')}</a>`;
const mobileMenuToggle = () => `<button class="toolbar-icon mobile-menu-toggle" type="button" data-mobile-menu
  aria-controls="student-sidebar" aria-expanded="false" aria-label="Открыть меню">
  <span class="menu-closed">${icon('menu')}</span><span class="menu-open">${icon('close')}</span></button>`;

function noticeMenu(items, href = '/notifications') {
  const unread = items.filter((item) => item.unread).length;
  return `<button class="topbar-notices toolbar-icon" type="button" popovertarget="notice-popover" aria-label="Уведомления${unread ? ' · новых ' + unread : ''}">
      ${icon('bell')}${unread ? `<span class="notice-count" aria-hidden="true">${unread}</span>` : ''}</button>
    <section id="notice-popover" class="notice-popover" popover="auto" aria-labelledby="notice-popover-title">
      <header><h2 id="notice-popover-title">Уведомления</h2>
        <button class="topbar-notices" type="button" popovertarget="notice-popover" popovertargetaction="hide" aria-label="Закрыть уведомления">${icon('close')}</button></header>
      ${items.length ? `<ul>${items.slice(0, 4).map((item) => `<li><a href="${escape(notificationHref(item))}">
        <span class="notice-icon">${icon(item.glyph)}</span>
        <span class="notice-text"><strong>${escape(item.title)}</strong><small>${escape(item.text || item.label)} · ${escape(shortDate(item.date.slice(0, 10)))}</small></span>
      </a></li>`).join('')}</ul>` : '<p class="notice-empty muted">Уведомлений пока нет.</p>'}
      <a class="notice-all" href="${href}">Смотреть все уведомления${icon('arrow')}</a>
    </section>`;
}

export function page(student, active, title, content, date = today()) {
  const tools = themeToggle() + chatsLink('/chats', active === 'chats') + noticeMenu(notificationItems(student, date));
  const nav = sections.map(([key, label, href, glyph]) => `<a href="${href}" title="${escape(label)}"${key === active ? ' aria-current="page"' : ''}>
    ${icon(glyph)}<span>${label}</span></a>`).join('');
  const shortcuts = [
    ['events', 'Афиша', '/events', 'megaphone'],
    ['home', 'Мои курсы', '/', 'study'],
    ['schedule', 'Расписание', '/schedule', 'calendar'],
    ['syllabus', 'Силлабус', '/syllabus', 'file']
  ];
  const profilePath = '/profile/' + student.id;
  return document(title, `<div class="app-frame student-frame"><a class="skip-link" href="#main">К содержанию</a>
    <header class="topbar"><div class="topbar-inner">
      ${brand('/')}
      <nav class="topbar-shortcuts" aria-label="Быстрые переходы">
        ${shortcuts.map(([key, label, href, glyph]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${icon(glyph)}${label}</a>`).join('')}
      </nav>
      <div class="topbar-actions">${tools}
        <a class="account" href="${profilePath}" aria-label="Профиль: ${escape(student.name)}" ${active === 'profile' ? 'aria-current="page"' : ''}>
          <span class="avatar">${escape(student.initials)}</span><span class="account-name">${escape(student.name)}<small>${escape(student.group)}</small></span>${icon('chevron')}</a>
        ${mobileMenuToggle()}</div>
    </div></header>
    <aside id="student-sidebar" class="student-sidebar">
      ${sidebarToggle('student-sidebar')}
      <nav class="mobile-shortcuts" aria-label="Быстрые переходы">
        ${shortcuts.map(([key, label, href]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
      <nav class="primary-nav" aria-label="Основные разделы">
        ${navigationGroup('Курсы', 'book', active, [
          ['courses-active', 'Активные', '/courses/active'], ['courses-archive', 'Архивные', '/courses/archive']
        ], active === 'home' || active === 'course')}
        ${navigationGroup('Домашние задания', 'file', active, [
          ['homework', 'Активные', '/homework'], ['homework-archive', 'Архивные', '/homework?view=archive']])}
        ${nav}</nav>
    </aside>
    <div class="mobile-backdrop" data-mobile-backdrop aria-hidden="true"></div>
    <div class="workspace"><main id="main" class="content${active === 'course' ? ' course-workspace' : ''}">${active === 'course' ? `<div class="course-view">${content}</div>` : content}</main></div>
  </div>`, true);
}

export function staffPage(person, nav, title, body, path, notices) {
  const initials = person.fullName.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase();
  return document(title, `<div class="app-frame staff-frame"><a class="skip-link" href="#main">К содержанию</a>
    <aside id="staff-sidebar" class="staff-sidebar">
      ${sidebarToggle('staff-sidebar')}<nav class="staff-nav" aria-label="Рабочие разделы">${nav}</nav>
    </aside>
    <div class="staff-workspace">
      <header class="staff-topbar"><a class="staff-brand" href="/staff">${person.role === 'teacher' ? 'Кабинет преподавателя' : 'Учебный офис'}</a>
        ${sidebarToggle('staff-sidebar')}
        <div class="staff-topbar-actions">
          ${themeToggle()}${chatsLink('/staff/chats', path.includes('/chats'))}
          ${noticeMenu(notices, '/staff/notifications')}
          <a class="account staff-account" href="/staff/profile" aria-label="Профиль: ${escape(person.fullName)}"${path === '/staff/profile' ? ' aria-current="page"' : ''}>
            <span class="avatar">${escape(initials)}</span><span class="account-name">${escape(person.fullName)}<small>${escape(person.roleName)}</small></span>${icon('chevron')}</a>
        </div></header>
      <main id="main" class="staff-main">${body}</main>
    </div></div>`);
}

export function loginPage(next = '/', error = '', login = '', notice = '') {
  return document('Вход', `<div class="login-frame">
    <section class="login-main"><div class="login-bar">${brand('/login')}${themeToggle()}</div>
      <main class="login-form">
        <h1>Вход в кабинет</h1>
        <p>Используйте выданный тестовый логин и пароль.</p>
        ${notice ? `<p role="status">${escape(notice)}</p>` : ''}
        ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
        <form method="post" action="/login">
          <input type="hidden" name="next" value="${escape(next)}">
          <label>Логин<input name="login" value="${escape(login)}" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="64" required></label>
          <label>Пароль<input type="password" name="password" autocomplete="current-password" maxlength="128" required></label>
          <button class="button" type="submit">Войти${icon('arrow')}</button>
        </form>
        <a class="text-link" href="/reset-password">Сбросить пароль</a>
      </main>
    </section>
    <section class="login-art" aria-hidden="true"><div class="login-orbit"></div><div class="login-symbol">${icon('calendar')}</div>
      <div class="login-art-text"><h2>Цифровой деканат</h2><p>Расписание, оценки и справки в одном кабинете.</p></div>
    </section>
  </div>`);
}

export function resetPasswordPage(error = '') {
  return document('Сброс пароля', `<div class="login-frame"><section class="login-main">
    <div class="login-bar">${brand('/login')}${themeToggle()}</div><main class="login-form">
      <h1>Сброс пароля</h1><p>Введите одноразовый код, полученный от администратора кабинета.</p>
      ${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}
      <form method="post" action="/reset-password">
        <label>Код восстановления<input name="code" type="password" autocomplete="off" maxlength="43" required></label>
        <label>Новый пароль<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>
        <label>Повторите пароль<input name="confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>
        <button type="submit" class="button">Сохранить пароль${icon('check')}</button>
      </form>
      <a class="text-link" href="/login">Ко входу</a>
    </main></section></div>`);
}

export function errorPage(student, message = 'Страница недоступна', explanation = 'Проверьте адрес или вернитесь в расписание.') {
  if (student) return page(student, '', message, `${intro(message, explanation)}${linkButton('/schedule', 'К расписанию')}`);
  return document(message, `<main class="content standalone">${intro(message, explanation)}${linkButton('/login', 'Ко входу')}`);
}

