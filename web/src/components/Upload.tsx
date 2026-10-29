import { useRef, useState } from "react";
import { uploadDoc } from "../api.js";

export function Upload({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = async () => {
    const file = input.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadDoc(file);
      await onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="upload">
      <label>
        {busy ? "Indexing…" : "Upload a PDF"}
        <input ref={input} type="file" accept="application/pdf" disabled={busy} onChange={onChange} hidden />
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
