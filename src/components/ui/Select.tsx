import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface Opt { value: string; label: string }

/** Histórias Cantadas · Select — listbox CUSTOM (lista própria na cor da marca, NÃO o <select> nativo).
 *  O <select> nativo abre a lista do SISTEMA OPERACIONAL (azul, sem personalidade) — este não.
 *  Acessível: ↑ ↓ Enter Esc. Marcado no acento + check. */
const SEL_OPT: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', border: 'none', borderRadius: 'var(--c-radius-sm)', fontSize: 14, textAlign: 'left', cursor: 'pointer', background: 'transparent', color: 'var(--c-text-body)' };

export function Select({ options, value, onChange, label, placeholder = 'Selecione' }: { options: Opt[]; value?: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  useEffect(() => { if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value))); }, [open]); // eslint-disable-line
  const choose = (o: Opt) => { onChange(o.value); setOpen(false); };
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>{label}</span>}
      <button type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(a + 1, options.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (open && options[active]) choose(options[active]); else setOpen(true); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 44, padding: '0 14px', background: 'var(--c-surface)', color: selected ? 'var(--c-text)' : 'var(--c-text-muted)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', boxShadow: open ? 'var(--c-shadow-focus)' : 'none', borderColor: open ? 'var(--c-accent)' : 'var(--c-border)' }}>
        <span>{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--c-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, maxHeight: 240, overflowY: 'auto', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', boxShadow: 'var(--c-shadow-lg)', padding: 6 }}>
          {options.map((o, i) => {
            const isSel = o.value === value;
            return (
              <button key={o.value} type="button" role="option" aria-selected={isSel}
                onMouseEnter={() => setActive(i)} onClick={() => choose(o)}
                style={{ ...SEL_OPT, background: i === active ? 'var(--c-accent-soft)' : 'transparent', color: isSel ? 'var(--c-accent-deep)' : 'var(--c-text-body)', fontWeight: isSel ? 600 : 400 }}>
                {o.label}
                {isSel && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--c-accent-deep)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
