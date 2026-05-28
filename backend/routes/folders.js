import express from 'express';
import { getFolderStructure, getFilesInFolder } from '../controllers/folderController.js';

const router = express.Router();

router.get('/', getFolderStructure);
router.get('/:folderName/files', getFilesInFolder);

export default router;
