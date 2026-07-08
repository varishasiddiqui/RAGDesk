# RAGDesk

> A document-reading agent with citations — upload a PDF, ask questions, get grounded answers with page-level source citations. Built to demonstrate **LLM + vector DB + RAG** skills, deployed fully on **Vercel free tier**.

This is the Vercel-deployable version of RAGDesk. The original project was a split React (Vite) frontend + Python (FastAPI + ChromaDB) backend. The backend couldn't be hosted on any free tier (Render / Railway / Fly.io all dropped free plans), so the whole thing was re-architected as a single **Next.js** app where the backend runs as serverless API routes — free on Vercel.

The RAG pipeline (PDF → chunk → embed → vector search → LLM answer with citations) is **identical** to the original. Same chunking (800 chars, 150 overlap), same embedding model (`gemini-embedding-001`), same chat model (`gemini-2.5-flash`), same citation prompt.

---

## What changed (and what didn't)

| Original (Python) | This version (Next.js) | Why |
|---|---|---|
| FastAPI backend | Next.js API Routes (`/api/*`) | Serverless, free on Vercel |
| `PyMuPDF` (`fitz`) | `unpdf` (PDF.js wrapper) | Serverless-friendly, no native deps |
| `chromadb` on disk | In-memory vector store + cosine similarity | No persistent disk on Vercel free |
| `google-genai` (Python) | `@google/genai` (npm) | Same Gemini API, JS client |
| Vite + React SPA | Next.js App Router (same components) | Unified fullstack deployment |
| Two-step upload + store | Single `/api/upload` (extract+chunk+embed+store) | No disk to stage files on |
| `VITE_API_BASE` env var | Relative `/api/*` URLs | Same origin = no CORS, no config |

