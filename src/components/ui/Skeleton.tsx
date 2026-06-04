import type { CSSProperties } from 'react';

const C_SHIMMER: CSSProperties = { background: 'linear-gradient(90deg, var(--c-surface-alt) 25%, var(--c-border) 37%, var(--c-surface-alt) 63%)', backgroundSize: '400% 100%', animation: 'c-shimmer 1.4s ease infinite' };

/** Histórias Cantadas · Skeleton — placeholder de carregamento com shimmer. Respeita prefers-reduced-motion (via tokens.css).
 *  Espelhe o layout REAL: texto (linhas), avatar (radius 50%), e mídia (use SkeletonMedia). */
export function Skeleton({ width = '100%', height = 16, radius = 'var(--c-radius-sm)', style }: { width?: number | string; height?: number | string; radius?: string; style?: CSSProperties }) {
  return <span aria-hidden style={{ display: 'block', width, height, borderRadius: radius, ...C_SHIMMER, ...style }} />;
}

/** Histórias Cantadas · SkeletonMedia — placeholder de imagem (shimmer + ícone de imagem no centro). */
export function SkeletonMedia({ height = 140, style }: { height?: number | string; style?: CSSProperties }) {
  return (
    <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: '100%', height, borderRadius: 'var(--c-radius-md)', ...C_SHIMMER, ...style }}>
      <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--c-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
      </svg>
    </span>
  );
}
