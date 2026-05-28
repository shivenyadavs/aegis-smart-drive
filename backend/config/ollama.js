import { Ollama } from 'ollama';
import dotenv from 'dotenv';

dotenv.config();

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const llmModel = process.env.OLLAMA_LLM_MODEL || 'mistral';
const embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

export const ollama = new Ollama({ host: ollamaHost });

/**
 * Checks if the local Ollama service is reachable.
 */
export async function checkOllamaConnection() {
  try {
    const response = await fetch(`${ollamaHost}/api/tags`);
    if (response.ok) {
      return true;
    }
    return false;
  } catch (error) {
    // Return false silently to prevent repetitive log flooding during background polling
    return false;
  }
}

/**
 * Checks if a specific model exists in local Ollama storage.
 */
export async function doesModelExist(modelName) {
  try {
    const list = await ollama.list();
    return list.models.some(m => m.name.startsWith(modelName));
  } catch (error) {
    console.error(`✖ Error listing Ollama models:`, error.message);
    return false;
  }
}

/**
 * Proactively pull a model if it is missing locally.
 */
export async function pullModelIfMissing(modelName) {
  try {
    console.log(`Checking local Ollama model: "${modelName}"...`);
    const exists = await doesModelExist(modelName);
    if (!exists) {
      console.log(`Model "${modelName}" is missing. Attempting to pull it from Ollama hub...`);
      console.log('NOTE: This might take a few minutes depending on your internet connection.');
      await ollama.pull({ model: modelName });
      console.log(`✔ Successfully pulled model "${modelName}".`);
      return true;
    }
    console.log(`✔ Model "${modelName}" is already available locally.`);
    return true;
  } catch (error) {
    console.error(`✖ Failed to verify/pull model "${modelName}":`, error.message);
    return false;
  }
}

/**
 * Quick validation of local GPU setup configuration.
 */
export async function validateAISystem() {
  const online = await checkOllamaConnection();
  if (!online) {
    return {
      status: 'offline',
      message: `Local Ollama is not running. Please launch Ollama on your PC (${ollamaHost}).`
    };
  }

  const llmStatus = await doesModelExist(llmModel);
  const embedStatus = await doesModelExist(embedModel);

  return {
    status: 'online',
    details: {
      host: ollamaHost,
      llmModel: { name: llmModel, exists: llmStatus },
      embedModel: { name: embedModel, exists: embedStatus }
    }
  };
}
