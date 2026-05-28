import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DATABASE_FILE || './data/smart-drive.db';

// Ensure data folder exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

export async function getDb() {
  if (db) return db;

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // Initialize DB tables
  await initializeSchema(db);

  return db;
}

async function initializeSchema(database) {
  // 1. Files staging & metadata table (includes duplicate_warning column)
  await database.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      stage_path TEXT NOT NULL,
      final_path TEXT,
      content_extracted TEXT,
      status TEXT CHECK(status IN ('staged', 'approved', 'rejected')) DEFAULT 'staged',
      duplicate_warning TEXT, -- Stores JSON of semantic duplicates matches
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Run schema migration: check if duplicate_warning column already exists in older setups
  try {
    const tableInfo = await database.all("PRAGMA table_info(files)");
    const hasDuplicateCol = tableInfo.some(col => col.name === 'duplicate_warning');
    if (!hasDuplicateCol) {
      console.log('[SQLite Migration] Adding column "duplicate_warning" to files table...');
      await database.exec("ALTER TABLE files ADD COLUMN duplicate_warning TEXT");
      console.log('✔ [SQLite Migration] Migration completed successfully.');
    }
  } catch (err) {
    console.warn('[SQLite Migration] Column check warning:', err.message);
  }

  // 2. Folder recommendations by AI
  await database.exec(`
    CREATE TABLE IF NOT EXISTS folder_suggestions (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      suggested_folder TEXT NOT NULL,
      reason TEXT,
      confidence REAL DEFAULT 0.0,
      approved INTEGER DEFAULT 0, -- 0 = pending/rejected, 1 = approved
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
    )
  `);

  // 3. Simple settings or key-value store for Smart Drive config
  await database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  console.log('✔ SQLite Database schema initialized.');
}
