/**
 * Catch-all API route — handles EVERY endpoint under /api/* in ONE
 * serverless function so they all share the in-memory vector store.
 *
 * This is intentional: Vercel treats each route file as a separate
 * serverless function with its own memory. If we split /api/upload,
 * /api/ask, /api/stats into separate files, the store wouldn't be
 * shared and the app would break. Putting everything behind a single
 * catch-all keeps one warm function instance (and one shared store)
 * for all API calls.
 *
 * Endpoints (matching the original FastAPI surface):
 *   GET  /api/health        — health check
 *   POST /api/upload        — receive a PDF, extract → chunk → embed → store
 *   GET  /api/stats         — vector store stats
 *   POST /api/retrieve      — embed a query, return top-k chunks (debug)
 *   POST /api/ask           — embed query → search → Gemini answer w/ citations
 */

import { NextResponse } from "next/server";
import { extractTextByPage } from "../../../lib/pdf.js";
import { chunkPages } from "../../../lib/chunking.js";
import { embedDocuments, embedQuery } from "../../../lib/embeddings.js";
import {
  addChunksToStore,
  getCollectionStats,
  searchChunks,
} from "../../../lib/vector-store.js";
import { generateAnswer } from "../../../lib/llm.js";

// Always run on the Node.js runtime (we need `unpdf` + file parsing).
export const runtime = "nodejs";
// Let large PDFs run a bit longer (Vercel hobby allows up to 60s on Pro,
// 10s default on free — we set maxDuration in vercel.json too).
export const maxDuration = 60;

// ----------------------------------------------------------------------------
// Router
// ----------------------------------------------------------------------------

export async function GET(request, { params }) {
  const path = (params.slug || []).join("/");
  switch (path) {
    case "health":
      return healthCheck();
    case "stats":
      return stats();
    default:
      return json({ error: `GET /api/${path} not found` }, 404);
  }
}

export async function POST(request, { params }) {
  const path = (params.slug || []).join("/");
  switch (path) {
    case "upload":
      return upload(request);
    case "ask":
      return ask(request);
    case "retrieve":
      return retrieve(request);
    default:
      return json({ error: `POST /api/${path} not found` }, 404);
  }
}

// ----------------------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------------------

/**
 * Turn a thrown error into a clean, user-facing message.
 * Gemini SDK errors often arrive as { message: '{"error":{...}}' }
 * (a JSON string wrapped in a string), so we unwrap recursively.
 */
function cleanErrorMessage(err) {
  let msg = err?.message || String(err);

  // The @google/genai SDK sometimes wraps the API response as a
  // JSON string inside `err.message`. Try to parse it out.
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // not JSON — fall through
  }

  return msg;
}

/** GET /api/health — quick liveness probe. */
function healthCheck() {
  return json({
    status: "ok",
    app: "RAGDesk",
    version: "1.0.0",
    deployment: "vercel",
  });
}

/** GET /api/stats — how many chunks are in the store right now. */
function stats() {
  return json(getCollectionStats());
}

/**
 * POST /api/upload
 * Body: multipart/form-data with a "files" field (one or more PDFs).
 *
 * Replaces the original two-step flow (/upload then /store/{filename}).
 * On Vercel there's no persistent disk, so we extract → chunk → embed →
 * store in one shot. The filename is preserved for citations.
 */
async function upload(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return json({ detail: "No files received. Attach at least one PDF." }, 400);
    }

    const results = [];

    for (const file of files) {
      // --- Basic validation: reject anything that isn't a PDF ---
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        return json(
          { detail: `'${file.name}' is not a PDF (got ${file.type || "unknown"})` },
          400
        );
      }

      // --- Read bytes ---
      const arrayBuffer = await file.arrayBuffer();

      // --- Extract → chunk → embed → store ---
      const pages = await extractTextByPage(arrayBuffer);
      const chunks = chunkPages(pages, file.name);

      if (chunks.length === 0) {
        results.push({
          filename: file.name,
          total_pages: pages.length,
          chunks_stored: 0,
          warning: "No extractable text found (the PDF might be scanned images).",
        });
        continue;
      }

      const chunkTexts = chunks.map((c) => c.text);
      const vectors = await embedDocuments(chunkTexts);
      const stored = addChunksToStore(chunks, vectors);

      results.push({
        filename: file.name,
        total_pages: pages.length,
        chunks_stored: stored,
      });
    }

    return json({
      uploaded: results,
      count: results.length,
      collection_stats: getCollectionStats(),
    });
  } catch (err) {
    console.error("[/api/upload] error:", err);
    return json({ detail: cleanErrorMessage(err) }, 500);
  }
}

/**
 * POST /api/retrieve
 * Body: { question: string, top_k?: number = 5 }
 *
 * Returns the raw top-k matching chunks without an LLM answer — useful
 * for debugging the retrieval step.
 */
async function retrieve(request) {
  try {
    const body = await request.json();
    const question = body?.question;
    const topK = Number(body?.top_k) || 5;

    if (!question || typeof question !== "string") {
      return json({ detail: "'question' is required." }, 400);
    }

    const queryVector = await embedQuery(question);
    const matches = searchChunks(queryVector, topK);

    return json({
      question,
      matches_found: matches.length,
      matches,
    });
  } catch (err) {
    console.error("[/api/retrieve] error:", err);
    return json({ detail: cleanErrorMessage(err) }, 500);
  }
}

/**
 * POST /api/ask
 * Body: { question: string, top_k?: number = 5 }
 *
 * The full RAG flow: embed the query → search the store → feed matches
 * to Gemini with the citation prompt → return the answer + source list.
 */
async function ask(request) {
  try {
    const body = await request.json();
    const question = body?.question;
    const topK = Number(body?.top_k) || 5;

    if (!question || typeof question !== "string") {
      return json({ detail: "'question' is required." }, 400);
    }

    const queryVector = await embedQuery(question);
    const matches = searchChunks(queryVector, topK);

    if (matches.length === 0) {
      return json(
        { detail: "No documents stored yet. Upload a PDF first." },
        404
      );
    }

    const answer = await generateAnswer(question, matches);

    return json({
      question,
      answer,
      sources: matches.map((m, i) => ({
        label: `Source ${i + 1}`,
        filename: m.filename,
        page_number: m.page_number,
        distance: m.distance,
      })),
    });
  } catch (err) {
    console.error("[/api/ask] error:", err);
    return json({ detail: cleanErrorMessage(err) }, 500);
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}
