import { useEffect, useRef, useState, type ReactNode } from 'react';

const C_SHIMMER = { background: 'linear-gradient(90deg, var(--c-surface-alt) 25%, var(--c-border) 37%, var(--c-surface-alt) 63%)', backgroundSize: '400% 100%', animation: 'c-shimmer 1.4s ease infinite' };

/** Histórias Cantadas · TabView — abas com conteúdo + skeleton de loading na TROCA de aba.
 *  O skeleton é um OVERLAY que cobre exatamente a caixa do conteúdo, então ele
 *  respeita o que estiver na página automaticamente — não importa o que você mude
 *  no conteúdo, o placeholder sempre tem o tamanho/forma do conteúdo real.
 *  loadingMs=0 desliga (troca instantânea). Respeita prefers-reduced-motion. */
export function TabView({ tabs, loadingMs = 450 }: { tabs: { id: string; label: string; content: ReactNode }[]; loadingMs?: number }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const [loading, setLoading] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const select = (id: string) => {
    if (id === active) return;
    setActive(id);
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (loadingMs > 0 && !reduce) {
      setLoading(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLoading(false), loadingMs);
    }
  };

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div role="tablist" style={{ display: 'inline-flex', gap: 2, padding: 4, borderRadius: 999, background: 'var(--c-surface-alt)', marginBottom: 16 }}>
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button key={t.id} role="tab" aria-selected={on} onClick={() => select(t.id)}
              style={{ padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, background: on ? 'var(--c-accent)' : 'transparent', color: on ? '#fff' : 'var(--c-text-muted)', transition: 'all .18s' }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* conteúdo real (mantém o tamanho) + overlay de skeleton cobrindo a área dele */}
      <div role="tabpanel" style={{ position: 'relative' }}>
        <div style={{ opacity: loading ? 0 : 1, transition: 'opacity .25s ease' }}>
          {current?.content}
        </div>
        {loading && (
          <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 'var(--c-radius-md)', ...C_SHIMMER }} />
        )}
      </div>
    </div>
  );
}
