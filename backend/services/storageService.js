import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const stageDir = process.env.STAGE_DIR || './data/staging';
const uploadDir = process.env.UPLOAD_DIR || './data/uploads';

// Initialize and ensure folders exist
export async function initializeStorage() {
  await fs.mkdir(stageDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });
  console.log('✔ Local staging and uploads storage directories initialized.');
}

/**
 * Move a staged file to its final, AI-categorized folder upon user approval.
 * Organizes files into folders intelligently on the local disk.
 */
export async function approveAndMoveFile(tempStagePath, finalFolderName, filename) {
  // Organize folders inside the main archive uploadDir
  const targetFolder = path.join(uploadDir, finalFolderName);
  
  // Ensure the AI target directory exists locally
  await fs.mkdir(targetFolder, { recursive: true });

  const finalDestPath = path.join(targetFolder, filename);

  // If file already exists in final folder, append unique suffix to avoid overwriting
  let safeDestPath = finalDestPath;
  let counter = 1;
  const parsedPath = path.parse(finalDestPath);
  
  while (existsSync(safeDestPath)) {
    safeDestPath = path.join(targetFolder, `${parsedPath.name}_${counter}${parsedPath.ext}`);
    counter++;
  }

  // Perform safe local move
  await fs.rename(tempStagePath, safeDestPath);
  console.log(`[Storage] Moved staged file ${path.basename(tempStagePath)} -> ${safeDestPath}`);
  
  return safeDestPath;
}

/**
 * Delete a file from local disk (used for rejecting suggestions, cleanup, or deletions)
 */
export async function deleteFileFromDisk(filePath) {
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
    console.log(`[Storage] Deleted file from disk: ${filePath}`);
    return true;
  }
  return false;
}
