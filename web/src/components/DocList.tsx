import type { DocMeta } from "../api.js";

interface Props {
  docs: DocMeta[];
  selected: Set<string>;
  onToggle(id: string): void;
  onDelete(id: string): void;
}

export function DocList({ docs, selected, onToggle, onDelete }: Props) {
  if (docs.length === 0) return <p className="muted">No documents yet.</p>;
  return (
    <ul className="doc-list">
      {docs.map((doc) => (
        <li key={doc.id}>
          <label>
            <input type="checkbox" checked={selected.has(doc.id)} onChange={() => onToggle(doc.id)} />
            <span className="doc-name">{doc.name}</span>
          </label>
          <span className="muted">
            {doc.pages} pp · {doc.chunks} chunks
          </span>
          <button type="button" onClick={() => onDelete(doc.id)} aria-label={`Delete ${doc.name}`}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
