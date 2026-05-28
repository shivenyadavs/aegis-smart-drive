import express from 'express';
import { semanticSearch } from '../controllers/searchController.js';

const router = express.Router();

router.get('/', semanticSearch);

export default router;
