import crypto from 'crypto';
import path from 'path';
import { getDb } from '../config/db.js';
import { extractText } from '../services/parserService.js';
import { analyzeContentAndCategorize } from '../services/aiService.js';
import { indexFileContent, vectorStore } from '../services/embeddingService.js';
import { approveAndMoveFile, deleteFileFromDisk } from '../services/storageService.js';

/**
 * Handle a staged file upload.
 * Validates, parses raw text, generates local semantic embeddings, 
 * runs automated semantic duplicate scans, queries local Llama 3, and stores metadata in SQLite.
 */
export async function stageUploadedFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { originalname, mimetype, size, path: tempPath } = req.file;
    const fileId = crypto.randomUUID();

    console.log(`\n--- 🚀 Starting File Stage Pipeline for: "${originalname}" ---`);

    // 1. Extract content immediately using parserService
    let extractedText = '';
    try {
      extractedText = await extractText(tempPath, mimetype);
      console.log(`✔ [Staging] Parsing success: Extracted ${extractedText.trim().length} characters from: "${originalname}"`);
    } catch (parseErr) {
      console.warn(`✖ [Staging] Raw text extraction failed: ${parseErr.message}`);
      return res.status(500).json({ error: `Parsing failed: ${parseErr.message}` });
    }

    // 2. Generate local embeddings, index automatically, and scan for semantic duplicates
    let dupJson = null;
    try {
      console.log(`[Staging] Embedding creation: Generating vectors via nomic-embed-text...`);
      const indexedChunks = await indexFileContent(fileId, extractedText, {
        filename: originalname,
        mimeType: mimetype
      });
      
      // Perform automated document-level semantic duplication check against approved files
      const dupWarning = vectorStore.findSemanticDuplicate(fileId, indexedChunks);
      if (dupWarning.isDuplicate) {
        dupJson = JSON.stringify(dupWarning);
        console.warn(`⚠️ [Staging] Semantic Duplicate Warning: "${originalname}" matches "${dupWarning.duplicateFilename}" by ${Math.round(dupWarning.score * 100)}%`);
      }
    } catch (embedErr) {
      console.warn(`✖ [Staging] Semantic indexing failed: ${embedErr.message}`);
    }

    // 3. Generate AI Category suggestions based purely on text (ignoring filename)
    console.log('[Staging] Reasoning: Querying Llama 3 for folder categorization...');
    const aiSuggestion = await analyzeContentAndCategorize(extractedText);
    console.log(`✔ [Staging] AI Suggestion: "${aiSuggestion.folder}" (Confidence: ${Math.round(aiSuggestion.confidence * 100)}%)`);

    // 4. Save staged file metadata inside SQLite (including duplicate JSON warnings)
    const db = await getDb();
    await db.run(
      `INSERT INTO files (id, filename, original_name, mime_type, size, stage_path, content_extracted, status, duplicate_warning)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'staged', ?)`,
      [fileId, originalname, originalname, mimetype, size, tempPath, extractedText, dupJson]
    );
    console.log('✔ [Staging] Logged file transaction in SQLite files metadata table.');

    // Save AI suggestion in suggested table
    const suggestionId = crypto.randomUUID();
    await db.run(
      `INSERT INTO folder_suggestions (id, file_id, suggested_folder, reason, confidence, approved)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [suggestionId, fileId, aiSuggestion.folder, aiSuggestion.reason, aiSuggestion.confidence]
    );
    console.log('✔ [Staging] Folder proposal saved.');
    console.log(`--- 🏁 Stage Pipeline Completed successfully for: "${originalname}" ---\n`);

    res.status(201).json({
      message: 'File staged and indexed successfully. Awaiting user approval to relocate.',
      file: {
        id: fileId,
        filename: originalname,
        size,
        mimeType: mimetype,
        suggestion: aiSuggestion,
        duplicateWarning: dupJson ? JSON.parse(dupJson) : null
      }
    });
  } catch (error) {
    console.error('✖ Critical staging upload failure:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get all staged and active files from the SQLite DB.
 */
export async function getFiles(req, res) {
  try {
    const db = await getDb();
    const files = await db.all(`
      SELECT f.*, s.suggested_folder, s.reason, s.confidence, s.approved as is_approved
      FROM files f
      LEFT JOIN folder_suggestions s ON f.id = s.file_id
      ORDER BY f.created_at DESC
    `);
    
    // Parse the JSON warning string before returning to client
    const parsedFiles = files.map(file => ({
      ...file,
      duplicate_warning: file.duplicate_warning ? JSON.parse(file.duplicate_warning) : null
    }));

    res.json(parsedFiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Approve AI's suggested folder placement.
 * Moves the file to the final directory structure on disk.
 * Supports action: 'overwrite' (purges existing duplicate) and action: 'version' (saves alongside).
 */
export async function approveSuggestion(req, res) {
  const { id } = req.params;
  const { action } = req.body; // 'overwrite' or 'version' / undefined (default)

  try {
    const db = await getDb();
    
    // Retrieve file and suggestion details
    const file = await db.get('SELECT * FROM files WHERE id = ?', [id]);
    if (!file) {
      return res.status(404).json({ error: 'Staged file not found.' });
    }

    if (file.status !== 'staged') {
      return res.status(400).json({ error: `File is already in status: ${file.status}` });
    }

    const suggestion = await db.get('SELECT * FROM folder_suggestions WHERE file_id = ?', [id]);
    if (!suggestion) {
      return res.status(404).json({ error: 'Folder suggestion metadata missing.' });
    }

    // 1. Handle Active Overwrite Action if requested & confirmed duplicate exists
    if (action === 'overwrite' && file.duplicate_warning) {
      try {
        const warning = JSON.parse(file.duplicate_warning);
        console.log(`\n[Approve Overwrite] Purging existing duplicate metadata: ${warning.duplicateFileId}...`);
        
        const dupFile = await db.get('SELECT * FROM files WHERE id = ?', [warning.duplicateFileId]);
        if (dupFile) {
          // Delete physical approved file from disk
          const targetPath = dupFile.final_path || dupFile.stage_path;
          await deleteFileFromDisk(targetPath);

          // Clear indexing vectors associated with the old file ID
          await vectorStore.delete(warning.duplicateFileId);

          // Delete from files table (cascades folder_suggestions deletion)
          await db.run('DELETE FROM files WHERE id = ?', [warning.duplicateFileId]);
          console.log(`✔ [Approve Overwrite] Purged existing duplicate "${dupFile.filename}" successfully.\n`);
        }
      } catch (err) {
        console.warn(`✖ [Approve Overwrite] Failed to sweep duplicate: ${err.message}`);
      }
    }

    // 2. Move file on disk to actual folder tree
    const finalDestPath = await approveAndMoveFile(
      file.stage_path,
      suggestion.suggested_folder,
      file.filename
    );

    // 3. Double-assure text vectors are generated and indexed (handles cases where Ollama was offline on upload)
    try {
      console.log(`[Approve] Staging: Ensuring vector embeddings are compiled in local store...`);
      await indexFileContent(id, file.content_extracted, {
        filename: file.filename,
        mimeType: file.mime_type
      });
    } catch (embedErr) {
      console.warn(`⚠️ [Approve] Embedding generation was skipped/failed on approval: ${embedErr.message}`);
    }

    // 4. Update statuses in SQLite (sets warning to null since old duplicate is handled or ignored now)
    await db.run(
      `UPDATE files SET status = 'approved', final_path = ?, duplicate_warning = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [finalDestPath, id]
    );

    await db.run(
      `UPDATE folder_suggestions SET approved = 1 WHERE file_id = ?`,
      [id]
    );

    console.log(`✔ [Approve] Staged file "${file.filename}" relocated to folder: "${suggestion.suggested_folder}"`);

    res.json({
      message: action === 'overwrite' 
        ? `File approved. Existing duplicate was overwritten and replaced in "${suggestion.suggested_folder}".`
        : `File approved. Saved alongside existing files inside "${suggestion.suggested_folder}".`,
      finalPath: finalDestPath
    });
  } catch (error) {
    console.error('✖ Approving folder suggestion failed:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Reject the AI folder proposal.
 * Deletes file from staging disk and cascades deletes to vector indexes.
 */
export async function rejectSuggestion(req, res) {
  const { id } = req.params;

  try {
    const db = await getDb();
    const file = await db.get('SELECT * FROM files WHERE id = ?', [id]);
    if (!file) {
      return res.status(404).json({ error: 'Staged file not found.' });
    }

    // 1. Delete staged file on disk
    await deleteFileFromDisk(file.stage_path);

    // 2. Cascade remove indexing vectors from our pluggable index store
    await vectorStore.delete(id);

    // 3. Remove entries from database (cascade deletes suggestion)
    await db.run('DELETE FROM files WHERE id = ?', [id]);

    console.log(`✔ [Reject] Staged file "${file.filename}" rejected and removed from system.`);

    res.json({ message: 'Staged file has been rejected and deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
