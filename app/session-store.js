export function sessionStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_exams (
      id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      course_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('Экзамен', 'Зачёт', 'Пересдача')),
      day TEXT NOT NULL,
      time TEXT NOT NULL,
      format TEXT NOT NULL CHECK (format IN ('campus', 'online')),
      place TEXT NOT NULL,
      updated_on TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS session_exams_by_group ON session_exams(group_name, day, time);
    CREATE TABLE IF NOT EXISTS session_results (
      exam_id TEXT NOT NULL REFERENCES session_exams(id),
      student_id TEXT NOT NULL REFERENCES accounts(id),
      draft TEXT NOT NULL,
      published TEXT,
      published_on TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      publication_revision INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (exam_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS session_results_by_student ON session_results(student_id);
  `);
  const all = db.prepare('SELECT * FROM session_exams ORDER BY day, time, id');
  const byGroup = db.prepare('SELECT * FROM session_exams WHERE group_name = ? ORDER BY day, time, id');
  const byId = db.prepare('SELECT * FROM session_exams WHERE id = ?');
  const results = db.prepare('SELECT * FROM session_results WHERE exam_id = ?');
  const publishedResults = db.prepare(`
    SELECT result.exam_id, result.published, result.published_on, result.publication_revision,
      exam.group_name, exam.course_id
    FROM session_results AS result JOIN session_exams AS exam ON exam.id = result.exam_id
    WHERE result.student_id = ? AND result.published IS NOT NULL ORDER BY result.published_on DESC, result.rowid DESC
  `);
  const insertResult = db.prepare(`
    INSERT INTO session_results (exam_id, student_id, draft, published, published_on, publication_revision)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(exam_id, student_id) DO NOTHING
  `);
  const updateResult = db.prepare(`
    UPDATE session_results SET draft = ?,
      published_on = CASE WHEN ? IS NOT NULL AND published IS NOT ? THEN ? ELSE published_on END,
      publication_revision = publication_revision + CASE WHEN ? IS NOT NULL AND published IS NOT ? THEN 1 ELSE 0 END,
      published = COALESCE(?, published), revision = revision + 1
    WHERE exam_id = ? AND student_id = ? AND revision = ?
  `);
  const insert = db.prepare(`
    INSERT INTO session_exams (id, group_name, course_id, kind, day, time, format, place, updated_on)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
  `);
  const update = db.prepare(`
    UPDATE session_exams SET kind = ?, day = ?, time = ?, format = ?, place = ?, updated_on = ?,
      revision = revision + 1 WHERE id = ? AND revision = ?
  `);
  return {
    sessionExams: (group) => group ? byGroup.all(group) : all.all(),
    sessionExam: (id) => byId.get(id),
    sessionResults: (examId) => results.all(examId),
    publishedSessionResults: (studentId) => publishedResults.all(studentId),
    saveSessionResult(examId, studentId, result, revision, publish, date) {
      const published = publish ? result : null;
      if (revision === 0) return insertResult.run(examId, studentId, result, published, publish ? date : null, Number(publish)).changes === 1;
      return updateResult.run(result, published, published, date, published, published, published, examId, studentId, revision).changes === 1;
    },
    createSessionExam(id, classroom, fields, date) {
      insert.run(id, classroom.group, classroom.course.id, fields.kind, fields.day, fields.time, fields.format, fields.place, date);
      return id;
    },
    updateSessionExam(exam, fields, revision, date) {
      if (exam.revision !== revision) return false;
      if (['kind', 'day', 'time', 'format', 'place'].every((field) => exam[field] === fields[field])) return true;
      return update.run(fields.kind, fields.day, fields.time, fields.format, fields.place, date, exam.id, revision).changes === 1;
    },
  };
}
