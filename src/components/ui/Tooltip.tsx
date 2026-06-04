import { useState, type ReactNode } from 'react';

/** Histórias Cantadas · Tooltip */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
      {children}
      {show && (
        <span role="tooltip" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', padding: '6px 10px', borderRadius: 'var(--c-radius-sm)', background: 'var(--c-text)', color: 'var(--c-surface)', fontSize: 12, zIndex: 50 }}>{label}</span>
      )}
    </span>
  );
}
