export interface DocMeta {
  id: string;
  name: string;
  pages: number;
  chunks: number;
  createdAt: string;
}

export interface CitationData {
  docId: string;
  page: number;
  quote: string;
}

export interface ChatHandlers {
  onText(text: string): void;
  onCitation(citation: CitationData): void;
  onError(error: { code: string; message: string }): void;
}

async function failure(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return new Error(body.error?.message ?? `Request failed (${res.status})`);
  } catch {
    return new Error(`Request failed (${res.status})`);
  }
}

export async function listDocs(): Promise<DocMeta[]> {
  const res = await fetch("/v1/documents");
  if (!res.ok) throw await failure(res);
  return (await res.json()) as DocMeta[];
}

export async function uploadDoc(file: File): Promise<DocMeta> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/v1/documents", { method: "POST", body: form });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as DocMeta;
}

export async function deleteDoc(id: string): Promise<void> {
  const res = await fetch(`/v1/documents/${id}`, { method: "DELETE" });
  if (!res.ok) throw await failure(res);
}

function dispatch(event: string, data: string, handlers: ChatHandlers): void {
  const payload: unknown = JSON.parse(data);
  if (event === "text") handlers.onText((payload as { text: string }).text);
  else if (event === "citation") handlers.onCitation(payload as CitationData);
  else if (event === "error") handlers.onError(payload as { code: string; message: string });
}

/** POSTs the question and reads the SSE response, dispatching each event to the handlers. */
export async function streamChat(
  question: string,
  docIds: string[],
  handlers: ChatHandlers,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch("/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, docIds }),
    signal,
  });
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data.push(line.slice(6));
      }
      if (data.length > 0) dispatch(event, data.join("\n"), handlers);
      boundary = buffer.indexOf("\n\n");
    }
  }
}
