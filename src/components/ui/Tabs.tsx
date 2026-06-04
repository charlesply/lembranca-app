/** Histórias Cantadas · Tabs (segmentadas) */
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 4, borderRadius: 999, background: 'var(--c-surface-alt)' }}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{ padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              background: active ? 'var(--c-accent)' : 'transparent', color: active ? '#fff' : 'var(--c-text-muted)', transition: 'all .18s' }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
