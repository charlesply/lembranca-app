/** Histórias Cantadas · Switch */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        style={{ width: 44, height: 26, borderRadius: 999, border: 'none', position: 'relative', cursor: 'pointer', background: checked ? 'var(--c-accent)' : 'var(--c-border)', transition: 'background .18s' }}>
        <span style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: 'var(--c-shadow-sm)', transition: 'transform .18s', transform: checked ? 'translateX(18px)' : 'none' }} />
      </button>
      {label && <span style={{ fontSize: 14, color: 'var(--c-text)' }}>{label}</span>}
    </label>
  );
}
