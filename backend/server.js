import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { getDb } from './config/db.js';
import { validateAISystem, pullModelIfMissing } from './config/ollama.js';
import { initializeStorage } from './services/storageService.js';
import { reindexMissingApprovedFiles } from './services/embeddingService.js';

// Load routes
import fileRouter from './routes/files.js';
import searchRouter from './routes/search.js';
import folderRouter from './routes/folders.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Mount Modular Routes
app.use('/api/files', fileRouter);
app.use('/api/search', searchRouter);
app.use('/api/folders', folderRouter);

// Global Health Check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const aiSystemStatus = await validateAISystem();
    res.json({
      status: 'healthy',
      database: 'connected',
      aiSystem: aiSystemStatus
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Bootstrapping the local system
async function startServer() {
  try {
    console.log('⚡ Initializing AI Smart Drive local server...');
    
    // 1. Initialize SQLite Database
    await getDb();

    // 2. Initialize disk directories (uploads/staging)
    await initializeStorage();

    // 3. Verify local AI capabilities
    const systemStatus = await validateAISystem();
    if (systemStatus.status === 'offline') {
      console.warn('\n⚠️ WARNING: Local Ollama service is currently OFFLINE.');
      console.warn('AI categorization and semantic search will fallback to manual actions until Ollama is launched.\n');
    } else {
      console.log('✔ Local Ollama service detected.');
      
      const llmModel = process.env.OLLAMA_LLM_MODEL || 'llama3';
      const embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
      
      // We run these asynchronously so the server starts instantly without waiting
      pullModelIfMissing(llmModel)
        .then(() => pullModelIfMissing(embedModel))
        .then(() => {
          // Ollama models verified, run background auto-reindexing of missing approved files!
          reindexMissingApprovedFiles(getDb);
        });
    }


    app.listen(PORT, () => {
      console.log(`\n🚀 Smart Drive Server successfully running locally on: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('✖ Critical server startup failure:', error.message);
    process.exit(1);
  }
}

startServer();
