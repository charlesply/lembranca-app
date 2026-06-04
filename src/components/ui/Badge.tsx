import type { PropsWithChildren } from 'react';

/** Histórias Cantadas · Badge (contador numérico em mono) */
export function Badge({ tone = 'neutral', children }: PropsWithChildren<{ tone?: 'neutral' | 'accent' | 'success' }>) {
  const tones: Record<string, React.CSSProperties> = {
    neutral: { background: 'var(--c-surface-alt)', color: 'var(--c-text-body)' },
    accent: { background: 'var(--c-accent)', color: '#fff' },
    success: { background: 'var(--c-success)', color: '#fff' },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20,
      padding: '0 7px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'var(--c-font-mono)', ...tones[tone],
    }}>{children}</span>
  );
}
