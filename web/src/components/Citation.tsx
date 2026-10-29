export function Citation({ label, quote }: { label: string; quote: string }) {
  return (
    <details className="citation">
      <summary>{label}</summary>
      <blockquote>{quote}</blockquote>
    </details>
  );
}
