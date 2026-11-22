export function consultationStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS consultation_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL REFERENCES accounts(id),
      day TEXT NOT NULL,
      time TEXT NOT NULL,
      meeting_place TEXT NOT NULL,
      student_id TEXT REFERENCES accounts(id),
      topic TEXT,
      request_id TEXT REFERENCES requests(id),
      UNIQUE (employee_id, day, time)
    );
    CREATE INDEX IF NOT EXISTS consultation_slots_by_day ON consultation_slots (day, time);
  `);
  return {
    consultationsForOffice(employeeId, start) {
      return db.prepare(`SELECT * FROM consultation_slots WHERE employee_id = ? AND day >= ?
        ORDER BY day, time`).all(employeeId, start);
    },
    consultationsForStudent(studentId, now) {
      return db.prepare(`SELECT id, employee_id, day, time, meeting_place, student_id, topic, request_id
        FROM consultation_slots WHERE student_id = ? OR (student_id IS NULL AND day || ' ' || time > ?)
        ORDER BY day, time`).all(studentId, now);
    },
    consultationSlot(id, studentId, now) {
      return db.prepare(`SELECT * FROM consultation_slots WHERE id = ?
        AND (student_id = ? OR (student_id IS NULL AND day || ' ' || time > ?))`).get(id, studentId, now);
    },
    createConsultation(employeeId, day, time, place) {
      return db.prepare(`INSERT INTO consultation_slots (employee_id, day, time, meeting_place)
        VALUES (?, ?, ?, ?) ON CONFLICT(employee_id, day, time) DO NOTHING`).run(employeeId, day, time, place).changes > 0;
    },
    withdrawConsultation(employeeId, id) {
      return db.prepare('DELETE FROM consultation_slots WHERE employee_id = ? AND id = ? AND student_id IS NULL')
        .run(employeeId, id).changes > 0;
    },
    bookConsultation(studentId, id, topic, requestId, now) {
      return db.prepare(`UPDATE consultation_slots AS chosen SET student_id = ?, topic = ?, request_id = ?
        WHERE id = ? AND student_id IS NULL AND day || ' ' || time > ?
        AND NOT EXISTS (SELECT 1 FROM consultation_slots AS other WHERE other.student_id = ?
          AND other.day = chosen.day AND other.time = chosen.time)`)
        .run(studentId, topic, requestId, id, now, studentId).changes > 0;
    },
    cancelConsultation(studentId, id, now) {
      return db.prepare(`UPDATE consultation_slots SET student_id = NULL, topic = NULL, request_id = NULL
        WHERE id = ? AND student_id = ? AND day || ' ' || time > ?`).run(id, studentId, now).changes > 0;
    }
  };
}
