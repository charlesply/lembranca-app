import { useEffect, type ReactNode } from 'react';

/** Histórias Cantadas · Modal */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, background: 'var(--c-surface)', borderRadius: 'var(--c-radius-xl)', boxShadow: 'var(--c-shadow-lg)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--c-border)' }}>
          <h3 style={{ margin: 0, fontSize: 20, color: 'var(--c-text)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--c-text-muted)' }}>×</button>
        </header>
        <div style={{ padding: 24, color: 'var(--c-text-body)', lineHeight: 1.55 }}>{children}</div>
        {footer && <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid var(--c-border)', background: 'var(--c-surface-alt)' }}>{footer}</footer>}
      </div>
    </div>
  );
}
