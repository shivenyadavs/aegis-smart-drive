import { getDb } from '../config/db.js';
import path from 'path';

/**
 * Lists the directory tree representing all active, AI-categorized folders.
 */
export async function getFolderStructure(req, res) {
  try {
    const db = await getDb();
    
    // Select all approved files and group their folders
    const folders = await db.all(`
      SELECT DISTINCT s.suggested_folder
      FROM folder_suggestions s
      INNER JOIN files f ON f.id = s.file_id
      WHERE f.status = 'approved'
    `);

    const folderList = folders.map(f => f.suggested_folder);

    // Build a neat flat-to-tree response
    res.json({
      folders: folderList,
      count: folderList.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Returns all approved files inside a specific categorized folder.
 */
export async function getFilesInFolder(req, res) {
  const { folderName } = req.params;

  try {
    const db = await getDb();
    const files = await db.all(
      `SELECT f.* 
       FROM files f
       INNER JOIN folder_suggestions s ON f.id = s.file_id
       WHERE f.status = 'approved' AND s.suggested_folder = ?`,
      [folderName]
    );

    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
