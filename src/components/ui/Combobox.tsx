import { useEffect, useMemo, useRef, useState } from 'react';

/** Histórias Cantadas · Combobox — select com busca pra listas grandes (ex.: escolher um paciente).
 *  Filtra ao digitar, navega por teclado (↑ ↓ Enter Esc), item ativo na cor de acento. */
export function Combobox({ options, value, onChange, label, placeholder = 'Busque…' }: { options: string[]; value?: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  useEffect(() => { setActive(0); }, [query, open]);

  const choose = (v: string) => { onChange(v); setQuery(''); setOpen(false); };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>{label}</span>}
      <input
        role="combobox" aria-expanded={open} aria-autocomplete="list"
        value={open ? query : (value ?? '')}
        placeholder={value || placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={(e) => { setOpen(true); setQuery(''); e.currentTarget.style.borderColor = 'var(--c-accent)'; e.currentTarget.style.boxShadow = 'var(--c-shadow-focus)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.boxShadow = 'none'; }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        style={{ height: 44, padding: '0 14px', fontSize: 15, fontFamily: 'inherit', background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', outline: 'none' }}
      />
      {open && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, maxHeight: 240, overflowY: 'auto', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', boxShadow: 'var(--c-shadow-lg)', padding: 6 }}>
          {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--c-text-muted)' }}>Nada encontrado.</div>}
          {filtered.map((o, i) => {
            const isActive = i === active;
            const isSel = o === value;
            return (
              <button key={o} type="button" role="option" aria-selected={isSel}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                onMouseEnter={() => setActive(i)}
                style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderRadius: 'var(--c-radius-sm)', cursor: 'pointer', fontSize: 14, background: isActive ? 'var(--c-accent-soft)' : 'transparent', color: isSel ? 'var(--c-accent-deep)' : 'var(--c-text-body)', fontWeight: isSel ? 600 : 400 }}>
                {o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
