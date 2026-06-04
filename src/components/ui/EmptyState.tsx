import type { ReactNode } from 'react';

/** Histórias Cantadas · EmptyState — lista vazia é oportunidade de orientar: ícone calmo + 1 linha + 1 ação.
 *  Nunca entregue uma tela em branco. */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '48px 24px', maxWidth: 360, marginInline: 'auto' }}>
      {icon && <span style={{ display: 'grid', placeItems: 'center', width: 56, height: 56, borderRadius: 'var(--c-radius-lg)', background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}>{icon}</span>}
      <strong style={{ fontSize: 17, color: 'var(--c-text)', letterSpacing: '-0.01em' }}>{title}</strong>
      {description && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--c-text-muted)' }}>{description}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
