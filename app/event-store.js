import { randomBytes } from 'node:crypto';
import { addDays, today } from './fixtures.js';

export function eventStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campus_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL, description TEXT NOT NULL, place TEXT NOT NULL,
      day TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
      author_id TEXT REFERENCES accounts(id), submission_key TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (author_id, submission_key)
    );
    CREATE INDEX IF NOT EXISTS campus_events_by_day ON campus_events(day, start);
    CREATE TABLE IF NOT EXISTS event_registrations (
      event_id TEXT NOT NULL REFERENCES campus_events(id),
      student_id TEXT NOT NULL REFERENCES accounts(id),
      PRIMARY KEY (event_id, student_id)
    );
    CREATE TABLE IF NOT EXISTS event_images (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES campus_events(id),
      kind TEXT NOT NULL CHECK (kind IN ('cover', 'photo')),
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      contents BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS event_images_by_event ON event_images(event_id, kind);
    CREATE TABLE IF NOT EXISTS event_calendar (
      event_id TEXT NOT NULL REFERENCES campus_events(id),
      student_id TEXT NOT NULL REFERENCES accounts(id),
      PRIMARY KEY (event_id, student_id)
    );
  `);
  const examples = [
    ['demo-analytics', 'Открытая встреча по аналитике', 'Разберём, как проверять продуктовые гипотезы на данных.', 'Аудитория Б-312', 3, '17:00', '18:30'],
    ['demo-case', 'Кейс-клуб: первая встреча', 'Разминка с коротким кейсом и знакомство с командой клуба.', 'Аудитория А-208', 6, '16:00', '17:30'],
    ['demo-career', 'Встреча с выпускниками', 'Выпускники расскажут о первых стажировках и ответят на вопросы.', 'Конференц-зал', 10, '18:00', '19:30']
  ];
  const seed = db.prepare(`INSERT OR IGNORE INTO campus_events (id, title, description, place, day, start, end)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const [id, title, description, place, offset, start, end] of examples) {
    seed.run(id, title, description, place, addDays(today(), offset), start, end);
  }

  const cover = "(SELECT id FROM event_images WHERE event_id = event.id AND kind = 'cover') AS cover_id";
  const studentEvents = `SELECT event.*, ${cover},
    registration.student_id IS NOT NULL AS registered, calendar.student_id IS NOT NULL AS saved
    FROM campus_events AS event
    LEFT JOIN event_registrations AS registration ON registration.event_id = event.id AND registration.student_id = ?
    LEFT JOIN event_calendar AS calendar ON calendar.event_id = event.id AND calendar.student_id = ?`;
  const staffEvents = `SELECT event.*, ${cover},
    (SELECT count(*) FROM event_registrations WHERE event_id = event.id) AS attendees FROM campus_events AS event`;

  const imagesFor = (event) => event && { ...event, photos: db.prepare(
    "SELECT id, filename FROM event_images WHERE event_id = ? AND kind = 'photo' ORDER BY rowid").all(event.id) };

  function saveImages(id, { cover, photos = [] }) {
    const insert = db.prepare('INSERT INTO event_images VALUES (?, ?, ?, ?, ?, ?)');
    const save = (kind, file) => insert.run(randomBytes(16).toString('hex'), id, kind, file.filename, file.mime, file.contents);
    if (cover) {
      db.prepare("DELETE FROM event_images WHERE event_id = ? AND kind = 'cover'").run(id);
      save('cover', cover);
    }
    for (const photo of photos) save('photo', photo);
  }

  function editWithImages(write) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = write();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    eventImage(id) {
      return db.prepare('SELECT mime, contents FROM event_images WHERE id = ?').get(id);
    },
    eventsForStudent(student, from) {
      return db.prepare(studentEvents + ' WHERE event.day >= ? ORDER BY day, start, event.id').all(student, student, from);
    },
    eventForStudent(student, id) {
      return imagesFor(db.prepare(studentEvents + ' WHERE event.id = ?').get(student, student, id));
    },
    calendarEvents(student, from, through) {
      return db.prepare(`SELECT event.id, title, day, start, end, place FROM event_calendar
        JOIN campus_events AS event ON event.id = event_id
        WHERE student_id = ? AND day BETWEEN ? AND ? ORDER BY day, start, event.id`).all(student, from, through);
    },
    eventsForOffice() {
      return db.prepare(staffEvents + ' ORDER BY day, start, event.id').all();
    },
    eventForOffice(id) {
      return imagesFor(db.prepare(staffEvents + ' WHERE event.id = ?').get(id));
    },
    createEvent(author, event, key, images = {}) {
      return editWithImages(() => {
        const replay = db.prepare('SELECT id FROM campus_events WHERE author_id = ? AND submission_key = ?').get(author, key);
        if (replay) return replay.id;
        const id = randomBytes(10).toString('hex');
        db.prepare(`INSERT INTO campus_events (id, title, description, place, day, start, end, author_id, submission_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, event.title, event.description, event.place, event.day, event.start, event.end, author, key);
        saveImages(id, images);
        return id;
      });
    },
    updateEvent(id, event, revision, images = {}) {
      return editWithImages(() => {
        const changed = db.prepare(`UPDATE campus_events SET title = ?, description = ?, place = ?, day = ?, start = ?, end = ?,
          revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND revision = ?`)
          .run(event.title, event.description, event.place, event.day, event.start, event.end, id, revision).changes > 0;
        if (changed) saveImages(id, images);
        return changed;
      });
    },
    setEventRegistration(id, student, registration, now) {
      if (registration) return db.prepare(`INSERT INTO event_registrations (event_id, student_id)
        SELECT id, ? FROM campus_events WHERE id = ? AND day || 'T' || start > ?
        ON CONFLICT (event_id, student_id) DO NOTHING`).run(student, id, now);
      return db.prepare(`DELETE FROM event_registrations WHERE event_id = ? AND student_id = ?
        AND EXISTS (SELECT 1 FROM campus_events WHERE id = ? AND day || 'T' || start > ?)`).run(id, student, id, now);
    },
    setEventCalendar(id, student, saved) {
      if (saved) db.prepare('INSERT OR IGNORE INTO event_calendar VALUES (?, ?)').run(id, student);
      else db.prepare('DELETE FROM event_calendar WHERE event_id = ? AND student_id = ?').run(id, student);
    }
  };
}
