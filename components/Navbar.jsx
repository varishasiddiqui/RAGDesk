"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo.jsx";
import { checkHealth } from "../lib/api-client.js";
import "./Navbar.css";

export default function Navbar() {
  const [status, setStatus] = useState("checking"); // "checking" | "online" | "offline"

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        await checkHealth();
        if (!cancelled) setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }

    ping();
    const interval = setInterval(ping, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="navbar">
      <div className="navbar__inner container">
        <Logo />
        <div className="navbar__actions">
          <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
          <span className="navbar__status-label">
            {status === "checking" && "Connecting..."}
            {status === "online" && "API online"}
            {status === "offline" && "API offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
