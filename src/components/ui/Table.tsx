import type { ReactNode } from 'react';

/** Histórias Cantadas · Table */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-lg)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 480 }}>
        <thead>
          <tr>{head.map((h, i) => (
            <th key={i} style={{ textAlign: 'left', padding: '12px 20px', fontFamily: 'var(--c-font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--c-text-muted)', background: 'var(--c-surface-alt)', borderBottom: '1px solid var(--c-border)' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (
              <td key={j} style={{ padding: '13px 20px', borderBottom: i < rows.length - 1 ? '1px solid var(--c-border)' : 'none', color: 'var(--c-text-body)' }}>{c}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
