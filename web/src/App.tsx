import { useCallback, useEffect, useState } from "react";
import { type DocMeta, deleteDoc, listDocs } from "./api.js";
import { Chat } from "./components/Chat.js";
import { DocList } from "./components/DocList.js";
import { Upload } from "./components/Upload.js";

export function App() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDocs(await listDocs());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const remove = async (id: string) => {
    try {
      await deleteDoc(id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete document");
    }
  };

  return (
    <main className="layout">
      <aside className="sidebar">
        <h1>Docs Chat</h1>
        <Upload onUploaded={refresh} />
        {error && <p className="error">{error}</p>}
        <DocList docs={docs} selected={selected} onToggle={toggle} onDelete={remove} />
      </aside>
      <Chat docs={docs} selectedIds={[...selected]} />
    </main>
  );
}
