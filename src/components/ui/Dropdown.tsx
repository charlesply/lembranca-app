import { useEffect, useRef, useState } from 'react';

/** Histórias Cantadas · Dropdown menu */
export function Dropdown({ trigger, items }: { trigger: string; items: { label: string; danger?: boolean; onClick?: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 'var(--c-radius-md)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
        {trigger} ▾
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 180, zIndex: 50, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', boxShadow: 'var(--c-shadow-lg)', padding: 6 }}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" onClick={() => { it.onClick?.(); setOpen(false); }}
              style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: 'none', borderRadius: 'var(--c-radius-sm)', cursor: 'pointer', fontSize: 14, color: it.danger ? 'var(--c-danger)' : 'var(--c-text-body)' }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
