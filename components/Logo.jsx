"use client";

import "./Logo.css";

export default function Logo() {
  return (
    <div className="logo" aria-label="RAGDesk">
      <span className="logo__mark" aria-hidden="true">
        R
      </span>
      <span className="logo__word">
        RAG<span className="mark">Desk</span>
      </span>
    </div>
  );
}
