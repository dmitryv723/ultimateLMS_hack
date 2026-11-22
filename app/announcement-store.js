const audience = `((scope = 'group' AND target = ?) OR (scope = 'course' AND target IN (SELECT value FROM json_each(?))))`;
const studentScope = ({ group, subjects }) => [group, JSON.stringify(subjects.map(({ id }) => id))];

export function announcementStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('group', 'course')),
      target TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES accounts(id),
      published_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS announcements_by_audience ON announcements(scope, target, published_at);
  `);
  const selectAll = db.prepare('SELECT * FROM announcements ORDER BY published_at DESC, rowid DESC');
  const selectVisible = db.prepare(`SELECT * FROM announcements WHERE ${audience} ORDER BY published_at DESC, rowid DESC LIMIT ?`);
  const selectVisibleById = db.prepare(`SELECT * FROM announcements WHERE id = ? AND ${audience}`);
  const insert = db.prepare(`
    INSERT INTO announcements (id, scope, target, title, body, author_id, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
  `);
  return {
    officeAnnouncements: () => selectAll.all(),
    studentAnnouncements: (student, limit = -1) => selectVisible.all(...studentScope(student), limit),
    studentAnnouncement: (student, id) => selectVisibleById.get(id, ...studentScope(student)),
    publishAnnouncement: (id, entry, authorId, timestamp) =>
      insert.run(id, entry.scope, entry.target, entry.title, entry.body, authorId, timestamp),
  };
}
