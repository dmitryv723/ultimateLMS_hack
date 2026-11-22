(() => {
  const root = document.documentElement;
  const themeKey = 'dean-theme';
  const studentNavigation = root.dataset.navigation === 'student';
  const menuKey = studentNavigation ? 'dean-student-sidebar' : 'dean-sidebar';
  function load(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }
  root.dataset.theme = load(themeKey) === 'dark' ? 'dark' : 'light';
  root.dataset.sidebar = load(menuKey) ?? (studentNavigation ? 'collapsed' : 'expanded');

  function syncButtons() {
    const dark = root.dataset.theme === 'dark';
    const expanded = root.dataset.sidebar !== 'collapsed';
    const themeLabel = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
    const menuLabel = expanded ? 'Свернуть меню' : 'Развернуть меню';
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      button.setAttribute('aria-label', themeLabel);
      button.title = themeLabel;
    }
    for (const button of document.querySelectorAll('[data-sidebar-toggle]')) {
      button.setAttribute('aria-label', menuLabel);
      button.setAttribute('aria-expanded', String(expanded));
      button.title = menuLabel;
    }
  }

  function syncMobileMenu() {
    const open = root.dataset.mobileMenu === 'open';
    const label = open ? 'Закрыть меню' : 'Открыть меню';
    for (const button of document.querySelectorAll('[data-mobile-menu]')) {
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  }

  function closeMobileMenu() {
    if (root.dataset.mobileMenu !== 'open') return;
    delete root.dataset.mobileMenu;
    syncMobileMenu();
  }

  // Formatting toolbar above long text fields. Buttons write the same lightweight
  // markup the server renders back (markdown.js), so formatting survives saving.
  const wrapMarkers = { bold: '**', italic: '*', underline: '++', strike: '~~', code: '`' };
  const listRules = {
    ul: { add: () => '- ', drop: (line) => line.startsWith('- ') ? line.slice(2) : null },
    ol: { add: (index) => `${index + 1}. `, drop: (line) => /^\d+\.\s/.exec(line)?.[0] ?? null },
    quote: { add: () => '> ', drop: (line) => line.startsWith('> ') ? line.slice(2) : null }
  };

  function wrapSelection(field, marker) {
    const { selectionStart: start, selectionEnd: end, value } = field;
    const inner = value.slice(start, end) || 'текст';
    if (value.slice(start - marker.length, start) === marker && value.slice(end, end + marker.length) === marker) {
      field.setRangeText('', start - marker.length, end + marker.length, 'end');
      return;
    }
    field.setRangeText(marker + inner + marker, start, end);
    field.setSelectionRange(start + marker.length, start + marker.length + inner.length);
  }

  function insertLink(field) {
    const { selectionStart: start, selectionEnd: end, value } = field;
    const label = value.slice(start, end);
    const snippet = `[${label || 'текст'}](https://)`;
    field.setRangeText(snippet, start, end);
    const urlAt = start + snippet.indexOf('](https://') + 2;
    field.setSelectionRange(urlAt, start + snippet.length - 1);
  }

  function toggleList(field, mode) {
    const { add, drop } = listRules[mode];
    const { selectionStart: start, selectionEnd: end, value } = field;
    const from = value.lastIndexOf('\n', start - 1) + 1;
    const lineBreak = value.indexOf('\n', end);
    const stop = lineBreak === -1 ? value.length : lineBreak;
    const lines = value.slice(from, stop).split('\n');
    const marked = lines.every((line) => !line.trim() || drop(line) !== null);
    let counter = 0;
    const block = lines.map((line) => !line.trim() ? line
      : marked ? line.slice(drop(line).length) : add(counter++)).join('\n');
    field.setRangeText(block, from, stop);
    field.setSelectionRange(from, from + block.length);
  }

  function resizeSelection(field, delta) {
    const { selectionStart: start, selectionEnd: end, value } = field;
    const match = /^\{\{(-?\d):([\s\S]+)\}\}$/.exec(value.slice(start, end));
    const level = Math.max(-2, Math.min(2, (match ? Number(match[1]) : 0) + delta));
    const text = match ? match[2] : value.slice(start, end) || 'текст';
    if (!level) {
      field.setRangeText(text, start, end);
      field.setSelectionRange(start, start + text.length);
      return;
    }
    const snippet = `{{${level}:${text}}}`;
    field.setRangeText(snippet, start, end);
    field.setSelectionRange(start + snippet.indexOf(':') + 1, start + snippet.length - 2);
  }

  // Keep the textarea selection while pressing toolbar buttons.
  document.addEventListener('mousedown', (event) => {
    if (event.target.closest('.format-toolbar')) event.preventDefault();
  });

  function syncMenu() {
    if (root.dataset.sidebar === 'collapsed') {
      for (const group of document.querySelectorAll('.primary-nav .nav-group')) group.open = false;
    }
    syncButtons();
  }
  document.addEventListener('DOMContentLoaded', syncMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.dataset.mobileMenu === 'open') {
      const inside = document.activeElement?.closest('.student-sidebar');
      closeMobileMenu();
      const toggle = document.querySelector('[data-mobile-menu]');
      if (inside && toggle) toggle.focus();
      return;
    }
    if (event.key === 'Escape' && studentNavigation && root.dataset.sidebar === 'collapsed') {
      const group = document.querySelector('.primary-nav .nav-group[open]');
      if (group) {
        group.open = false;
        if (group.contains(document.activeElement)) group.querySelector('summary').focus();
      }
    }
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229 ||
        !event.target.matches('.chat-form textarea[name="message"]')) return;
    event.preventDefault();
    if (!event.repeat && event.target.value.trim()) event.target.form.requestSubmit();
  });
  document.addEventListener('dean:render', syncMenu);
  if (studentNavigation) {
    window.matchMedia('(max-width: 740px)').addEventListener('change', (media) => {
      if (!media.matches) closeMobileMenu();
    });
  }
  document.addEventListener('click', (event) => {
    const formatButton = event.target.closest('.format-toolbar [data-cmd]');
    if (formatButton) {
      event.preventDefault();
      const field = document.getElementById(formatButton.closest('.format-toolbar').dataset.formatFor);
      if (!field) return;
      const command = formatButton.dataset.cmd;
      if (command === 'link') insertLink(field);
      else if (command === 'size-up' || command === 'size-down') resizeSelection(field, command === 'size-up' ? 1 : -1);
      else if (listRules[command]) toggleList(field, command);
      else wrapSelection(field, wrapMarkers[command]);
      return;
    }
    const back = event.target.closest('[data-syllabus-back]');
    if (back && !event.defaultPrevented && event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const previous = window.navigation
        ? window.navigation.entries()[window.navigation.currentEntry?.index - 1]?.url
        : document.referrer;
      const sameApp = previous && new URL(previous).origin === location.origin && location.origin !== 'null';
      if (sameApp || history.state?.deanInternalPreviewNavigation) {
        event.preventDefault();
        history.back();
        return;
      }
    }
    const mobileButton = event.target.closest('[data-mobile-menu]');
    if (mobileButton) {
      if (root.dataset.mobileMenu === 'open') delete root.dataset.mobileMenu;
      else root.dataset.mobileMenu = 'open';
      syncMobileMenu();
      return;
    }
    if (event.target.closest('[data-mobile-backdrop]')) {
      closeMobileMenu();
      return;
    }
    if (studentNavigation && root.dataset.sidebar === 'collapsed') {
      for (const group of document.querySelectorAll('.primary-nav .nav-group[open]')) {
        if (!group.contains(event.target)) group.open = false;
      }
    }
    const button = event.target.closest('[data-theme-toggle], [data-sidebar-toggle]');
    if (!button) return;
    if (button.hasAttribute('data-theme-toggle')) {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      save(themeKey, root.dataset.theme);
      syncButtons();
    } else {
      root.dataset.sidebar = root.dataset.sidebar === 'collapsed' ? 'expanded' : 'collapsed';
      save(menuKey, root.dataset.sidebar);
      syncMenu();
    }
  });
})();
