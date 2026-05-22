// Chat panel: accepts natural-language questions, translates them to FHIR
// search params via the query route, executes locally against the bundle,
// and displays grounded answers with supporting evidence.

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSessionStore } from "@/lib/store/session";
import { executeSearch } from "@/lib/query/execute";
import { formatAnswer } from "@/lib/query/answer";
import type { FormattedAnswer } from "@/lib/query/answer";
import { StateView } from "./StateView";
import styles from "./ChatPanel.module.css";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  evidence?: FormattedAnswer["evidence"];
}

export function ChatPanel() {
  const bundle = useSessionStore((s) => s.bundle);
  const status = useSessionStore((s) => s.status);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const disabled = status !== "ready" || !bundle;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const question = input.trim();
      if (!question || !bundle || loading) return;

      setInput("");
      setError(null);
      setMessages((prev) => [...prev, { role: "user", text: question }]);
      setLoading(true);

      try {
        const response = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });

        const data = await response.json();

        if (!response.ok || "error" in data) {
          setError(data.error ?? "Query failed");
          setLoading(false);
          return;
        }

        const matches = executeSearch(
          bundle,
          data.resourceType,
          data.searchParams,
        );

        const answer = formatAnswer(question, data.resourceType, matches);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: answer.text,
            evidence: answer.evidence,
          },
        ]);
      } catch {
        setError("Network error — please try again.");
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, bundle, loading],
  );

  if (disabled) {
    return (
      <div className={styles.container}>
        <StateView
          state="empty"
          message="Upload a record to start asking questions."
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.messages} ref={scrollRef}>
        {messages.length === 0 && !loading && (
          <p className={styles.hint}>
            Ask about this patient&apos;s record &mdash; e.g. &ldquo;When was
            metformin first prescribed?&rdquo; or &ldquo;Has the patient ever
            had hypertension?&rdquo;
          </p>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={styles.message} data-role={msg.role}>
            <div className={styles.bubble} data-role={msg.role}>
              <p className={styles.messageText}>{msg.text}</p>
              {msg.evidence && msg.evidence.length > 0 && (
                <div className={styles.evidence}>
                  <span className={styles.evidenceLabel}>Based on:</span>
                  <ul className={styles.evidenceList}>
                    {msg.evidence.map((e, j) => (
                      <li key={j} className={styles.evidenceItem}>
                        <span className={styles.evidenceResource}>
                          {e.label}
                        </span>
                        {e.date && (
                          <span className={styles.evidenceDate}>{e.date}</span>
                        )}
                        {e.status && (
                          <span className={styles.evidenceStatus}>
                            {e.status}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className={styles.message} data-role="assistant">
            <div className={styles.bubble} data-role="assistant">
              <div className={styles.typing}>
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className={styles.errorBar}>
          {error}
          <button
            className={styles.errorDismiss}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this record…"
          disabled={loading}
          aria-label="Ask a question about this patient's record"
        />
        <button
          className={styles.sendButton}
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send question"
        >
          Send
        </button>
      </form>
    </div>
  );
}
