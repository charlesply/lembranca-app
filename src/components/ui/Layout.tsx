import type { PropsWithChildren, CSSProperties } from 'react';

/** Histórias Cantadas · Container — largura fluida + padding lateral responsivo (clamp). Centraliza o conteúdo. */
export function Container({ max = 1200, style, children }: PropsWithChildren<{ max?: number; style?: CSSProperties }>) {
  return <div style={{ width: '100%', maxWidth: max, marginInline: 'auto', paddingInline: 'clamp(16px, 5vw, 64px)', ...style }}>{children}</div>;
}

/** Histórias Cantadas · Grid fluido — reflui sozinho (auto-fit) e empilha no mobile SEM media query.
 *  min = largura mínima de cada coluna antes de quebrar pra próxima linha. */
export function Grid({ min = 240, gap = 'clamp(16px, 3vw, 32px)', style, children }: PropsWithChildren<{ min?: number; gap?: string; style?: CSSProperties }>) {
  return (
    <div style={{ display: 'grid', gap, gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, ...style }}>
      {children}
    </div>
  );
}

/** Histórias Cantadas · Stack — coluna com gap consistente (vertical rhythm). */
export function Stack({ gap = 16, style, children }: PropsWithChildren<{ gap?: number; style?: CSSProperties }>) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}

/** Histórias Cantadas · Cluster — itens em linha que quebram pro próximo nível no mobile (toolbar, tags, botões). */
export function Cluster({ gap = 12, style, children }: PropsWithChildren<{ gap?: number; style?: CSSProperties }>) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap, ...style }}>{children}</div>;
}