**Preserved exactly:**
- Chunk size: 800 chars, overlap: 150 chars
- Embedding model: `gemini-embedding-001`
- Chat model: `gemini-2.5-flash`
- The exact citation prompt (`You are a document assistant...`)
- Citation format: `[Source N]` + `filename · p.N` chips in the UI
- The whole UI: same fonts (Fraunces / Inter / IBM Plex Mono), same palette, same layout

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Vercel (free)                     │
│                                                      │
│   ┌──────────────┐         ┌────────────────────┐   │
│   │  Next.js     │  fetch  │  API Route          │   │
│   │  React UI    │ ──────> │  /api/[...slug]     │   │
│   │  (SSG/CSR)   │  /api/* │  (single function)  │   │
│   └──────────────┘         └─────────┬──────────┘   │
│                                      │               │
│                          ┌───────────┴───────────┐  │
│                          │  In-memory store      │  │
│                          │  (globalThis, shared  │  │
│                          │   across warm calls)  │  │
│                          └───────────┬───────────┘  │
│                                      │               │
│                          ┌───────────┴───────────┐  │
│                          │  Google Gemini API    │  │
│                          │  • gemini-embedding-001 │  │
│                          │  • gemini-2.5-flash   │  │
│                          └───────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Why a catch-all API route?** Vercel treats each route file as a separate serverless function with its own memory. If we split `/api/upload`, `/api/ask`, `/api/stats` into separate files, the in-memory vector store wouldn't be shared between them. Routing everything through `app/api/[...slug]/route.js` keeps one warm function instance (and one shared store) for all API calls.

**Why in-memory instead of an external vector DB?** It keeps the project deployable with zero extra signups — just add your Gemini key and deploy. The store persists for as long as the serverless function stays warm. On cold starts you simply re-upload the PDF, which is fine for a portfolio demo. For production, see [Production upgrades](#production-upgrades) below.

---

## Quick start (local)

```bash
# 1. Install dependencies
npm install

# 2. Add your Gemini API key
cp .env.example .env.local
#   then edit .env.local and paste your key from https://aistudio.google.com/apikey

# 3. Run the dev server
npm run dev
#   open http://localhost:3000
```

Upload a PDF, wait for "Ready", then ask questions in the chat panel. Answers come back with `[Source N]` citations and `filename · p.N` chips.

---

## Deploy to Vercel (free)

### Option A — Vercel dashboard

1. Push this folder to a new GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Vercel auto-detects Next.js — no build config needed.
4. Add the environment variable:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** your key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
5. Click **Deploy**. Done — you get a free `https://<your-project>.vercel.app` URL.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel          # follow the prompts
vercel env add GEMINI_API_KEY    # paste your key when prompted
vercel --prod   # deploy to production
```

### Important Vercel settings

- **Function max duration:** Set to 60s in `vercel.json` (enough for large PDFs + Gemini calls). The free tier allows up to 10s by default; for big PDFs, consider upgrading to Pro or splitting uploads.
- **Body size limit:** Vercel's free tier allows up to 4.5MB request bodies on serverless functions. For larger PDFs, use Vercel Blob storage (see [Production upgrades](#production-upgrades)).

---

## API reference

All endpoints live under `/api/*`. They're all served by one serverless function for shared memory.

### `GET /api/health`
Health check. Returns `{ status, app, version, deployment }`.

### `POST /api/upload`
Multipart form data with a `files` field (one or more PDFs). Runs the full pipeline: extract text → chunk → embed → store. Returns:
```json
{
  "uploaded": [{ "filename": "doc.pdf", "total_pages": 12, "chunks_stored": 47 }],
  "count": 1,
  "collection_stats": { "total_chunks_stored": 47 }
}
```

### `POST /api/ask`
Body: `{ "question": "string", "top_k": 5 }`. Runs the full RAG flow: embed query → vector search → Gemini answer. Returns:
```json
{
  "question": "...",
  "answer": "...with [Source 1] citations...",
  "sources": [
    { "label": "Source 1", "filename": "doc.pdf", "page_number": 4, "distance": 0.18 }
  ]
}
```

### `POST /api/retrieve`
Body: `{ "question": "string", "top_k": 5 }`. Returns the raw top-k matching chunks without an LLM answer. Useful for debugging retrieval.

### `GET /api/stats`
Returns `{ "total_chunks_stored": N }`.

---

## How the RAG pipeline works

1. **PDF text extraction** (`lib/pdf.js`) — `unpdf` parses the PDF and returns text per page. Output: `[{ page_number, text }]`.

2. **Chunking** (`lib/chunking.js`) — each page is split into 800-character windows with 150-character overlap. Overlap ensures context isn't lost at chunk boundaries. Each chunk gets a stable ID: `{filename}_p{page}_c{index}`.

3. **Embedding** (`lib/embeddings.js`) — chunks are embedded with Google's `gemini-embedding-001` model (768-dim vectors) using task type `RETRIEVAL_DOCUMENT`.

4. **Vector storage** (`lib/vector-store.js`) — embeddings live in an in-memory array on `globalThis`. Each chunk's L2 norm is precomputed for fast cosine similarity.

5. **Query embedding** — the user's question is embedded with the same model but task type `RETRIEVAL_QUERY`.

6. **Vector search** — cosine similarity is computed between the query vector and every stored chunk. Top-k results are returned sorted by distance (lower = more similar, ChromaDB-style).

7. **LLM answer** (`lib/llm.js`) — the matched chunks are formatted as `[Source N | filename, page N]\n<text>` blocks and fed to `gemini-2.5-flash` with a prompt that forces ground-only answers with bracket citations.

8. **Citation display** — the UI renders each source as a `filename · p.N` chip under the answer.

---

## Production upgrades

The in-memory store is great for a portfolio demo but has two limits: data is lost on cold starts, and each serverless function instance has its own memory (so concurrent users on different instances won't see each other's uploads). For a production app:

### Persistent vector DB
Swap `lib/vector-store.js` for one of these (the interface stays the same):

- **Upstash Vector** — free 10k vectors, REST API, serverless-native. Best drop-in.
  ```bash
  npm install @upstash/vector
  ```
- **Supabase + pgvector** — free 500MB Postgres with vector extension.
- **Pinecone** — free starter tier, purpose-built vector DB.

### Large file uploads
Vercel's free serverless body limit is 4.5MB. For bigger PDFs, upload to **Vercel Blob** first, then pass the URL to the API route.

---

## Project structure

```
ragdesk-vercel/
├── app/
│   ├── api/
│   │   └── [...slug]/
│   │       └── route.js        # Catch-all API (health, upload, ask, retrieve, stats)
│   ├── globals.css             # Design tokens + global resets
│   ├── layout.jsx              # Root layout (fonts, metadata)
│   ├── page.jsx                # Main page (Navbar + Workspace)
│   └── page.css
├── components/
│   ├── ChatPanel.jsx + .css
│   ├── Navbar.jsx + .css
│   ├── UploadPanel.jsx + .css
│   ├── Workspace.jsx + .css
│   ├── Logo.jsx + .css
│   └── ui/
│       ├── Button.jsx + .css
│       └── Field.jsx + .css
├── lib/
│   ├── api-client.js           # Frontend fetch helpers
│   ├── chunking.js             # 800-char / 150-overlap chunker
│   ├── embeddings.js           # gemini-embedding-001 client
│   ├── llm.js                  # gemini-2.5-flash with citation prompt
│   ├── pdf.js                  # unpdf-based page text extractor
│   └── vector-store.js         # In-memory cosine-similarity store
├── public/
│   └── favicon.svg
├── .env.example
├── .gitignore
├── next.config.mjs
├── package.json
├── vercel.json
└── README.md
```

---

## Tech stack

- **Next.js 15** (App Router) — fullstack framework, native Vercel deployment
- **React 19** — UI (original components, unchanged)
- **@google/genai** — Gemini embeddings + chat
- **unpdf** — serverless-friendly PDF parsing (PDF.js under the hood)
- **Vercel** — hosting (free tier: 100GB bandwidth, 100GB-hrs serverless compute)

---

## License

MIT — use this as a reference for your own RAG portfolio projects.
