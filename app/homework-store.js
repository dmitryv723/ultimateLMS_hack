import { randomBytes } from 'node:crypto';

export function homeworkStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS homework_answers (
      id INTEGER PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES accounts(id),
      group_name TEXT NOT NULL,
      course_id TEXT NOT NULL,
      activity_key TEXT NOT NULL,
      body TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submission_key TEXT NOT NULL,
      UNIQUE (student_id, submission_key)
    );
    CREATE INDEX IF NOT EXISTS homework_answers_by_activity
      ON homework_answers (group_name, course_id, activity_key, student_id, id DESC);
    CREATE TABLE IF NOT EXISTS homework_attachments (
      id TEXT PRIMARY KEY,
      answer_id INTEGER NOT NULL REFERENCES homework_answers(id),
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      attachment BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS homework_attachments_by_answer ON homework_attachments (answer_id);
  `);
  const attachments = db.prepare('SELECT id, filename, mime FROM homework_attachments WHERE answer_id = ? ORDER BY rowid');
  return {
    homeworkAnswer(studentId, group, courseId, activityKey) {
      const answer = db.prepare(`SELECT answer.*, grade.feedback, grade.score AS reviewed_score
        FROM homework_answers AS answer
        LEFT JOIN published_grades AS grade
          ON grade.student_id = answer.student_id AND grade.course_id = answer.course_id
          AND grade.activity_key = answer.activity_key AND grade.answer_id = answer.id
        WHERE answer.student_id = ? AND answer.group_name = ? AND answer.course_id = ?
          AND answer.activity_key = ? ORDER BY answer.id DESC LIMIT 1`).get(studentId, group, courseId, activityKey);
      return answer && { ...answer, files: attachments.all(answer.id) };
    },
    recentHomeworkAnswers(group, courseId) {
      return db.prepare(`SELECT id, student_id, activity_key, sent_at FROM homework_answers
        WHERE group_name = ? AND course_id = ? ORDER BY id DESC LIMIT 25`).all(group, courseId);
    },
    saveHomeworkAnswer(student, assignment, activityKey, { body, files, key }) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const answer = db.prepare(`INSERT INTO homework_answers (student_id, group_name, course_id, activity_key, body, submission_key)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (student_id, submission_key) DO NOTHING RETURNING id`)
          .get(student.id, student.group, assignment.courseId, activityKey, body, key);
        if (answer) {
          const insert = db.prepare('INSERT INTO homework_attachments VALUES (?, ?, ?, ?, ?)');
          for (const file of files) {
            insert.run(randomBytes(16).toString('hex'), answer.id, file.filename, file.mime, file.contents);
          }
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    homeworkAttachment(id) {
      return db.prepare(`SELECT file.filename, file.mime, file.attachment, answer.student_id, answer.group_name, answer.course_id
        FROM homework_attachments AS file JOIN homework_answers AS answer ON file.answer_id = answer.id WHERE file.id = ?`).get(id);
    }
  };
}
