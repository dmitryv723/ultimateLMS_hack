import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { homePage } from './home.js';
import { page } from './layout.js';
import { today } from './fixtures.js';
import { openStore } from './store.js';

const store = openStore(':memory:');
const [{ student }] = store.configureAccounts();
const reminders = store.remindersFor(student.id);
const requests = store.requestsFor(student.id);
const demoEvents = store.eventsForStudent(student.id, today());
store.close();

const date = today();
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const modules = ['fixtures', 'notifications', 'layout', 'markdown', 'format-toolbar', 'services', 'teaching-catalog', 'syllabus', 'courses', 'course-chat', 'home', 'timetable', 'grade-types', 'academic', 'events'];
const source = modules.map((name) => {
  const contents = read('./' + name + '.js')
  .replace(/^import [^\n]*\r?$/gm, '')
  .replace(/^export /gm, '')
  .replace("randomBytes(12).toString('hex')",
    "Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('')");
  if (name === 'syllabus') {
    const exports = '{ universitySyllabus, subjectSyllabus, syllabusBackLink }';
    return `const ${exports} = (() => {\n${contents}\nreturn ${exports};\n})();`;
  }
  return contents;
}).join('\n');
const state = { previewDay: date, initialReminders: reminders, demoRequests: requests, demoEvents };
const script = ['(() => {"use strict";', source,
  ...Object.entries(state).map(([name, value]) => 'const ' + name + ' = ' + JSON.stringify(value) + ';'),
  read('./preview-browser.js'), '})();'].join('\n').replace(/<\/script/gi, '<\\/script');
const statusStyle = '#preview-status{position:fixed;z-index:8;inset:auto 16px 78px auto;max-width:min(380px,calc(100vw - 32px));background:#191a1b;color:#fff;padding:12px 16px;border-radius:10px}';
const html = page(student, 'home', 'Мои курсы', homePage(student, date, reminders, ''), date)
  .replace('<script src="/assets/interface.js"></script>', () => '<script>' + read('./public/interface.js') + '</script>')
  .replace('<link rel="stylesheet" href="/assets/style.css">', '<style>' + read('./public/style.css') + statusStyle + '</style>')
  .replace('<body>', '<body><div id="preview-root">')
  .replace('</body>', () => '</div><div id="preview-status" role="status" tabindex="-1" hidden></div><script>' + script + '</script></body>');
const output = process.argv[2] ? resolve(process.argv[2]) : resolve(tmpdir(), 'lms-courses-preview.html');
writeFileSync(output, html, 'utf8');
console.log(output);
