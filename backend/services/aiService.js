import { ollama } from '../config/ollama.js';
import dotenv from 'dotenv';

dotenv.config();

const llmModel = process.env.OLLAMA_LLM_MODEL || 'mistral';

/**
 * Prompts Ollama to categorize a document based strictly on its actual content.
 * Filename is omitted to guarantee categorization is driven purely by content.
 */
export async function analyzeContentAndCategorize(extractedText) {
  if (!extractedText || extractedText.trim().length === 0) {
    return {
      folder: 'Uncategorized',
      confidence: 0.1,
      reason: 'No raw content could be extracted from this document.'
    };
  }

  // Cap text input to fit comfortably in standard local context windows
  const textSample = extractedText.slice(0, 4000);

  const prompt = `
You are a highly precise file organization assistant for a local, privacy-focused Smart Drive.
Your job is to analyze the actual file content below and classify it into an intelligent category/folder name.

RULES:
1. Categorize strictly based on the CONTENT. Do not try to guess a filename.
2. The folder name should be a simple, clean, generic category (e.g. "Receipts", "Invoices", "Contracts", "Medical", "Coding", "Tax Documents", "Academic Papers", "Creative Writing").
3. Do NOT make folder names too specific (e.g. use "Receipts" instead of "StarbucksReceipt2026").
4. Respond ONLY with a valid, clean JSON object matching this schema. Do not write markdown, code blocks, or explanations outside the JSON.

SCHEMA:
{
  "folder": "Intelligent Category Name (PascalCase or space-separated, no slashes, e.g. 'Tax Documents')",
  "confidence": 0.0 to 1.0,
  "reason": "Short, clear explanation of why this category was chosen based on specific text clues in the content."
}

---
FILE CONTENT:
${textSample}
---
  `;

  try {
    const response = await ollama.generate({
      model: llmModel,
      prompt: prompt,
      format: 'json', // Ensures Ollama model outputs JSON format!
      options: {
        temperature: 0.2 // Low temperature for high precision
      }
    });

    const parsedResult = JSON.parse(response.response);
    return {
      folder: parsedResult.folder || 'General',
      confidence: parsedResult.confidence || 0.5,
      reason: parsedResult.reason || 'Categorized based on general content similarity.'
    };
  } catch (error) {
    console.error('✖ Error analyzing file content via Ollama LLM:', error.message);
    // Secure fallback
    return {
      folder: 'Unsorted',
      confidence: 0.3,
      reason: `LLM categorization encountered an error: ${error.message}`
    };
  }
}
