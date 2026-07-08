"use client";

import { useEffect, useRef, useState } from "react";
import Button from "./ui/Button.jsx";
import { askQuestion } from "../lib/api-client.js";
import "./ChatPanel.css";

export default function ChatPanel({ hasDocs }) {
  // { role: 'user'|'assistant', text, sources?, error? }
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const data = await askQuestion(question);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer, sources: data.sources || [] },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "", error: err.message || "Something went wrong." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel chat-panel">
      <h2 className="panel__title">Ask</h2>
      <p className="panel__subtitle">
        Questions are answered using only what&apos;s in your uploaded documents.
      </p>

      <div className="chat-thread" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <span className="chat-empty__icon" aria-hidden="true">
              ?
            </span>
            <p className="chat-empty__title">
              {hasDocs ? "Ask your first question" : "Upload a document to get started"}
            </p>
            <p className="chat-empty__body">
              {hasDocs
                ? "Try something like \u201cWhat is this document about?\u201d"
                : "Once a PDF finishes processing on the left, you can ask questions here."}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg--${msg.role}`}>
            <div className="chat-msg__bubble">
              {msg.error ? (
                <p className="chat-msg__error">{msg.error}</p>
              ) : (
                <p>{msg.text}</p>
              )}

              {msg.sources && msg.sources.length > 0 && (
                <div className="chat-sources">
                  {msg.sources.map((s, j) => (
                    <span key={j} className="chat-source-chip">
                      {s.filename} · p.{s.page_number}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-msg chat-msg--assistant">
            <div className="chat-msg__bubble chat-msg__bubble--loading">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          type="text"
          className="chat-input"
          placeholder={hasDocs ? "Ask a question about your documents..." : "Upload a document first..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
