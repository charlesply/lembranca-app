import { useState } from 'react';

/** Histórias Cantadas · Accordion */
export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-lg)', overflow: 'hidden' }}>
      {items.map((it, i) => (
        <div key={i} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
          <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500, color: 'var(--c-text)', textAlign: 'left' }}>
            {it.q}<span style={{ color: 'var(--c-accent)', fontSize: 20 }}>{open === i ? '–' : '+'}</span>
          </button>
          {open === i && <p style={{ margin: 0, padding: '0 20px 20px', color: 'var(--c-text-body)', fontSize: 14, lineHeight: 1.6 }}>{it.a}</p>}
        </div>
      ))}
    </div>
  );
}
