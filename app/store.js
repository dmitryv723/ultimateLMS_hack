import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { addDays, students, today, weekStart } from './fixtures.js';
import { employees } from './people.js';
import { staffStore } from './staff-store.js';
import { consultationStore } from './consultation-store.js';
import { homeworkStore } from './homework-store.js';
import { eventStore } from './event-store.js';
import { sessionStore } from './session-store.js';
import { announcementStore } from './announcement-store.js';
import { certificateStore } from './certificate-store.js';

const scryptAsync = promisify(scrypt);
const digest = (token) => createHash('sha256').update(token).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const dummySalt = randomBytes(16);
const dummyHash = randomBytes(64);
export const sessionLifetime = 8 * 60 * 60;
const resetLifetime = 30 * 60;

const requestsSchema = (table) => `CREATE TABLE IF NOT EXISTS ${table} (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL CHECK (status IN ('submitted', 'processing', 'waiting', 'ready', 'rejected')),
  delivery TEXT NOT NULL CHECK (delivery IN ('pickup', 'download')),
  created_on TEXT NOT NULL,
  submission_key TEXT,
  service TEXT NOT NULL DEFAULT 'certificate',
  message TEXT NOT NULL DEFAULT '',
  staff_reply TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}',
  staff_date TEXT,
  UNIQUE (student_id, submission_key)
)`;

