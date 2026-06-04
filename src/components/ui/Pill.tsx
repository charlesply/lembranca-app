import type { PropsWithChildren } from 'react';

/** Histórias Cantadas · Pill (11px, weight 500, sem caps lock) */
export function Pill({ tone = 'neutral', children }: PropsWithChildren<{ tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }>) {
  const tones: Record<string, React.CSSProperties> = {
    neutral: { background: 'var(--c-surface-alt)', color: 'var(--c-text-body)' },
    accent: { background: 'var(--c-accent-soft)', color: 'var(--c-accent-deep)' },
    success: { background: '#DCFCE7', color: '#15803D' },
    warning: { background: '#FEF3C7', color: '#92400E' },
    danger: { background: '#FEE2E2', color: '#991B1B' },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 11px', borderRadius: 'var(--c-radius-pill)',
      fontSize: 11, fontWeight: 500, letterSpacing: '-0.004em', lineHeight: 1.4, whiteSpace: 'nowrap', ...tones[tone],
    }}>{children}</span>
  );
}
