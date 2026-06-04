import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command { id: string; label: string; hint?: string; onRun: () => void; }

/** Histórias Cantadas · CommandK — paleta de comandos (⌘K / Ctrl+K). O atalho power-user. Item ativo no acento. */
export function CommandK({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? commands.filter((c) => c.label.toLowerCase().includes(s)) : commands;
  }, [commands, q]);
  useEffect(() => { setActive(0); }, [q]);
  if (!open) return null;
  const run = (c: Command) => { c.onRun(); setOpen(false); };
  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 560, margin: '0 16px', background: 'var(--c-surface)', borderRadius: 'var(--c-radius-xl)', boxShadow: 'var(--c-shadow-lg)', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comando…"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); run(filtered[active]); }
          }}
          style={{ width: '100%', height: 56, padding: '0 20px', border: 'none', borderBottom: '1px solid var(--c-border)', outline: 'none', fontSize: 16, background: 'transparent', color: 'var(--c-text)', fontFamily: 'inherit' }} />
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
          {filtered.length === 0 && <div style={{ padding: '16px 12px', fontSize: 14, color: 'var(--c-text-muted)' }}>Nenhum comando.</div>}
          {filtered.map((c, i) => (
            <button key={c.id} type="button" onMouseEnter={() => setActive(i)} onClick={() => run(c)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 12px', border: 'none', borderRadius: 'var(--c-radius-md)', cursor: 'pointer', fontSize: 14, textAlign: 'left', background: i === active ? 'var(--c-accent-soft)' : 'transparent', color: i === active ? 'var(--c-accent-deep)' : 'var(--c-text-body)' }}>
              <span>{c.label}</span>
              {c.hint && <kbd style={{ fontFamily: 'var(--c-font-mono)', fontSize: 11, color: 'var(--c-text-muted)' }}>{c.hint}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
