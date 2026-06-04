/* ============================================================
   Histórias Cantadas · Design System (porta JS · React 19)
   ─────────────────────────────────────────────────────────
   Componentes prontos pra usar no app atual sem TypeScript.
   Cada um segue 1:1 a especificação do Portal DS (tokens da
   marca, raios rounded, sombra medium, motion springy).
============================================================ */

/* ─────────── BUTTON ─────────── */
export function Button({
  variant = 'primary',
  size = 'md',
  style,
  children,
  ...rest
}) {
  const sizes = { sm: 32, md: 40, lg: 48 };
  const pads  = { sm: '0 14px', md: '0 18px', lg: '0 24px' };
  const variants = {
    primary: { background: 'var(--c-primary)',  color: '#fff',             border: '1px solid var(--c-primary-deep)' },
    outline: { background: 'var(--c-surface)',  color: 'var(--c-text)',    border: '1px solid var(--c-border)' },
    ghost:   { background: 'transparent',       color: 'var(--c-text)',    border: '1px solid transparent' },
    danger:  { background: 'var(--c-danger)',   color: '#fff',             border: '1px solid var(--c-danger)' },
  };
  return (
    <button
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: sizes[size], padding: pads[size], borderRadius: 'var(--c-radius-pill)',
        fontFamily: 'var(--c-font)', fontWeight: 500, fontSize: 14, letterSpacing: '-0.005em',
        cursor: 'pointer', transition: 'transform var(--c-t-fast)',
        ...variants[variant], ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      {...rest}
    >{children}</button>
  );
}

/* ─────────── CARD ─────────── */
export function Card({ style, children, ...rest }) {
  return (
    <div
      style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--c-radius-lg)', padding: 24, boxShadow: 'var(--c-shadow-sm)',
        ...style,
      }}
      {...rest}
    >{children}</div>
  );
}

/* ─────────── PILL (11px · weight 500 · -0.004em · sem CAPS) ─────────── */
export function Pill({ tone = 'neutral', children }) {
  const tones = {
    neutral: { background: 'var(--c-surface-alt)',  color: 'var(--c-text-body)' },
    accent:  { background: 'var(--c-accent-soft)',  color: 'var(--c-accent-deep)' },
    success: { background: '#DCFCE7', color: '#15803D' },
    warning: { background: '#FEF3C7', color: '#92400E' },
    danger:  { background: '#FEE2E2', color: '#991B1B' },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 11px',
      borderRadius: 'var(--c-radius-pill)', fontSize: 11, fontWeight: 500,
      letterSpacing: '-0.004em', lineHeight: 1.4, whiteSpace: 'nowrap',
      ...tones[tone],
    }}>{children}</span>
  );
}

/* ─────────── BADGE (contador numérico · IBM Plex Mono) ─────────── */
export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: { background: 'var(--c-surface-alt)', color: 'var(--c-text-body)' },
    accent:  { background: 'var(--c-accent)', color: '#fff' },
    success: { background: 'var(--c-success)', color: '#fff' },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 20, height: 20, padding: '0 7px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, fontFamily: 'var(--c-font-mono)',
      ...tones[tone],
    }}>{children}</span>
  );
}

/* ─────────── INPUT (label obrigatório + hint + foco com ring) ─────────── */
export function Input({ label, hint, error, id, style, ...rest }) {
  const inputId = id || `inp-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label htmlFor={inputId} style={{ display: 'block' }}>
      {label && (
        <span style={{
          display: 'block', fontSize: 12, fontWeight: 500,
          color: 'var(--c-text-body)', marginBottom: 6, letterSpacing: '-0.005em',
        }}>{label}</span>
      )}
      <input
        id={inputId}
        style={{
          width: '100%', height: 44, padding: '0 14px',
          borderRadius: 'var(--c-radius-md)', border: `1px solid ${error ? 'var(--c-danger)' : 'var(--c-border)'}`,
          background: 'var(--c-surface)', color: 'var(--c-text)',
          fontFamily: 'var(--c-font)', fontSize: 15, outline: 'none',
          transition: 'border-color var(--c-t-fast), box-shadow var(--c-t-fast)',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--c-accent)';
          e.currentTarget.style.boxShadow = 'var(--c-shadow-focus)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--c-danger)' : 'var(--c-border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        {...rest}
      />
      {(hint || error) && (
        <span style={{
          display: 'block', marginTop: 6, fontSize: 12,
          color: error ? 'var(--c-danger)' : 'var(--c-text-muted)',
        }}>{error || hint}</span>
      )}
    </label>
  );
}

/* ─────────── SKELETON (shimmer 2026 oficial) ─────────── */
export function Skeleton({ w = '100%', h = 16, radius = 'var(--c-radius-sm)', style }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block', width: w, height: h, borderRadius: radius,
        background: 'linear-gradient(90deg, var(--c-surface-alt) 0%, var(--c-border) 50%, var(--c-surface-alt) 100%)',
        backgroundSize: '200% 100%', animation: 'c-shimmer 1.4s linear infinite',
        ...style,
      }}
    />
  );
}

/* ─────────── EMPTY STATE ─────────── */
export function EmptyState({ icon = '🎵', title, body, action }) {
  return (
    <div style={{
      textAlign: 'center', padding: 'var(--c-12) var(--c-6)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 'var(--c-radius-lg)',
        background: 'var(--c-surface-tint)', color: 'var(--c-accent-deep)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, marginBottom: 4,
      }}>{icon}</div>
      <h3 style={{
        fontFamily: 'var(--c-font-display)', fontSize: 18, fontWeight: 600,
        color: 'var(--c-text)', margin: 0, letterSpacing: 'var(--c-ls-tight)',
      }}>{title}</h3>
      {body && (
        <p style={{
          fontFamily: 'var(--c-font)', fontSize: 14, color: 'var(--c-text-muted)',
          margin: 0, maxWidth: 360, lineHeight: 'var(--c-lh-normal)',
        }}>{body}</p>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/* ─────────── COUNT UP (números animados) ─────────── */
import { useState as _useState, useEffect as _useEffect } from 'react';
export function CountUp({ to = 0, duration = 1200, prefix = '', suffix = '' }) {
  const [v, setV] = _useState(0);
  _useEffect(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(to * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [to, duration]);
  return (
    <span style={{ fontFamily: 'var(--c-font-mono)', fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{v}{suffix}
    </span>
  );
}

/* ─────────── REVEAL (fade-up on intersect) ─────────── */
export function Reveal({ children, delay = 0, style }) {
  const [shown, setShown] = _useState(false);
  _useEffect(() => {
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div style={{
      opacity: shown ? 1 : 0,
      transform: shown ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity var(--c-t), transform var(--c-t)',
      ...style,
    }}>{children}</div>
  );
}
