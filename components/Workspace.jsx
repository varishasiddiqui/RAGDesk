"use client";

import { useState } from "react";
import UploadPanel from "./UploadPanel.jsx";
import ChatPanel from "./ChatPanel.jsx";
import "./Workspace.css";

export default function Workspace() {
  const [readyDocs, setReadyDocs] = useState([]);

  return (
    <div>
      <div className="page-header">
        <p className="page-header__eyebrow">RAGDesk</p>
        <h1 className="page-header__title">
          Ask your documents<span className="mark">.</span>
        </h1>
        <p className="page-header__subtitle">
          Upload a PDF, then ask questions in plain language. Answers are
          grounded in your documents, with page citations.
        </p>
      </div>

      <div className="workspace">
        <UploadPanel setReadyDocs={setReadyDocs} />
        <ChatPanel hasDocs={readyDocs.length > 0} />
      </div>
    </div>
  );
}
