import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { 
  stageUploadedFile, 
  getFiles, 
  approveSuggestion, 
  rejectSuggestion 
} from '../controllers/fileController.js';

dotenv.config();

const router = express.Router();
const tempStageDir = process.env.STAGE_DIR || './data/staging';

// Ensure staging directory exists
if (!fs.existsSync(tempStageDir)) {
  fs.mkdirSync(tempStageDir, { recursive: true });
}

// 1. Configure Multer Staging Engine preserving extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempStageDir);
  },
  filename: (req, file, cb) => {
    const fileId = crypto.randomUUID();
    const ext = path.extname(file.originalname).toLowerCase();
    // Save file with a unique ID but preserve its extension in the staging folder
    cb(null, `${fileId}${ext}`);
  }
});

// 2. Validate Mimetypes and File Extensions
const allowedExtensions = ['.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg'];
const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg'
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  const isExtAllowed = allowedExtensions.includes(ext);
  const isMimeAllowed = allowedMimeTypes.includes(mime);

  if (isExtAllowed && isMimeAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: "${ext}". Supported types are: PDF, DOCX, TXT, PNG, JPG.`), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // Limit uploads to 10MB
  }
});

// Wrapper middleware to capture Multer file filter/size errors cleanly
const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific error (e.g. file size exceeded)
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      // Custom file filter rejection error
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

// 3. Define Staging Endpoints
router.post('/upload', uploadMiddleware, stageUploadedFile);
router.get('/', getFiles);
router.post('/:id/approve', approveSuggestion);
router.post('/:id/reject', rejectSuggestion);

export default router;
