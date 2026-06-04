import { useEffect, useMemo, useRef, useState } from 'react';

/** Histórias Cantadas · MultiSelect — selecione vários itens com chips removíveis + busca. Chips no acento. */
export function MultiSelect({ options, value, onChange, label, placeholder = 'Adicionar…' }: { options: string[]; value: string[]; onChange: (v: string[]) => void; label?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => !value.includes(o) && (!q || o.toLowerCase().includes(q)));
  }, [options, value, query]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>{label}</span>}
      <div onClick={() => setOpen(true)} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 44, padding: '6px 10px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', cursor: 'text' }}>
        {value.map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', borderRadius: 999, fontSize: 13, background: 'var(--c-accent-soft)', color: 'var(--c-accent-deep)' }}>
            {v}
            <button type="button" aria-label={'remover ' + v} onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-accent-deep)', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={value.length ? '' : placeholder} style={{ flex: 1, minWidth: 90, border: 'none', outline: 'none', background: 'transparent', color: 'var(--c-text)', fontSize: 15, fontFamily: 'inherit' }} />
      </div>
      {open && filtered.length > 0 && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, maxHeight: 220, overflowY: 'auto', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', boxShadow: 'var(--c-shadow-lg)', padding: 6 }}>
          {filtered.map((o) => (
            <button key={o} type="button" onMouseDown={(e) => { e.preventDefault(); onChange([...value, o]); setQuery(''); }} style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderRadius: 'var(--c-radius-sm)', cursor: 'pointer', fontSize: 14, background: 'transparent', color: 'var(--c-text-body)' }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}
