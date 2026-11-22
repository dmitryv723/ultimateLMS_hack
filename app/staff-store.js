import { createHash, randomBytes } from 'node:crypto';

export const gradeActivityId = (key) => createHash('sha256').update(key).digest('hex').slice(0, 24);

export function staffStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_publications (
      id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      course_id TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES accounts(id),
      kind TEXT NOT NULL CHECK (kind IN ('material', 'homework', 'test')),
      title TEXT NOT NULL,
      due_on TEXT,
      due_at TEXT,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      attachment BLOB NOT NULL,
      submission_key TEXT NOT NULL,
      topic_id TEXT NOT NULL DEFAULT 'general',
      description TEXT NOT NULL DEFAULT '',
      UNIQUE (author_id, submission_key)
    );
    CREATE TABLE IF NOT EXISTS published_grades (
      student_id TEXT NOT NULL REFERENCES accounts(id),
      course_id TEXT NOT NULL,
      activity_key TEXT NOT NULL,
      title TEXT NOT NULL,
      score TEXT NOT NULL,
      PRIMARY KEY (student_id, course_id, activity_key)
    );
    CREATE TABLE IF NOT EXISTS grade_comments (
      id INTEGER PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES accounts(id),
      teacher_id TEXT NOT NULL REFERENCES accounts(id),
      course_id TEXT NOT NULL,
      activity_key TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES accounts(id),
      comment TEXT NOT NULL,
      submission_key TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (author_id, submission_key),
      CHECK (author_id = student_id OR author_id = teacher_id)
    );
    CREATE INDEX IF NOT EXISTS grade_comment_threads
      ON grade_comments (student_id, teacher_id, course_id, activity_key, id);
    CREATE TABLE IF NOT EXISTS course_messages (
      id INTEGER PRIMARY KEY,
      group_name TEXT NOT NULL,
      course_id TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES accounts(id),
      author_name TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submission_key TEXT NOT NULL,
      UNIQUE (author_id, submission_key)
    );
    CREATE TABLE IF NOT EXISTS lesson_changes (
      group_name TEXT NOT NULL,
      day TEXT NOT NULL,
      lesson_number INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      room TEXT NOT NULL,
      previous_slot INTEGER NOT NULL,
      previous_room TEXT NOT NULL,
      reason TEXT NOT NULL,
      published_on TEXT NOT NULL,
      PRIMARY KEY (group_name, day, lesson_number),
      UNIQUE (group_name, day, slot)
    );
    CREATE TABLE IF NOT EXISTS lesson_links (
      group_name TEXT NOT NULL,
      day TEXT NOT NULL,
      lesson_number INTEGER NOT NULL,
      link TEXT NOT NULL,
      published_on TEXT NOT NULL,
      actor_id TEXT NOT NULL REFERENCES accounts(id),
      PRIMARY KEY (group_name, day, lesson_number)
    );
    CREATE TABLE IF NOT EXISTS private_course_messages (
      id INTEGER PRIMARY KEY,
      group_name TEXT,
      course_id TEXT,
      teacher_id TEXT NOT NULL REFERENCES accounts(id),
      student_id TEXT NOT NULL REFERENCES accounts(id),
      author_id TEXT NOT NULL REFERENCES accounts(id),
      author_name TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submission_key TEXT NOT NULL,
      UNIQUE (author_id, submission_key),
      CHECK (author_id = teacher_id OR author_id = student_id)
    );
    CREATE TABLE IF NOT EXISTS schedule_notices (
      id INTEGER PRIMARY KEY,
      group_name TEXT NOT NULL,
      day TEXT NOT NULL,
      lesson_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      slot INTEGER NOT NULL,
      room TEXT NOT NULL,
      previous_slot INTEGER NOT NULL,
      previous_room TEXT NOT NULL,
      reason TEXT NOT NULL,
      actor_id TEXT NOT NULL REFERENCES accounts(id),
      published_on TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedule_notice_reads (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id),
      through_id INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notice_reads (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      event_key TEXT NOT NULL,
      PRIMARY KEY (account_id, event_key)
    );
    CREATE TABLE IF NOT EXISTS schedule_proposals (
      id INTEGER PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES accounts(id),
      group_name TEXT NOT NULL,
      day TEXT NOT NULL,
      lesson_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      original_slot INTEGER NOT NULL,
      original_room TEXT NOT NULL,
      slot INTEGER NOT NULL,
      room TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'declined')),
      decision_note TEXT,
      created_on TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_schedule_proposal
      ON schedule_proposals (group_name, day, lesson_number) WHERE status = 'pending';
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns = new Set(db.prepare('PRAGMA table_info(course_publications)').all().map(({ name }) => name));
    if (!columns.has('topic_id')) db.exec("ALTER TABLE course_publications ADD COLUMN topic_id TEXT NOT NULL DEFAULT 'general'");
    if (!columns.has('description')) db.exec("ALTER TABLE course_publications ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    const hasActivityKeys = db.prepare('PRAGMA table_info(published_grades)').all().some(({ name }) => name === 'activity_key');
    if (!hasActivityKeys) db.exec(`
      ALTER TABLE published_grades RENAME TO previous_published_grades;
      CREATE TABLE published_grades (
        student_id TEXT NOT NULL REFERENCES accounts(id),
        course_id TEXT NOT NULL,
        activity_key TEXT NOT NULL,
        title TEXT NOT NULL,
        score TEXT NOT NULL,
        PRIMARY KEY (student_id, course_id, activity_key)
      );
      INSERT INTO published_grades SELECT student_id, course_id, 'title:' || title, title, score FROM previous_published_grades;
      DROP TABLE previous_published_grades;
    `);
    const gradeColumns = new Set(db.prepare('PRAGMA table_info(published_grades)').all().map(({ name }) => name));
    if (!gradeColumns.has('feedback')) db.exec("ALTER TABLE published_grades ADD COLUMN feedback TEXT NOT NULL DEFAULT ''");
    if (!gradeColumns.has('answer_id')) db.exec('ALTER TABLE published_grades ADD COLUMN answer_id INTEGER');
    const oldChatScope = db.prepare('PRAGMA table_info(private_course_messages)').all().some(({ name, notnull }) => name === 'course_id' && notnull);
    if (oldChatScope) db.exec(`
      ALTER TABLE private_course_messages RENAME TO previous_private_course_messages;
      CREATE TABLE private_course_messages (
        id INTEGER PRIMARY KEY,
        group_name TEXT,
        course_id TEXT,
        teacher_id TEXT NOT NULL REFERENCES accounts(id),
        student_id TEXT NOT NULL REFERENCES accounts(id),
        author_id TEXT NOT NULL REFERENCES accounts(id),
        author_name TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        submission_key TEXT NOT NULL,
        UNIQUE (author_id, submission_key),
        CHECK (author_id = teacher_id OR author_id = student_id)
      );
      INSERT INTO private_course_messages SELECT id, group_name, course_id, teacher_id, student_id, author_id, author_name, message, sent_at, submission_key
        FROM previous_private_course_messages;
      DROP TABLE previous_private_course_messages;
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS private_message_threads ON private_course_messages (teacher_id, student_id, id)`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    coursePublications(group, courseId = null) {
      return db.prepare(`SELECT id, course_id, kind, title, due_on, due_at, filename, topic_id, description, author_id
        FROM course_publications WHERE group_name = ? AND (? IS NULL OR course_id = ?)
        ORDER BY rowid DESC`).all(group, courseId, courseId);
    },
    publishCourseFile(employee, classroom, topic, { kind, title, day, time, filename, mime, contents, key, description }) {
      db.prepare(`INSERT INTO course_publications
        (id, group_name, course_id, author_id, kind, title, due_on, due_at, filename, mime, attachment, submission_key, topic_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(author_id, submission_key) DO NOTHING`).run(randomBytes(16).toString('hex'), classroom.group,
        classroom.id, employee.id, kind, title, day, time, filename, mime, contents, key, topic, description);
    },
    updateCourseFile(employee, classroom, topic, id, { title, description, day, time, filename, mime, contents }) {
      db.prepare(`UPDATE course_publications SET title = ?, description = ?, due_on = ?, due_at = ?,
        filename = COALESCE(?, filename), mime = COALESCE(?, mime), attachment = COALESCE(?, attachment)
        WHERE id = ? AND group_name = ? AND course_id = ? AND topic_id = ? AND author_id = ?`)
        .run(title, description, day, time, filename ?? null, mime ?? null, contents ?? null,
          id, classroom.group, classroom.id, topic, employee.id);
    },
    courseFile(id) {
      return db.prepare('SELECT group_name, course_id, filename, mime, attachment FROM course_publications WHERE id = ?').get(id);
    },
    publishedGrades(studentId) {
      return db.prepare('SELECT course_id, activity_key, title, score FROM published_grades WHERE student_id = ? ORDER BY rowid').all(studentId);
    },
    publishGrade(studentId, courseId, work, score, { answerId = null, feedback = null } = {}) {
      db.prepare(`INSERT INTO published_grades (student_id, course_id, activity_key, title, score, answer_id, feedback)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, ''))
        ON CONFLICT(student_id, course_id, activity_key) DO UPDATE SET title = excluded.title, score = excluded.score,
          answer_id = COALESCE(excluded.answer_id, published_grades.answer_id),
          feedback = CASE WHEN ? IS NOT NULL THEN excluded.feedback
            WHEN excluded.answer_id IS NULL OR excluded.answer_id = published_grades.answer_id THEN published_grades.feedback
            ELSE '' END`).run(studentId, courseId, work.activityKey, work.title, score, answerId, feedback, feedback);
    },
    gradeComments(studentId, teacherId, courseId, activityKey) {
      return db.prepare(`SELECT author_id, comment FROM grade_comments
        WHERE student_id = ? AND teacher_id = ? AND course_id = ? AND activity_key = ? ORDER BY id`)
        .all(studentId, teacherId, courseId, activityKey);
    },
    postGradeComment(studentId, teacherId, courseId, activityKey, authorId, { comment, key }) {
      db.prepare(`INSERT INTO grade_comments (student_id, teacher_id, course_id, activity_key, author_id, comment, submission_key)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(author_id, submission_key) DO NOTHING`)
        .run(studentId, teacherId, courseId, activityKey, authorId, comment, key);
    },
    incomingGradeComments(person) {
      return db.prepare(`SELECT * FROM grade_comments
        WHERE (student_id = ? AND author_id = teacher_id) OR (teacher_id = ? AND author_id = student_id)
        ORDER BY id DESC LIMIT 30`).all(person, person);
    },
    courseMessages(group, courseId) {
      return db.prepare(`SELECT author_name, message, sent_at FROM course_messages
        WHERE group_name = ? AND course_id = ? ORDER BY id DESC LIMIT 100`).all(group, courseId).reverse();
    },
    postCourseMessage(person, group, courseId, message, key) {
      db.prepare(`INSERT INTO course_messages (group_name, course_id, author_id, author_name, message, submission_key)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(author_id, submission_key) DO NOTHING`)
        .run(group, courseId, person.id, person.fullName, message, key);
    },
    privateCourseMessages(teacherId, studentId) {
      return db.prepare(`SELECT author_name, message, sent_at FROM private_course_messages
        WHERE teacher_id = ? AND student_id = ?
        ORDER BY id DESC LIMIT 100`).all(teacherId, studentId).reverse();
    },
    incomingDirectMessages(accountId) {
      return db.prepare(`SELECT id, author_id, author_name, sent_at FROM private_course_messages
        WHERE (teacher_id = ? OR student_id = ?) AND author_id <> ? ORDER BY id DESC LIMIT 25`)
        .all(accountId, accountId, accountId);
    },
    postPrivateCourseMessage(person, teacherId, studentId, message, key) {
      db.prepare(`INSERT INTO private_course_messages
        (teacher_id, student_id, author_id, author_name, message, submission_key)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(author_id, submission_key) DO NOTHING`)
        .run(teacherId, studentId, person.id, person.fullName, message, key);
    },
    lessonChanges(group) {
      return db.prepare('SELECT * FROM lesson_changes WHERE group_name = ? ORDER BY rowid DESC').all(group);
    },
    lessonLink(group, day, number) {
      return db.prepare('SELECT link, published_on FROM lesson_links WHERE group_name = ? AND day = ? AND lesson_number = ?')
        .get(group, day, number);
    },
    lessonLinks(group) {
      return db.prepare('SELECT day, lesson_number, link, published_on FROM lesson_links WHERE group_name = ? ORDER BY day, lesson_number')
        .all(group);
    },
    setLessonLink(group, day, number, link, publishedOn, actorId) {
      if (!link) {
        return db.prepare('DELETE FROM lesson_links WHERE group_name = ? AND day = ? AND lesson_number = ?')
          .run(group, day, number).changes > 0;
      }
      db.prepare(`INSERT INTO lesson_links (group_name, day, lesson_number, link, published_on, actor_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(group_name, day, lesson_number) DO UPDATE SET
        link = excluded.link, published_on = excluded.published_on, actor_id = excluded.actor_id`)
        .run(group, day, number, link, publishedOn, actorId);
      return true;
    },
    moveLesson(group, lesson, day, number, slot, room, reason, publishedOn, actorId, { proposalId, hasConflict } = {}) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = db.prepare('SELECT slot, room FROM lesson_changes WHERE group_name = ? AND day = ? AND lesson_number = ?')
          .get(group, day, number);
        const taken = db.prepare('SELECT 1 FROM lesson_changes WHERE group_name = ? AND day = ? AND slot = ? AND lesson_number <> ?')
          .get(group, day, slot, number);
        if (taken || (current && (current.slot !== lesson.slot || current.room !== lesson.room)) || hasConflict?.()) {
          db.exec('ROLLBACK');
          return false;
        }
        if (proposalId && !db.prepare(`UPDATE schedule_proposals SET status = 'published'
          WHERE id = ? AND status = 'pending' AND group_name = ? AND day = ? AND lesson_number = ?`)
          .run(proposalId, group, day, number).changes) {
          db.exec('ROLLBACK');
          return false;
        }
        db.prepare(`INSERT INTO lesson_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(group_name, day, lesson_number) DO UPDATE SET
          slot=excluded.slot, room=excluded.room, previous_slot=excluded.previous_slot,
          previous_room=excluded.previous_room, reason=excluded.reason, published_on=excluded.published_on`)
          .run(group, day, number, slot, room, lesson.slot, lesson.room, reason, publishedOn);
        db.prepare(`INSERT INTO schedule_notices
          (group_name, day, lesson_number, title, slot, room, previous_slot, previous_room, reason, actor_id, published_on)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(group, day, number, lesson.name, slot, room, lesson.slot, lesson.room, reason, actorId, publishedOn);
        if (!proposalId) {
          db.prepare(`UPDATE schedule_proposals SET status = 'declined', decision_note = ?
            WHERE group_name = ? AND day = ? AND lesson_number = ? AND status = 'pending'`)
            .run('Расписание занятия уже изменено учебным офисом.', group, day, number);
        }
        db.exec('COMMIT');
        return true;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    scheduleProposals({ teacher = null, group = null } = {}) {
      return db.prepare(`SELECT * FROM schedule_proposals WHERE (? IS NULL OR teacher_id = ?) AND (? IS NULL OR group_name = ?)
        ORDER BY status <> 'pending', id DESC`).all(teacher, teacher, group, group);
    },
    scheduleProposal(id) {
      return db.prepare('SELECT * FROM schedule_proposals WHERE id = ?').get(id);
    },
    proposeLesson(teacher, group, lesson, day, number, slot, room, reason, createdOn) {
      return db.prepare(`INSERT INTO schedule_proposals
        (teacher_id, group_name, day, lesson_number, title, original_slot, original_room, slot, room, reason, created_on)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
        .run(teacher, group, day, number, lesson.name, lesson.slot, lesson.room, slot, room, reason, createdOn).changes > 0;
    },
    declineScheduleProposal(id, note) {
      return db.prepare(`UPDATE schedule_proposals SET status = 'declined', decision_note = ? WHERE id = ? AND status = 'pending'`)
        .run(note, id).changes > 0;
    },
    scheduleNotices(accountId, group = null) {
      return db.prepare(`SELECT *, id > COALESCE((SELECT through_id FROM schedule_notice_reads WHERE account_id = ?), 0) AS unread
        FROM schedule_notices WHERE (? IS NULL OR group_name = ?) ORDER BY id DESC LIMIT 50`).all(accountId, group, group);
    },
    seenNoticeKeys(accountId) {
      return db.prepare('SELECT event_key FROM notice_reads WHERE account_id = ?').all(accountId).map(({ event_key }) => event_key);
    },
    markNoticesSeen(accountId, keys) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const insert = db.prepare('INSERT INTO notice_reads VALUES (?, ?) ON CONFLICT DO NOTHING');
        for (const key of keys) insert.run(accountId, key);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    officeRequests() {
      return db.prepare(`SELECT id, student_id, status, delivery, created_on, service
        FROM requests ORDER BY status = 'ready', created_on DESC, rowid DESC`).all();
    },
    officeRequest(id) {
      return db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    }
  };
}
