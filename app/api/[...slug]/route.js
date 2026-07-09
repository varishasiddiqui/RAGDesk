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

export const runtime = "nodejs";

export const maxDuration = 60;

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


function cleanErrorMessage(err) {
  let msg = err?.message || String(err);

  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    
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


function stats() {
  return json(getCollectionStats());
}

// Vercel's free-tier serverless functions reject bodies over ~4.5MB before
// our code runs, so check content-length upfront and fail with a clear message.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function upload(request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return json(
        {
          detail: `File too large (${(contentLength / 1024 / 1024).toFixed(
            1
          )}MB). Please upload a PDF smaller than 4MB — this app is deployed on Vercel's free tier, which limits request size.`,
        },
        413
      );
    }

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

    const msg = cleanErrorMessage(err);
    const looksLikeBodyTooLarge =
      /body|size|limit|exceeded|content-length|multipart/i.test(msg);

    if (looksLikeBodyTooLarge) {
      return json(
        {
          detail:
            "That file couldn't be read — it's likely too large. Please upload a PDF smaller than 4MB; this app is deployed on Vercel's free tier, which limits request size.",
        },
        413
      );
    }

    return json({ detail: msg }, 500);
  }
}

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

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}
