import { useState } from 'react';

/** Histórias Cantadas · Avatar (iniciais + presence). `ring` = anel da cor do fundo (use em grupos). */
export function Avatar({ initials, size = 40, presence, color = 'var(--c-accent)', ring = false }: { initials: string; size?: number; presence?: 'online' | 'away' | 'busy'; color?: string; ring?: boolean }) {
  const colors = { online: '#22C55E', away: '#EAB308', busy: '#EF4444' };
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, borderRadius: '50%', boxShadow: ring ? '0 0 0 2px var(--c-surface)' : undefined }}>
      <span style={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', background: color, color: '#fff', fontSize: size * 0.38, fontWeight: 600, letterSpacing: '-0.02em' }}>{initials}</span>
      {presence && <span style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: colors[presence], border: '2px solid var(--c-surface)' }} />}
    </span>
  );
}

/** Histórias Cantadas · AvatarStack — grupo sobreposto + contador (+N).
 *  z-index decrescente (1º na frente) e o +N sempre por cima — anel ÚNICO por item.
 *  Hover destaca o avatar (sobe e vem pra frente). */
export function AvatarStack({ people, max = 4, size = 40 }: { people: { initials: string; color?: string }[]; max?: number; size?: number }) {
  const [hover, setHover] = useState(-1);
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const overlap = Math.round(size * 0.35);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((p, i) => {
        const up = hover === i;
        return (
          <span key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
            style={{ marginLeft: i ? -overlap : 0, position: 'relative', display: 'inline-flex', cursor: 'pointer', zIndex: up ? 60 : shown.length - i, transition: 'transform .18s cubic-bezier(0.16, 1, 0.3, 1)', transform: up ? 'translateY(-5px) scale(1.05)' : 'none' }}>
            <Avatar initials={p.initials} size={size} color={p.color} ring />
          </span>
        );
      })}
      {extra > 0 && (
        <span style={{ marginLeft: -overlap, position: 'relative', zIndex: shown.length + 1, width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--c-surface-alt)', boxShadow: '0 0 0 2px var(--c-surface)', fontSize: Math.round(size * 0.32), fontWeight: 700, color: 'var(--c-text-body)', letterSpacing: '-0.02em' }}>+{extra}</span>
      )}
    </div>
  );
}
