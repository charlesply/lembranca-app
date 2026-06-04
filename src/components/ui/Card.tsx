import type { HTMLAttributes } from 'react';

/** Histórias Cantadas · Card */
export function Card({ style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 'var(--c-radius-lg)', padding: 24, boxShadow: 'var(--c-shadow-sm)', ...style,
    }} {...rest} />
  );
}
