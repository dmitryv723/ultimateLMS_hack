import { escape } from './layout.js';

// Line icons for the formatting toolbar, drawn in the style of layout.js.
const glyphs = {
  bold: '<path d="M8 5h5a3.25 3.25 0 0 1 0 6.5H8Zm0 6.5h6a3.5 3.5 0 0 1 0 7H8Z"/>',
  italic: '<path d="M11 5h8M5 19h8m3.5-14-6 14"/>',
  underline: '<path d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14"/>',
  strike: '<path d="M8.5 8.5C8.5 6.6 10 5 12 5s3.5 1.4 3.5 3.2M4 12.5h16M8.5 15.2c0 2 1.5 3.8 3.5 3.8s3.5-1.7 3.5-3.6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.25"/><circle cx="4.5" cy="12" r="1.25"/><circle cx="4.5" cy="18" r="1.25"/>',
  quote: '<path d="M10 7H6v5h4c0 3-1.2 4.6-4 5.5M20 7h-4v5h4c0 3-1.2 4.6-4 5.5"/>',
  code: '<path d="m9 8-4 4 4 4m6-8 4 4-4 4"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7.4l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.7 1.7M13.5 10.5a4 4 0 0 0-5.7-.4l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.7-1.7"/>'
};
const glyph = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${glyphs[name]}</svg>`;

// Commands are applied by public/interface.js; markup is rendered by markdown.js.
const commands = [
  ['bold', 'Полужирный', '<span class="glyph-b">B</span>'],
  ['italic', 'Курсив', '<span class="glyph-i">I</span>'],
  ['underline', 'Подчёркнутый', '<span class="glyph-u">U</span>'],
  ['strike', 'Зачёркнутый', '<span class="glyph-s">S</span>'],
  ['size-up', 'Крупный шрифт', '<span class="glyph-size">A+</span>'],
  ['size-down', 'Мелкий шрифт', '<span class="glyph-size">A−</span>'],
  ['ul', 'Список', glyph('list')],
  ['ol', 'Нумерованный список', '<span class="glyph-size">1.</span>'],
  ['quote', 'Цитата', glyph('quote')],
  ['code', 'Моноширинный', glyph('code')],
  ['link', 'Ссылка', glyph('link')]
];

// Toolbar for one long text field: `target` is the id of the textarea below it.
export const formatToolbar = (target) => `<div class="format-toolbar" role="toolbar" aria-label="Форматирование текста" data-format-for="${escape(target)}">
  ${commands.map(([command, title, body]) =>
    `<button class="format-button" type="button" data-cmd="${command}" title="${title}" aria-label="${title}">${body}</button>`).join('')}
</div>`;
