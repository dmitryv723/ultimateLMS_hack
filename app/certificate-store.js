import { randomBytes } from 'node:crypto';

// One issued file per request: a fresh upload replaces the previous document.
export function certificateStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_files (
      request_id TEXT PRIMARY KEY REFERENCES requests(id),
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      attachment BLOB NOT NULL,
      uploaded_by TEXT NOT NULL REFERENCES accounts(id),
      uploaded_at TEXT NOT NULL,
      submission_key TEXT NOT NULL
    );
  `);
  const insertFile = db.prepare(`INSERT INTO request_files
    (request_id, filename, mime, attachment, uploaded_by, uploaded_at, submission_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  return {
    certificateFile(id) {
      return db.prepare('SELECT request_id, filename, mime, attachment, uploaded_by, uploaded_at FROM request_files WHERE request_id = ?').get(id);
    },
    saveRequestFile(id, employee, { filename, mime, contents }, key) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const duplicate = db.prepare('SELECT 1 FROM request_files WHERE request_id = ? AND submission_key = ?').get(id, key);
        if (duplicate) {
          db.exec('COMMIT');
          return false;
        }
        db.prepare('DELETE FROM request_files WHERE request_id = ?').run(id);
        insertFile.run(id, filename, mime, contents, employee.id, new Date().toISOString(), key);
        db.exec('COMMIT');
        return true;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    // Moves an electronic request to 'ready' and stores the issued document in one
    // transaction, so the ready state never appears without the expected file.
    issueReadyRequest(id, expected, date, author, comment, key, file) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const duplicate = db.prepare('SELECT author_id FROM request_comments WHERE request_id = ? AND submission_key = ?').get(id, key);
        if (duplicate) {
          db.exec('COMMIT');
          return duplicate.author_id === author.id;
        }
        const change = db.prepare("UPDATE requests SET status = 'ready', staff_date = ? WHERE id = ? AND status = ?")
          .run(date, id, expected);
        if (!change.changes) {
          db.exec('ROLLBACK');
          return false;
        }
        if (comment) db.prepare(`INSERT INTO request_comments (request_id, author_id, author_name, body, posted_at, submission_key)
          VALUES (?, ?, ?, ?, ?, ?)`).run(id, author.id, author.fullName, comment, new Date().toISOString(), key);
        if (file) {
          db.prepare('DELETE FROM request_files WHERE request_id = ?').run(id);
          insertFile.run(id, file.filename, file.mime, file.contents, author.id, new Date().toISOString(), key);
        }
        db.exec('COMMIT');
        return true;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}
