import { ollama } from '../config/ollama.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const vectorStorePath = './data/vector-store.json';

// Simple mathematical Cosine Similarity: Dot Product / (Norm A * Norm B)
function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Modular Vector Store Interface
 * Persists vectors locally in a JSON file, providing a clean upgrade path to LanceDB/ChromaDB.
 */
class LocalVectorStore {
  constructor() {
    this.provider = process.env.VECTOR_DB_PROVIDER || 'local-json';
    this.vectors = []; // Array of { id, vector, metadata }
    
    // Ensure data folder exists
    const dir = path.dirname(vectorStorePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.loadStore();
  }

  /**
   * Loads existing index embeddings from local file
   */
  loadStore() {
    try {
      if (fs.existsSync(vectorStorePath)) {
        const raw = fs.readFileSync(vectorStorePath, 'utf8');
        this.vectors = JSON.parse(raw);
        console.log(`✔ [VectorStore] Loaded ${this.vectors.length} local embeddings from: ${vectorStorePath}`);
      } else {
        this.vectors = [];
        this.saveStore();
        console.log(`[VectorStore] Initialized clean local vector database at: ${vectorStorePath}`);
      }
    } catch (err) {
      console.error('✖ [VectorStore] Failed to load vector store file:', err.message);
      this.vectors = [];
    }
  }

  /**
   * Persists vectors locally to disk
   */
  saveStore() {
    try {
      fs.writeFileSync(vectorStorePath, JSON.stringify(this.vectors, null, 2), 'utf8');
    } catch (err) {
      console.error('✖ [VectorStore] Failed to save vector store:', err.message);
    }
  }

  /**
   * Insert/Update vector in our local database
   */
  async upsert(id, vector, metadata) {
    const idx = this.vectors.findIndex(v => v.id === id);
    if (idx !== -1) {
      this.vectors[idx] = { id, vector, metadata };
    } else {
      this.vectors.push({ id, vector, metadata });
    }
    this.saveStore();
  }

  /**
   * Perform Cosine Similarity vector matching on stored embeddings
   */
  async query(queryVector, limit = 5) {
    if (this.vectors.length === 0) return [];

    console.log(`[VectorStore] Calculating Cosine Similarity across ${this.vectors.length} staged text segments...`);

    const scoredResults = this.vectors.map(item => {
      const score = calculateCosineSimilarity(queryVector, item.vector);
      return {
        fileId: item.metadata.fileId,
        filename: item.metadata.filename,
        mimeType: item.metadata.mimeType,
        textSnippet: item.metadata.text,
        score: score
      };
    });

    return scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Delete all vector segments associated with a file ID
   */
  async delete(fileId) {
    this.vectors = this.vectors.filter(v => v.metadata.fileId !== fileId);
    this.saveStore();
    console.log(`✔ [VectorStore] Cleared all indexing vectors associated with file: ${fileId}`);
  }

  /**
   * Computes the average document vector representation for a set of chunk vectors
   */
  calculateAverageVector(vectorsList) {
    if (!vectorsList || vectorsList.length === 0) return [];
    const dimensions = vectorsList[0].length;
    const avgVector = new Array(dimensions).fill(0.0);
    
    for (let i = 0; i < vectorsList.length; i++) {
      for (let d = 0; d < dimensions; d++) {
        avgVector[d] += vectorsList[i][d];
      }
    }
    
    for (let d = 0; d < dimensions; d++) {
      avgVector[d] /= vectorsList.length;
    }
    
    return avgVector;
  }

  /**
   * Compares a newly generated document array of chunk embeddings against 
   * existing approved documents to find potential semantic duplicates.
   */
  findSemanticDuplicate(fileId, newChunksList) {
    if (this.vectors.length === 0 || !newChunksList || newChunksList.length === 0) {
      return { isDuplicate: false };
    }

    // 1. Calculate average vector for the new file chunks
    const newVectors = newChunksList.map(c => c.vector);
    const newAvgVector = this.calculateAverageVector(newVectors);

    // 2. Group existing approved vectors by their file ID
    // Exclude the current staged file's own vectors
    const approvedVectors = this.vectors.filter(v => v.metadata.fileId !== fileId);
    if (approvedVectors.length === 0) return { isDuplicate: false };

    const grouped = {};
    approvedVectors.forEach(v => {
      const fId = v.metadata.fileId;
      if (!grouped[fId]) grouped[fId] = [];
      grouped[fId].push(v);
    });

    let bestMatchFileId = null;
    let bestMatchFilename = '';
    let maxSimilarityScore = 0.0;

    // 3. Compare the new average vector against the average vector of each document group
    for (const [existingFileId, chunks] of Object.entries(grouped)) {
      const existingVectors = chunks.map(c => c.vector);
      const existingAvgVector = this.calculateAverageVector(existingVectors);
      
      const similarity = calculateCosineSimilarity(newAvgVector, existingAvgVector);
      
      if (similarity > maxSimilarityScore) {
        maxSimilarityScore = similarity;
        bestMatchFileId = existingFileId;
        bestMatchFilename = chunks[0].metadata.filename;
      }
    }

    // Threshold set to 90% semantic similarity to qualify as a "Semantic Duplicate"
    const threshold = 0.90;
    if (maxSimilarityScore >= threshold) {
      return {
        isDuplicate: true,
        score: maxSimilarityScore,
        duplicateFileId: bestMatchFileId,
        duplicateFilename: bestMatchFilename
      };
    }

    return { isDuplicate: false };
  }
}

// Global Vector DB instance
export const vectorStore = new LocalVectorStore();

/**
 * Generate a single local embedding vector from text using Ollama
 */
export async function getEmbedding(text) {
  try {
    const response = await ollama.embeddings({
      model: embedModel,
      prompt: text
    });
    return response.embedding;
  } catch (error) {
    console.error('✖ Error generating embedding in Ollama:', error.message);
    throw error;
  }
}

/**
 * Cleanly breaks down parsed document text and indexes it in our vector store.
 * Returns the generated chunk list with their embeddings for duplicate comparisons.
 */
export async function indexFileContent(fileId, textContent, metadata = {}) {
  if (!textContent || textContent.trim().length === 0) {
    console.warn(`⚠️ [Indexer] Skipping semantic indexing for ${fileId}: Document contains no text.`);
    return [];
  }

  const chunks = chunkText(textContent, 600, 150);
  console.log(`[Indexer] Splitting file "${metadata.filename}" into ${chunks.length} segments for semantic search...`);

  const indexedChunks = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const chunkId = `${fileId}-chunk-${i}`;
    
    console.log(`[Indexer] Generating vector embedding chunk [${i + 1}/${chunks.length}] in Ollama...`);
    const embedding = await getEmbedding(chunkText);
    console.log(`✔ [Indexer] Embedding created successfully [${i + 1}/${chunks.length}]. Vector dimension: ${embedding.length}`);

    await vectorStore.upsert(chunkId, embedding, {
      fileId,
      chunkIndex: i,
      text: chunkText,
      ...metadata
    });

    indexedChunks.push({
      id: chunkId,
      vector: embedding,
      text: chunkText
    });
  }

  console.log(`✔ [Indexer] Indexing completion success: Filed ${chunks.length} vectors for "${metadata.filename}".`);
  return indexedChunks;
}

/**
 * Word-level sliding chunker helper
 */
function chunkText(text, size = 600, overlap = 150) {
  const words = text.split(/\s+/);
  const chunks = [];
  
  if (words.length <= size) {
    return [text];
  }
  
  for (let i = 0; i < words.length; i += (size - overlap)) {
    const chunkWords = words.slice(i, i + size);
    if (chunkWords.length > 0) {
      chunks.push(chunkWords.join(' '));
    }
    if (i + size >= words.length) break;
  }
  
  return chunks;
}

/**
 * Self-healing Startup Indexer:
 * Sweeps through SQLite database, identifies approved files missing vector models,
 * and automatically regenerates their embeddings in the background.
 */
export async function reindexMissingApprovedFiles(getDb) {
  try {
    const db = await getDb();
    const approvedFiles = await db.all("SELECT * FROM files WHERE status = 'approved'");
    
    let reindexedCount = 0;
    
    for (const file of approvedFiles) {
      const hasVectors = vectorStore.vectors.some(v => v.metadata.fileId === file.id);
      
      if (!hasVectors) {
        console.log(`\n[Auto-Reindex] Found approved file missing embeddings: "${file.filename}"`);
        console.log(`[Auto-Reindex] Triggering background vector generation...`);
        
        await indexFileContent(file.id, file.content_extracted, {
          filename: file.filename,
          mimeType: file.mime_type
        });
        reindexedCount++;
      }
    }
    
    if (reindexedCount > 0) {
      console.log(`✔ [Auto-Reindex] Self-healing completed. Reindexed ${reindexedCount} files.\n`);
    }
  } catch (err) {
    console.error('✖ [Auto-Reindex] Background reindexing failed:', err.message);
  }
}
