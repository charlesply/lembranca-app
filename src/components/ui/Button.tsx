import type { ButtonHTMLAttributes } from 'react';

/** Histórias Cantadas · Button */
export function Button({
  variant = 'primary', size = 'md', style, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: '32px', md: '40px', lg: '48px' } as const;
  const pads = { sm: '0 14px', md: '0 18px', lg: '0 24px' } as const;
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--c-primary)', color: '#fff', border: '1px solid var(--c-primary-deep)' },
    outline: { background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' },
    ghost: { background: 'transparent', color: 'var(--c-text)', border: '1px solid transparent' },
    danger: { background: 'var(--c-danger)', color: '#fff', border: '1px solid var(--c-danger)' },
  };
  return (
    <button
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: sizes[size], padding: pads[size], borderRadius: 'var(--c-radius-pill)',
        fontFamily: 'var(--c-font)', fontWeight: 500, fontSize: 14, letterSpacing: '-0.005em',
        cursor: 'pointer', transition: 'transform var(--c-t-fast)', ...variants[variant], ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      {...rest}
    />
  );
}
