
import { GoogleGenAI } from "@google/genai";

const CHAT_MODEL = "gemini-2.5-flash";

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (local dev) or to Vercel Project Settings → Environment Variables."
    );
  }
  _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _client;
}

/**
 * 
 * @param {Array<{ filename: string, page_number: number, text: string }>} chunks
 * @returns {string}
 */
export function buildContextBlock(chunks) {
  const blocks = chunks.map((chunk, i) => {
    const n = i + 1; // 1-indexed, matching the Python `enumerate(chunks, start=1)`
    return `[Source ${n} | ${chunk.filename}, page ${chunk.page_number}]\n${chunk.text}`;
  });
  return blocks.join("\n\n");
}

/**
 * Generate a grounded answer to the question using ONLY the provided chunks.
 * @param {string} question
 * @param {Array<{ filename, page_number, text }>} chunks
 * @returns {Promise<string>} — the model's answer, with [Source N] citations
 */
export async function generateAnswer(question, chunks) {
  const client = getClient();
  const contextBlock = buildContextBlock(chunks);

  // Prompt is preserved verbatim from the Python original so answer
  // style and citation behaviour match exactly.
  const prompt = `You are a document assistant. Answer the question using ONLY
the sources provided below. Do not use any outside knowledge.

For every claim you make, cite the source in brackets, e.g. [Source 1].
If the sources don't contain enough information to answer, say so clearly
instead of guessing.

--- SOURCES ---
${contextBlock}

--- QUESTION ---
${question}

--- ANSWER (with citations) ---`;

  const response = await client.models.generateContent({
    model: CHAT_MODEL,
    contents: prompt,
  });
  return response.text;
}
