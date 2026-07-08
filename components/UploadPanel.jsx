"use client";

import { useRef, useState } from "react";
import Button from "./ui/Button.jsx";
import { uploadPdf } from "../lib/api-client.js";
import "./UploadPanel.css";

export default function UploadPanel({ setReadyDocs }) {
  // { name, status: 'uploading'|'processing'|'ready'|'error', error? }
  const [docs, setDocs] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  function updateDoc(name, patch) {
    setDocs((prev) => prev.map((d) => (d.name === name ? { ...d, ...patch } : d)));
  }

  async function processFile(file) {
    const name = file.name;

    if (!file.type.includes("pdf") && !name.toLowerCase().endsWith(".pdf")) {
      setDocs((prev) => [
        ...prev,
        { name, status: "error", error: "Only PDF files are supported." },
      ]);
      return;
    }

    // "uploading" → "processing" → "ready"
    // On Vercel, /api/upload does extract + chunk + embed + store in one shot,
    // but we keep both visual states for nicer UX.
    setDocs((prev) => [...prev, { name, status: "uploading" }]);

    try {
      updateDoc(name, { status: "processing" });
      // Single request: upload + extract + chunk + embed + store
      await uploadPdf(file);
      updateDoc(name, { status: "ready" });
      setReadyDocs((prev) => (prev.includes(name) ? prev : [...prev, name]));
    } catch (err) {
      updateDoc(name, { status: "error", error: err.message || "Something went wrong." });
    }
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    files.forEach(processFile);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="panel">
      <h2 className="panel__title">Documents</h2>
      <p className="panel__subtitle">Upload PDFs to ask questions about them.</p>

      <div
        className={`dropzone ${dragOver ? "dropzone--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        <span className="dropzone__icon" aria-hidden="true">
          ↑
        </span>
        <p className="dropzone__title">Drop a PDF here</p>
        <p className="dropzone__hint">or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="visually-hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {docs.length > 0 && (
        <ul className="doc-list">
          {docs.map((doc) => (
            <li key={doc.name} className="doc-item">
              <span className="doc-item__icon" aria-hidden="true">
                PDF
              </span>
              <div className="doc-item__body">
                <p className="doc-item__name" title={doc.name}>
                  {doc.name}
                </p>
                {doc.status === "error" ? (
                  <p className="doc-item__error">{doc.error}</p>
                ) : (
                  <p className={`doc-item__status doc-item__status--${doc.status}`}>
                    {doc.status === "uploading" && "Uploading..."}
                    {doc.status === "processing" && "Reading & indexing..."}
                    {doc.status === "ready" && "Ready"}
                  </p>
                )}
              </div>
              {doc.status === "error" && (
                <Button
                  variant="ghost"
                  type="button"
                  className="doc-item__retry"
                  onClick={() => {
                    setDocs((prev) => prev.filter((d) => d.name !== doc.name));
                  }}
                >
                  Dismiss
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
