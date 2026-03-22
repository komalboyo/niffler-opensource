import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../data/xbrain.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id          TEXT PRIMARY KEY,
      url         TEXT NOT NULL,
      author      TEXT NOT NULL,
      author_name TEXT,
      content     TEXT NOT NULL,
      media_urls  TEXT,
      thread      TEXT,
      tweet_date  TEXT,
      category    TEXT,
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS post_tags (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS connections (
      id        TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      label     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_id, target_id)
    );
  `);

  // FTS5
  const ftsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='posts_fts'`)
    .get();

  if (!ftsExists) {
    db.exec(`
      CREATE VIRTUAL TABLE posts_fts USING fts5(
        content, author, author_name, notes,
        content='posts', content_rowid='rowid'
      );

      CREATE TRIGGER posts_fts_ai AFTER INSERT ON posts BEGIN
        INSERT INTO posts_fts(rowid, content, author, author_name, notes)
        VALUES (new.rowid, new.content, new.author, new.author_name, new.notes);
      END;

      CREATE TRIGGER posts_fts_ad AFTER DELETE ON posts BEGIN
        INSERT INTO posts_fts(posts_fts, rowid, content, author, author_name, notes)
        VALUES ('delete', old.rowid, old.content, old.author, old.author_name, old.notes);
      END;

      CREATE TRIGGER posts_fts_au AFTER UPDATE ON posts BEGIN
        INSERT INTO posts_fts(posts_fts, rowid, content, author, author_name, notes)
        VALUES ('delete', old.rowid, old.content, old.author, old.author_name, old.notes);
        INSERT INTO posts_fts(rowid, content, author, author_name, notes)
        VALUES (new.rowid, new.content, new.author, new.author_name, new.notes);
      END;
    `);
  }
}

// ─── Types ──────────────────────────────────────────────

export interface Post {
  id: string;
  url: string;
  author: string;
  author_name: string | null;
  content: string;
  media_urls: string[] | null;
  thread: string[] | null;
  tweet_date: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  tags: string[];
}

export interface Tag {
  id: string;
  name: string;
  count: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "post" | "tag";
  author?: string;
  category?: string;
  url?: string;
  size: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "tag" | "connection";
  label?: string;
}

// ─── Posts CRUD ─────────────────────────────────────────

export interface AddPostInput {
  url: string;
  author: string;
  author_name?: string;
  content: string;
  media_urls?: string[];
  thread?: string[];
  tweet_date?: string;
  category?: string;
  notes?: string;
  tags?: string[];
}

export function addPost(input: AddPostInput): Post {
  const db = getDb();
  const id = nanoid(12);

  db.prepare(
    `INSERT INTO posts (id, url, author, author_name, content, media_urls, thread, tweet_date, category, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, input.url, input.author, input.author_name ?? null,
    input.content,
    input.media_urls ? JSON.stringify(input.media_urls) : null,
    input.thread ? JSON.stringify(input.thread) : null,
    input.tweet_date ?? null, input.category ?? null, input.notes ?? null
  );

  if (input.tags && input.tags.length > 0) {
    for (const tagName of input.tags) {
      const tagId = getOrCreateTag(tagName);
      db.prepare(`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`).run(id, tagId);
    }
  }

  return getPost(id)!;
}

export function getPost(id: string): Post | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return hydratePost(row);
}

export function getPostByUrl(url: string): Post | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM posts WHERE url = ?`).get(url) as any;
  if (!row) return null;
  return hydratePost(row);
}

