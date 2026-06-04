import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** Histórias Cantadas · DatePicker — calendário próprio (dia selecionado na cor de acento).
 *  Substitui o <input type="date"> nativo, que renderiza o calendário do SISTEMA OPERACIONAL. */
const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
const sameDay = (a: Date | null | undefined, b: Date) => !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const navBtn: CSSProperties = { width: 28, height: 28, borderRadius: 'var(--c-radius-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', cursor: 'pointer', fontSize: 16, lineHeight: 1 };

export function DatePicker({ value, onChange, onClear, label, placeholder = 'Selecione a data' }: { value?: Date | null; onChange: (d: Date) => void; onClear?: () => void; label?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(value ?? new Date());
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const y = view.getFullYear(), m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>{label}</span>}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 44, padding: '0 14px', background: 'var(--c-surface)', color: value ? 'var(--c-text)' : 'var(--c-text-muted)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>
        {value ? fmt(value) : placeholder}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--c-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      </button>
      {open && (
        <div role="dialog" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: 280, padding: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-lg)', boxShadow: 'var(--c-shadow-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" aria-label="Ano anterior" onClick={() => setView(new Date(y - 1, m, 1))} style={navBtn}>«</button>
              <button type="button" aria-label="Mês anterior" onClick={() => setView(new Date(y, m - 1, 1))} style={navBtn}>‹</button>
            </span>
            <strong style={{ fontSize: 14, color: 'var(--c-text)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{MES[m]} {y}</strong>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" aria-label="Próximo mês" onClick={() => setView(new Date(y, m + 1, 1))} style={navBtn}>›</button>
              <button type="button" aria-label="Próximo ano" onClick={() => setView(new Date(y + 1, m, 1))} style={navBtn}>»</button>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {WD.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--c-text-muted)', padding: '4px 0' }}>{d}</span>)}
            {Array.from({ length: firstDow }).map((_, i) => <span key={'pad' + i} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const date = new Date(y, m, d);
              const sel = sameDay(value, date);
              const isToday = sameDay(today, date);
              return (
                <button key={d} type="button" onClick={() => { onChange(date); setOpen(false); }}
                  style={{ height: 34, borderRadius: 'var(--c-radius-sm)', border: isToday && !sel ? '1px solid var(--c-accent)' : '1px solid transparent', background: sel ? 'var(--c-accent)' : 'transparent', color: sel ? '#fff' : 'var(--c-text-body)', fontSize: 13, fontWeight: sel ? 600 : 400, cursor: 'pointer' }}>
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--c-border)' }}>
            {onClear
              ? <button type="button" onClick={() => { onClear(); setOpen(false); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--c-text-muted)', padding: 0 }}>Limpar</button>
              : <span />}
            <button type="button" onClick={() => { const t = new Date(); setView(t); onChange(t); setOpen(false); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--c-accent)', padding: 0 }}>Hoje</button>
          </div>
        </div>
      )}
    </div>
  );
}
