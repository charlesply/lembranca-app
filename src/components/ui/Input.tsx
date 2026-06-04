import type { InputHTMLAttributes } from 'react';

/** Histórias Cantadas · Input com label + hint */
export function Input({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>{label}</span>}
      <input
        style={{ height: 44, padding: '0 14px', fontSize: 15, background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-md)', outline: 'none' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--c-accent)'; e.currentTarget.style.boxShadow = 'var(--c-shadow-focus)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.boxShadow = 'none'; }}
        {...rest}
      />
      {hint && <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{hint}</span>}
    </label>
  );
}