export function listPosts(opts?: { tag?: string; limit?: number; offset?: number }): Post[] {
  const db = getDb();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let rows: any[];
  if (opts?.tag) {
    rows = db.prepare(
      `SELECT p.* FROM posts p
       JOIN post_tags pt ON pt.post_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE t.name = ?
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
    ).all(opts.tag.toLowerCase(), limit, offset);
  } else {
    rows = db.prepare(`SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  }

  return rows.map(hydratePost);
}

export function searchPosts(query: string, limit = 20): Post[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT p.* FROM posts p
     JOIN posts_fts fts ON fts.rowid = p.rowid
     WHERE posts_fts MATCH ?
     ORDER BY rank LIMIT ?`
  ).all(query, limit);
  return (rows as any[]).map(hydratePost);
}

export function deletePost(id: string): boolean {
  const db = getDb();
  return db.prepare(`DELETE FROM posts WHERE id = ?`).run(id).changes > 0;
}

export function updatePost(id: string, updates: { notes?: string; category?: string; tags?: string[] }): Post | null {
  const db = getDb();
  if (updates.notes !== undefined) db.prepare(`UPDATE posts SET notes = ? WHERE id = ?`).run(updates.notes, id);
  if (updates.category !== undefined) db.prepare(`UPDATE posts SET category = ? WHERE id = ?`).run(updates.category, id);
  if (updates.tags !== undefined) {
    db.prepare(`DELETE FROM post_tags WHERE post_id = ?`).run(id);
    for (const tagName of updates.tags) {
      const tagId = getOrCreateTag(tagName);
      db.prepare(`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`).run(id, tagId);
    }
  }
  return getPost(id);
}

// ─── Tags ───────────────────────────────────────────────

function getOrCreateTag(name: string): string {
  const db = getDb();
  const normalized = name.toLowerCase().replace(/^#/, "");
  const existing = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(normalized) as any;
  if (existing) return existing.id;
  const id = nanoid(8);
  db.prepare(`INSERT INTO tags (id, name) VALUES (?, ?)`).run(id, normalized);
  return id;
}

export function listTags(): Tag[] {
  const db = getDb();
  return db.prepare(
    `SELECT t.id, t.name, COUNT(pt.post_id) as count
     FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id
     GROUP BY t.id ORDER BY count DESC`
  ).all() as Tag[];
}

// ─── Connections ────────────────────────────────────────

export function addConnection(sourceId: string, targetId: string, label?: string): string {
  const db = getDb();
  const id = nanoid(10);
  db.prepare(`INSERT OR IGNORE INTO connections (id, source_id, target_id, label) VALUES (?, ?, ?, ?)`).run(id, sourceId, targetId, label ?? null);
  return id;
}

export function removeConnection(id: string): boolean {
  const db = getDb();
  return db.prepare(`DELETE FROM connections WHERE id = ?`).run(id).changes > 0;
}

// ─── Graph Data ─────────────────────────────────────────

export function getGraphData(filterTag?: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const db = getDb();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  let posts: any[];
  if (filterTag) {
    posts = db.prepare(
      `SELECT p.* FROM posts p JOIN post_tags pt ON pt.post_id = p.id JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?`
    ).all(filterTag.toLowerCase());
  } else {
    posts = db.prepare(`SELECT * FROM posts`).all();
  }

  for (const p of posts) {
    nodes.push({ id: p.id, label: p.content.substring(0, 80), type: "post", author: p.author, category: p.category, url: p.url, size: 1 });
    nodeIds.add(p.id);
  }

  const postIds = posts.map((p: any) => p.id);
  if (postIds.length > 0) {
    const placeholders = postIds.map(() => "?").join(",");
    const tagRows = db.prepare(`SELECT DISTINCT t.id, t.name, COUNT(pt.post_id) as cnt FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id IN (${placeholders}) GROUP BY t.id`).all(...postIds) as any[];
    for (const t of tagRows) { nodes.push({ id: `tag:${t.id}`, label: `#${t.name}`, type: "tag", size: t.cnt }); nodeIds.add(`tag:${t.id}`); }
    const ptRows = db.prepare(`SELECT pt.post_id, pt.tag_id FROM post_tags pt WHERE pt.post_id IN (${placeholders})`).all(...postIds) as any[];
    for (const pt of ptRows) { edges.push({ source: pt.post_id, target: `tag:${pt.tag_id}`, type: "tag" }); }
    const connRows = db.prepare(`SELECT * FROM connections WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`).all(...postIds, ...postIds) as any[];
    for (const c of connRows) { if (nodeIds.has(c.source_id) && nodeIds.has(c.target_id)) { edges.push({ source: c.source_id, target: c.target_id, type: "connection", label: c.label }); } }
  }

  const edgeCount = new Map<string, number>();
  for (const e of edges) { edgeCount.set(e.source, (edgeCount.get(e.source) || 0) + 1); edgeCount.set(e.target, (edgeCount.get(e.target) || 0) + 1); }
  for (const node of nodes) { if (node.type === "post") node.size = Math.max(1, edgeCount.get(node.id) || 1); }

  return { nodes, edges };
}

// ─── Stats ──────────────────────────────────────────────

export function getStats() {
  const db = getDb();
  const posts = (db.prepare(`SELECT COUNT(*) as c FROM posts`).get() as any).c;
  const tags = (db.prepare(`SELECT COUNT(*) as c FROM tags`).get() as any).c;
  const connections = (db.prepare(`SELECT COUNT(*) as c FROM connections`).get() as any).c;
  const latest = db.prepare(`SELECT created_at FROM posts ORDER BY created_at DESC LIMIT 1`).get() as any;
  return { posts, tags, connections, lastAdded: latest?.created_at ?? null };
}

// ─── Helpers ────────────────────────────────────────────

function hydratePost(row: any): Post {
  const db = getDb();
  const tagRows = db.prepare(`SELECT t.name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ?`).all(row.id) as any[];
  return {
    id: row.id, url: row.url, author: row.author, author_name: row.author_name,
    content: row.content,
    media_urls: row.media_urls ? JSON.parse(row.media_urls) : null,
    thread: row.thread ? JSON.parse(row.thread) : null,
    tweet_date: row.tweet_date, category: row.category, notes: row.notes,
    created_at: row.created_at, tags: tagRows.map((t: any) => t.name),
  };
}