export function openStore(path = process.env.DEAN_DB_PATH || resolve('.local', 'dean.sqlite')) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      salt BLOB NOT NULL,
      password_hash BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_preferences (
      student_id TEXT PRIMARY KEY REFERENCES accounts(id),
      display_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES accounts(id),
      csrf TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
      expires INTEGER NOT NULL
    );
    ${requestsSchema('requests')};
    CREATE INDEX IF NOT EXISTS requests_by_student ON requests(student_id, created_on);
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES accounts(id),
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_on TEXT NOT NULL,
      due_at TEXT NOT NULL,
      link TEXT,
      done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
      submission_key TEXT NOT NULL,
      UNIQUE (student_id, submission_key)
    );
  `);
  db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
  try {
    const requestColumns = new Set(db.prepare('PRAGMA table_info(requests)').all().map(({ name }) => name));
    if (!requestColumns.has('service')) db.exec("ALTER TABLE requests ADD COLUMN service TEXT NOT NULL DEFAULT 'certificate'");
    if (!requestColumns.has('message')) db.exec("ALTER TABLE requests ADD COLUMN message TEXT NOT NULL DEFAULT ''");
    if (!requestColumns.has('staff_reply')) db.exec("ALTER TABLE requests ADD COLUMN staff_reply TEXT NOT NULL DEFAULT ''");
    if (!requestColumns.has('details')) db.exec("ALTER TABLE requests ADD COLUMN details TEXT NOT NULL DEFAULT '{}'");
    if (!requestColumns.has('staff_date')) db.exec("ALTER TABLE requests ADD COLUMN staff_date TEXT");
    const requestTable = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'requests'").get();
    if (!requestTable.sql.includes("'waiting'")) {
      const columns = 'id, student_id, status, delivery, created_on, submission_key, service, message, staff_reply, details, staff_date';
      db.exec(`
        ${requestsSchema('requests_updated')};
        INSERT INTO requests_updated (${columns}) SELECT ${columns} FROM requests ORDER BY rowid;
        DROP TABLE requests;
        ALTER TABLE requests_updated RENAME TO requests;
        CREATE INDEX requests_by_student ON requests(student_id, created_on);
      `);
      if (db.prepare('PRAGMA foreign_key_check').get()) throw new Error('Request migration would break a database reference.');
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS request_comments (
        id INTEGER PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES requests(id),
        author_id TEXT REFERENCES accounts(id),
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        posted_at TEXT NOT NULL,
        submission_key TEXT NOT NULL,
        UNIQUE (request_id, submission_key)
      );
      INSERT INTO request_comments (request_id, author_name, body, posted_at, submission_key)
        SELECT id, 'Учебный офис', staff_reply, COALESCE(staff_date, ''), 'legacy-reply'
        FROM requests WHERE staff_reply <> ''
        ON CONFLICT (request_id, submission_key) DO NOTHING;
    `);
    db.exec('COMMIT; PRAGMA foreign_keys = ON');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  const accountByLogin = db.prepare('SELECT id, salt, password_hash FROM accounts WHERE login = ?');
  const sessionByToken = db.prepare('SELECT student_id, csrf FROM sessions WHERE token_hash = ? AND expires > ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const ownRequest = db.prepare('SELECT id, status, delivery, created_on, service, message, details FROM requests WHERE student_id = ? AND id = ?');
  const insertRequest = db.prepare('INSERT INTO requests (id, student_id, status, delivery, created_on) VALUES (?, ?, ?, ?, ?)');
  const insertSubmission = db.prepare(`
    INSERT INTO requests (id, student_id, status, delivery, created_on, submission_key, service, message, details)
    VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, ?) ON CONFLICT(student_id, submission_key)
    DO UPDATE SET submission_key = excluded.submission_key RETURNING id
  `);
  const insertReminder = db.prepare(`
    INSERT INTO reminders (id, student_id, course_id, title, due_on, due_at, link, submission_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(student_id, submission_key) DO NOTHING
  `);
  const selectReminders = db.prepare(`
    SELECT id, course_id, title, due_on, due_at, link, done FROM reminders
    WHERE student_id = ? ORDER BY due_on, due_at, id
  `);
  const updateReminder = db.prepare('UPDATE reminders SET done = ? WHERE student_id = ? AND id = ?');
  const accountExists = db.prepare('SELECT 1 FROM accounts WHERE id = ?');
  function seedReminder(student) {
    const exampleId = 'sample-' + student.id;
    const title = student.id === 'anna' ? 'Собрать примеры для проекта' : 'Согласовать план презентации';
    insertReminder.run(exampleId, student.id, student.subjects[3].id, title, addDays(weekStart(today()), 3), '18:00', null, exampleId);
  }
  const examples = [
    ['demo-1064', 'anna', 'schedule', 'В расписании семинара по статистике указана другая аудитория, чем в объявлении преподавателя.', 'submitted'],
    ['demo-1065', 'anna', 'transcript', 'Нужна выписка об успеваемости за прошлый семестр на русском языке.', 'processing'],
    ['demo-2042', 'maksim', 'profile', 'Прошу сверить написание моего имени в учебных данных.', 'submitted'],
    ['demo-1071', 'anna', 'financial-aid', 'Хочу подать заявление на материальную поддержку на следующий семестр.', 'submitted'],
    ['demo-2071', 'maksim', 'military-proof', 'Нужна справка для предъявления в военкомат.', 'submitted'],
    ['demo-2072', 'maksim', 'migration-extension', 'Хочу уточнить, как оформить продление миграционного учёта.', 'processing'],
    ['demo-1072', 'anna', 'tuition-invoice', 'Нужен счёт на оплату следующего семестра.', 'submitted'],
    ['demo-1073', 'anna', 'other-document', 'Нужна копия приказа о зачислении для стипендиальной программы.', 'submitted']
  ];
  const seedRequest = db.prepare(`INSERT INTO requests (id, student_id, status, delivery, created_on, service, message)
    VALUES (?, ?, ?, 'pickup', ?, ?, ?) ON CONFLICT(id) DO NOTHING`);
  function seedStudentExamples(student) {
    seedReminder(student);
    for (const [id, owner, service, message, status] of examples) {
      if (owner === student.id) seedRequest.run(id, owner, status, today(), service, message);
    }
  }
  for (const student of students) {
    if (accountExists.get(student.id)) seedStudentExamples(student);
  }

  return {
    ...certificateStore(db),
    ...staffStore(db),
    ...consultationStore(db),
    ...homeworkStore(db),
    ...eventStore(db),
    ...sessionStore(db),
    ...announcementStore(db),
    studentDisplayName(id) {
      return db.prepare('SELECT display_name FROM student_preferences WHERE student_id = ?').get(id)?.display_name;
    },
    saveStudentDisplayName(id, name) {
      db.prepare(`INSERT INTO student_preferences (student_id, display_name) VALUES (?, ?)
        ON CONFLICT(student_id) DO UPDATE SET display_name = excluded.display_name`).run(id, name);
    },
    hasAccount(id) {
      return Boolean(accountExists.get(id));
    },
    configureAccounts(reset = false) {
      const result = [];
      db.exec('BEGIN IMMEDIATE');
      try {
        const exists = db.prepare('SELECT id FROM accounts WHERE id = ?');
        const save = db.prepare(`
          INSERT INTO accounts (id, login, salt, password_hash) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET salt = excluded.salt, password_hash = excluded.password_hash
        `);
        for (const student of [...students, ...employees]) {
          const existing = exists.get(student.id);
          if (existing && !reset) continue;
          const password = randomBytes(16).toString('base64url');
          const salt = randomBytes(16);
          save.run(student.id, student.login, salt, scryptSync(password, salt, 64));
          if (existing) {
            db.prepare('DELETE FROM sessions WHERE student_id = ?').run(student.id);
            db.prepare('DELETE FROM password_resets WHERE account_id = ?').run(student.id);
          } else if (!student.role) {
            for (const example of student.requests) {
              insertRequest.run(example.id, student.id, example.status, example.delivery, addDays(today(), -example.age));
            }
            seedStudentExamples(student);
          }
          result.push({ student, password });
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return result;
    },
    async authenticate(login, password) {
      const account = accountByLogin.get(login);
      const hash = await scryptAsync(password, account?.salt || dummySalt, 64);
      const match = timingSafeEqual(hash, account?.password_hash || dummyHash);
      // A credential reset can run while scrypt is working in the thread pool.
      const current = match && account && accountByLogin.get(login);
      return current && timingSafeEqual(hash, current.password_hash) ? current.id : null;
    },
    issueResetCode(login) {
      const account = accountByLogin.get(login);
      if (!account) return null;
      const code = randomToken();
      db.prepare(`INSERT INTO password_resets VALUES (?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET token_hash = excluded.token_hash, expires = excluded.expires`)
        .run(digest(code), account.id, Math.floor(Date.now() / 1000) + resetLifetime);
      return code;
    },
    async resetPassword(code, password) {
      if (!/^[\w-]{43}$/.test(code) || password.length < 12 || password.length > 128) return false;
      const hash = digest(code);
      const salt = randomBytes(16);
      const passwordHash = await scryptAsync(password, salt, 64);
      db.exec('BEGIN IMMEDIATE');
      try {
        const reset = db.prepare('DELETE FROM password_resets WHERE token_hash = ? AND expires > ? RETURNING account_id')
          .get(hash, Math.floor(Date.now() / 1000));
        if (reset) {
          db.prepare('UPDATE accounts SET salt = ?, password_hash = ? WHERE id = ?').run(salt, passwordHash, reset.account_id);
          db.prepare('DELETE FROM sessions WHERE student_id = ?').run(reset.account_id);
        }
        db.exec('COMMIT');
        return Boolean(reset);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    createSession(studentId) {
      const now = Math.floor(Date.now() / 1000);
      const token = randomToken();
      db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(digest(token), studentId, randomToken(), now + sessionLifetime);
      return token;
    },
    session(token) {
      return token && sessionByToken.get(digest(token), Math.floor(Date.now() / 1000));
    },
    logout(token) {
      if (token) deleteSession.run(digest(token));
    },
    requestsFor(studentId) {
      return db.prepare(`
        SELECT id, status, delivery, created_on, service, staff_date FROM requests
        WHERE student_id = ? ORDER BY created_on DESC, rowid DESC
      `).all(studentId);
    },
    request(studentId, id) {
      return ownRequest.get(studentId, id);
    },
    requestComments(id) {
      return db.prepare(`SELECT author_name, body, posted_at FROM request_comments
        WHERE request_id = ? ORDER BY id`).all(id);
    },
    saveRequestChange(id, expected, status, date, author, comment, key) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const duplicate = db.prepare('SELECT author_id FROM request_comments WHERE request_id = ? AND submission_key = ?').get(id, key);
        if (duplicate) {
          db.exec('COMMIT');
          return duplicate.author_id === author.id;
        }
        const change = db.prepare('UPDATE requests SET status = ?, staff_date = ? WHERE id = ? AND status = ?')
          .run(status, date, id, expected);
        if (!change.changes) {
          db.exec('ROLLBACK');
          return false;
        }
        if (comment) db.prepare(`INSERT INTO request_comments (request_id, author_id, author_name, body, posted_at, submission_key)
          VALUES (?, ?, ?, ?, ?, ?)`).run(id, author.id, author.fullName, comment, new Date().toISOString(), key);
        db.exec('COMMIT');
        return true;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    createRequest(studentId, delivery, key, service = 'certificate', message = '', fields = {}) {
      const date = today();
      const id = date.slice(2).replaceAll('-', '') + '-' + randomBytes(6).toString('hex');
      return insertSubmission.get(id, studentId, delivery, date, key, service, message, JSON.stringify(fields)).id;
    },
    remindersFor(studentId) {
      return selectReminders.all(studentId);
    },
    createReminder(studentId, reminder, key) {
      const { courseId, title, day, time, link } = reminder;
      insertReminder.run(randomBytes(12).toString('hex'), studentId, courseId, title, day, time, link || null, key);
    },
    setReminderDone(studentId, id, done) {
      return updateReminder.run(Number(done), studentId, id).changes > 0;
    },
    close() {
      db.close();
    }
  };
}
