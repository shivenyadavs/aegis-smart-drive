import fs from 'fs/promises';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import path from 'path';
import { ollama, doesModelExist } from '../config/ollama.js';

/**
 * Main parser entry point. Detects file type and routes to the appropriate extractor.
 */
export async function extractText(filePath, mimeType) {
  const extension = path.extname(filePath).toLowerCase();

  try {
    if (mimeType === 'application/pdf' || extension === '.pdf') {
      return await parsePDF(filePath);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      extension === '.docx'
    ) {
      return await parseDOCX(filePath);
    } else if (
      mimeType.startsWith('text/') || 
      ['.txt', '.md', '.json', '.csv', '.xml', '.html'].includes(extension)
    ) {
      return await parseTXT(filePath);
    } else if (
      mimeType.startsWith('image/') || 
      ['.png', '.jpg', '.jpeg', '.bmp', '.webp'].includes(extension)
    ) {
      return await parseImage(filePath);
    } else {
      throw new Error(`Unsupported file type: ${mimeType || extension}`);
    }
  } catch (error) {
    console.error(`✖ Extraction failed for "${path.basename(filePath)}":`, error.message);
    throw error;
  }
}

/**
 * Parses plain text files natively using fs/promises.
 */
async function parseTXT(filePath) {
  console.log(`[Parser] Reading TXT content from: ${path.basename(filePath)}`);
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Extracts raw text from PDFs using pdf-parse.
 */
async function parsePDF(filePath) {
  console.log(`[Parser] Extracting PDF text from: ${path.basename(filePath)}`);
  const buffer = await fs.readFile(filePath);
  
  // Clean default options to handle standard layouts
  const data = await pdf(buffer);
  return data.text || '';
}

/**
 * Extracts raw text from Microsoft Word documents using mammoth.
 */
async function parseDOCX(filePath) {
  console.log(`[Parser] Extracting DOCX text from: ${path.basename(filePath)}`);
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || '';
}

/**
 * Parses images using a robust Dual-Engine strategy:
 * 1. Tesseract.js (Standard OCR for dense typed text).
 * 2. Ollama Vision (LLaVA/Llama3-Vision for descriptive context and visual layouts).
 */
async function parseImage(filePath) {
  const filename = path.basename(filePath);
  console.log(`[Parser] Staging dual-mode analysis on image: "${filename}"`);

  let ocrText = '';
  let visionText = '';

  // --- Engine 1: Tesseract.js OCR ---
  try {
    console.log(`[Parser OCR] Processing dense characters via Tesseract on: "${filename}"`);
    const ocrResult = await Tesseract.recognize(filePath, 'eng');
    ocrText = ocrResult.data.text || '';
    console.log(`[Parser OCR] Completed. Characters extracted: ${ocrText.trim().length}`);
  } catch (ocrErr) {
    console.warn(`[Parser OCR] Tesseract encountered an issue: ${ocrErr.message}`);
  }

  // --- Engine 2: Local Ollama Vision (LLaVA / Llama3-Vision) ---
  try {
    // Check if the user has a vision model installed
    const hasLlava = await doesModelExist('llava');
    const hasLlama3Vision = await doesModelExist('llama3-vision');
    const visionModel = hasLlama3Vision ? 'llama3-vision' : (hasLlava ? 'llava' : null);

    if (visionModel) {
      console.log(`[Parser Vision] Processing high-level description via Ollama using model: "${visionModel}"...`);
      
      // Load image and convert to base64 string
      const imageBuffer = await fs.readFile(filePath);
      const base64Image = imageBuffer.toString('base64');

      const response = await ollama.generate({
        model: visionModel,
        prompt: `
          This image is uploaded to a local privacy-focused AI Smart Drive system.
          Analyze this image in detail:
          1. Extract any visible text, letters, or handwritten annotations.
          2. Describe the visual layout, chart indicators, objects, or context in detail.
          Provide a clean, descriptive summary.
        `,
        images: [base64Image],
        options: {
          temperature: 0.1 // Low temperature for factual visual reporting
        }
      });

      visionText = response.response || '';
      console.log(`[Parser Vision] Completed. Description length: ${visionText.trim().length}`);
    } else {
      console.log('[Parser Vision] No local multimodal vision model (llava/llama3-vision) detected in Ollama. Skipping Vision Engine.');
    }
  } catch (visionErr) {
    console.warn(`[Parser Vision] Ollama Vision encountered an issue: ${visionErr.message}`);
  }

  // Combine both sources to feed maximum semantic context to the Embeddings Engine
  const combinedContext = [
    ocrText.trim() ? `--- OCR TEXT EXTRACT ---\n${ocrText.trim()}` : '',
    visionText.trim() ? `--- VISUAL SCENE ANALYSIS ---\n${visionText.trim()}` : ''
  ].filter(Boolean).join('\n\n');

  if (!combinedContext.trim()) {
    return 'Image file contains no legible text or scene details could not be parsed.';
  }

  return combinedContext;
}
