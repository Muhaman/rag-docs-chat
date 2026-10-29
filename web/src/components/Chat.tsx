import { type FormEvent, useEffect, useRef, useState } from "react";
import { type CitationData, type DocMeta, streamChat } from "../api.js";
import { Citation } from "./Citation.js";

interface Message {
  role: "user" | "assistant";
  text: string;
  citations: CitationData[];
  error?: string;
}

interface Props {
  docs: DocMeta[];
  selectedIds: string[];
}

export function Chat({ docs, selectedIds }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const updateLast = (update: (m: Message) => Message) =>
    setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? update(m) : m)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || streaming) return;
    setQuestion("");
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text, citations: [] },
      { role: "assistant", text: "", citations: [] },
    ]);
    const abort = new AbortController();
    controller.current = abort;
    try {
      await streamChat(
        text,
        selectedIds,
        {
          onText: (chunk) => updateLast((m) => ({ ...m, text: m.text + chunk })),
          onCitation: (c) => updateLast((m) => ({ ...m, citations: [...m.citations, c] })),
          onError: (e) => updateLast((m) => ({ ...m, error: e.message })),
        },
        abort.signal,
      );
    } catch (err) {
      if (!abort.signal.aborted) {
        updateLast((m) => ({ ...m, error: err instanceof Error ? err.message : "Request failed" }));
      }
    } finally {
      setStreaming(false);
    }
  };

  const names = new Map(docs.map((d) => [d.id, d.name]));

  return (
    <section className="chat">
      <div className="messages">
        {messages.length === 0 && <p className="muted">Upload a PDF, then ask a question about it.</p>}
        {messages.map((m, i) => (
          <article key={i} className={`message ${m.role}`}>
            <p>{m.text}</p>
            {m.citations.map((c, j) => (
              <Citation key={j} label={`${names.get(c.docId) ?? "Document"} p.${c.page}`} quote={c.quote} />
            ))}
            {m.error && <p className="error">{m.error}</p>}
          </article>
        ))}
      </div>
      <form onSubmit={submit}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={selectedIds.length > 0 ? "Ask about the selected documents" : "Ask about all documents"}
          maxLength={2000}
        />
        <button type="submit" disabled={streaming || question.trim() === ""}>
          {streaming ? "…" : "Ask"}
        </button>
      </form>
    </section>
  );
}
