import { getEmbedding, vectorStore } from '../services/embeddingService.js';
import { getDb } from '../config/db.js';
import { ollama } from '../config/ollama.js';
import dotenv from 'dotenv';

dotenv.config();

const llmModel = process.env.OLLAMA_LLM_MODEL || 'llama3';

/**
 * Synthesizes a natural language answer from local Llama 3 using retrieved document snippets.
 */
async function generateRAGAnswer(question, matchedChunks) {
  if (!matchedChunks || matchedChunks.length === 0) return null;

  // INCREASE CONTEXT SLICE TO TOP 5: Ensures lower-ranking highly-specific hits are visible to LLM
  const context = matchedChunks
    .slice(0, 5)
    .map((chunk, idx) => `[Document ${idx + 1}: ${chunk.filename}]\n${chunk.textSnippet}`)
    .join('\n\n');

  const prompt = `
You are Aegis, the highly intelligent local AI Smart Drive Assistant.
Your task is to answer the user's question using the retrieved document contexts below.

INSTRUCTIONS:
1. Analyze the document context carefully to answer: "${question}"
2. Connect logical synonyms (e.g. if the context says "Sold By: Sagar Computers", then the seller is "Sagar Computers").
3. Be highly direct and concise (1-2 sentences). Do not include unnecessary pleasantries or details.
4. If you absolutely cannot find any factual relation to the question in the context, say: "Based on your local drive documents, I couldn't find an answer to this question."

---
RETRIEVED DOCUMENT CONTEXTS:
${context}
---

Answer:
`;

  try {
    console.log(`[RAG] Generating AI Synthesized Answer using local Llama 3 model: "${llmModel}"...`);
    const response = await ollama.generate({
      model: llmModel,
      prompt: prompt,
      options: {
        temperature: 0.1 // Keep temperature extremely low for maximum factual precision
      }
    });
    
    console.log(`✔ [RAG] AI synthesized answer successfully.`);
    return response.response.trim();
  } catch (err) {
    console.warn(`✖ [RAG] Failed to synthesize answer via Llama 3: ${err.message}`);
    return null;
  }
}

/**
 * Perform a local semantic search over indexed file contents.
 * Integrates local Llama 3 RAG Q&A synthesis on query matches.
 * Uses Hybrid Search (Semantic + Exact Keyword Boosting).
 */
export async function semanticSearch(req, res) {
  const { query } = req.query;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Search query parameter "query" is required.' });
  }

  try {
    console.log(`\n--- 🔍 Starting Search Pipeline for: "${query}" ---`);

    // 1. Attempt to generate query vector via local Ollama
    let queryVector;
    try {
      console.log(`[Search] Attempting to generate semantic vector embedding via Ollama...`);
      queryVector = await getEmbedding(query);
      console.log(`✔ [Search] Semantic query embedding created successfully.`);
    } catch (ollamaErr) {
      console.warn(`⚠️ [Search] Local Ollama is offline or model is missing: ${ollamaErr.message}`);
      console.warn(`[Search] Triggering automatic local Keyword SQL search fallback...`);
      
      // FALLBACK: Execute a keyword matching search directly in SQLite
      const db = await getDb();
      const dbMatches = await db.all(
        `SELECT id, filename, mime_type, content_extracted 
         FROM files 
         WHERE content_extracted LIKE ? OR filename LIKE ?`,
        [`%${query}%`, `%${query}%`]
      );

      // Map and score basic keyword matches
      const formattedResults = dbMatches.map(match => {
        const text = match.content_extracted || '';
        const index = text.toLowerCase().indexOf(query.toLowerCase());
        
        let snippet = '';
        if (index !== -1) {
          const start = Math.max(0, index - 50);
          const end = Math.min(text.length, index + 150);
          snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
        } else {
          snippet = text.slice(0, 200) + (text.length > 200 ? '...' : '');
        }

        return {
          fileId: match.id,
          filename: match.filename,
          mimeType: match.mime_type,
          textSnippet: snippet,
          score: 0.80
        };
      });

      // Synthesize answer in fallback mode too
      const aiAnswer = await generateRAGAnswer(query, formattedResults);

      console.log(`✔ [Search] Fallback search completed. Returning ${formattedResults.length} keyword matches.`);
      console.log('--- 🏁 Search Pipeline Completed (Ollama Offline Fallback) ---\n');

      return res.json({
        query,
        provider: 'local-sqlite-keyword-fallback',
        isFallback: true,
        aiAnswer: aiAnswer,
        message: 'Ollama embeddings are offline. Keyword matched search results.',
        results: formattedResults
      });
    }

    // 2. Query the actual Vector database (Semantic cosine scores)
    const matchedChunks = await vectorStore.query(queryVector, 5);
    console.log(`[Search] Vector matching completed. Base segments retrieved: ${matchedChunks.length}`);

    // --- 🚀 HYBRID SEARCH: EXACT KEYWORD BOOSTING ALGORITHM ---
    // Extract non-trivial words from query (words > 3 characters that aren't common stop-words)
    const stopWords = ['what', 'where', 'which', 'who', 'whom', 'when', 'that', 'this', 'these', 'those', 'have', 'were', 'with', 'from', 'your'];
    const queryTerms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    console.log(`[Hybrid Search] Extracting key terms for boosting:`, queryTerms);

    // Apply exact keyword boosting (+0.15 score boost per matched rare term!)
    const boostedChunks = matchedChunks.map(chunk => {
      let boost = 0.0;
      const textLower = chunk.textSnippet.toLowerCase();
      
      queryTerms.forEach(term => {
        if (textLower.includes(term)) {
          boost += 0.15; // Boost score by 15% for exact rare term match!
        }
      });

      return {
        ...chunk,
        score: Math.min(1.0, chunk.score + boost) // Cap score at 100%
      };
    });

    // Re-sort matched chunks by their newly boosted hybrid scores
    const finalRankedChunks = boostedChunks.sort((a, b) => b.score - a.score);
    console.log(`✔ [Hybrid Search] Reranked matched chunks. Top match: "${finalRankedChunks[0]?.filename}" (Score: ${Math.round(finalRankedChunks[0]?.score * 100)}%)`);

    // 3. Synthesize direct RAG answer using local Llama 3 over top boosted chunks
    const aiAnswer = await generateRAGAnswer(query, finalRankedChunks);

    console.log('--- 🏁 Search Pipeline Completed (Semantic Model + RAG) ---\n');

    res.json({
      query,
      provider: 'hybrid-semantic-keyword-boost',
      isFallback: false,
      aiAnswer: aiAnswer,
      results: finalRankedChunks
    });
  } catch (error) {
    console.error('✖ Critical search pipeline crash:', error);
    res.status(500).json({ error: error.message });
  }
}
