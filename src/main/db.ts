import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import log from 'electron-log/main'

/**
 * Persistencia local de transcripciones (Fase 8).
 *
 * Ubicación: app.getPath('userData')/cleevoice.db
 *   macOS: ~/Library/Application Support/cleevoice/cleevoice.db
 *
 * Schema mínimo del roadmap. Crece en fases si se necesitan más metadatos.
 */

let db: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transcriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  app_name TEXT,
  raw_text TEXT NOT NULL,
  cleaned_text TEXT,
  engine TEXT NOT NULL,
  model TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es'
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at
  ON transcriptions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcriptions_app
  ON transcriptions(app_name);

CREATE VIRTUAL TABLE IF NOT EXISTS transcriptions_fts
  USING fts5(raw_text, cleaned_text, content='transcriptions', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS transcriptions_ai AFTER INSERT ON transcriptions BEGIN
  INSERT INTO transcriptions_fts(rowid, raw_text, cleaned_text)
  VALUES (new.id, new.raw_text, new.cleaned_text);
END;

CREATE TRIGGER IF NOT EXISTS transcriptions_ad AFTER DELETE ON transcriptions BEGIN
  INSERT INTO transcriptions_fts(transcriptions_fts, rowid, raw_text, cleaned_text)
  VALUES('delete', old.id, old.raw_text, old.cleaned_text);
END;
`

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = path.join(app.getPath('userData'), 'cleevoice.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  log.info(`SQLite abierto: ${dbPath}`)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TranscriptionRow {
  id: number
  created_at: number
  duration_ms: number
  app_name: string | null
  raw_text: string
  cleaned_text: string | null
  engine: string
  model: string
  language: string
}

export interface NewTranscription {
  durationMs: number
  appName: string | null
  rawText: string
  cleanedText: string | null
  engine: string
  model: string
  language: string
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function saveTranscription(t: NewTranscription): number {
  const stmt = getDb().prepare<NewTranscription & { createdAt: number }>(
    `INSERT INTO transcriptions
       (created_at, duration_ms, app_name, raw_text, cleaned_text, engine, model, language)
     VALUES (@createdAt, @durationMs, @appName, @rawText, @cleanedText, @engine, @model, @language)`
  )
  const info = stmt.run({ ...t, createdAt: Date.now() })
  return Number(info.lastInsertRowid)
}

export interface ListOpts {
  limit?: number
  offset?: number
  search?: string
}

export function listTranscriptions(opts: ListOpts = {}): TranscriptionRow[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500)
  const offset = Math.max(opts.offset ?? 0, 0)
  const search = (opts.search ?? '').trim()

  if (!search) {
    return getDb()
      .prepare<[number, number]>(
        'SELECT * FROM transcriptions ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .all(limit, offset) as TranscriptionRow[]
  }

  // FTS5 escape mínimo: encerramos en comillas dobles para evitar operadores.
  const safe = '"' + search.replace(/"/g, '""') + '"'
  return getDb()
    .prepare<[string, number, number]>(
      `SELECT t.*
       FROM transcriptions_fts f
       JOIN transcriptions t ON t.id = f.rowid
       WHERE transcriptions_fts MATCH ?
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(safe, limit, offset) as TranscriptionRow[]
}

export function deleteTranscription(id: number): boolean {
  const r = getDb().prepare('DELETE FROM transcriptions WHERE id = ?').run(id)
  return r.changes > 0
}

export function clearTranscriptions(): number {
  const r = getDb().prepare('DELETE FROM transcriptions').run()
  // FTS index queda re-sincronizado por los triggers; rebuild explícito por las dudas.
  getDb().exec(
    `INSERT INTO transcriptions_fts(transcriptions_fts) VALUES('rebuild');`
  )
  return r.changes
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface Stats {
  totalCount: number
  totalWords: number
  totalSeconds: number
  /** Estimación: típico 40 wpm escribiendo vs ~150 wpm hablando. */
  estimatedSavedMinutes: number
}

export function getStats(): Stats {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS totalCount,
         COALESCE(SUM(duration_ms), 0) AS totalMs,
         COALESCE(SUM(LENGTH(COALESCE(cleaned_text, raw_text)) -
                       LENGTH(REPLACE(COALESCE(cleaned_text, raw_text), ' ', '')) + 1), 0) AS totalWordsApprox
       FROM transcriptions
       WHERE LENGTH(COALESCE(cleaned_text, raw_text)) > 0`
    )
    .get() as { totalCount: number; totalMs: number; totalWordsApprox: number }
  const wpmTyped = 40
  const estimatedSavedMinutes = Math.round((row.totalWordsApprox / wpmTyped) * 10) / 10
  return {
    totalCount: row.totalCount,
    totalWords: row.totalWordsApprox,
    totalSeconds: Math.round(row.totalMs / 1000),
    estimatedSavedMinutes
  }
}
