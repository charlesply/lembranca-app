import { useEffect, type ReactNode } from 'react';

/** Histórias Cantadas · ConfirmDialog — confirma ações destrutivas (excluir, cancelar). Esc fecha. */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = true, onConfirm, onCancel }: { open: boolean; title: string; description?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div role="alertdialog" aria-modal="true" onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: 'var(--c-surface)', borderRadius: 'var(--c-radius-xl)', boxShadow: 'var(--c-shadow-lg)', padding: 24 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--c-text)' }}>{title}</h3>
        {description && <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.55, color: 'var(--c-text-body)' }}>{description}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ height: 40, padding: '0 16px', borderRadius: 'var(--c-radius-pill)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} style={{ height: 40, padding: '0 16px', borderRadius: 'var(--c-radius-pill)', border: 'none', background: danger ? 'var(--c-danger)' : 'var(--c-accent)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
