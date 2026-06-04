/** Histórias Cantadas · Charts — SVG puro, SEMPRE na cor de acento (var(--c-accent)). Nunca preto/cinza.
 *  Em marca colorida, --c-accent == primária. Em marca neutra (preto/cinza), é a cor "viva". */

export function AreaChart({ data, height = 130 }: { data: number[]; height?: number }) {
  const w = 320, h = 120, max = Math.max(...data) * 1.1 || 1;
  const pt = (d: number, i: number) => [(i / (data.length - 1)) * w, h - (d / max) * h] as const;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${pt(d, i)[0].toFixed(1)} ${pt(d, i)[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={height} preserveAspectRatio="none">
      <defs><linearGradient id="ac" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--c-accent)" stopOpacity="0.28" /><stop offset="100%" stopColor="var(--c-accent)" stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L ${w} ${h} L 0 ${h} Z`} fill="url(#ac)" />
      <path d={line} fill="none" stroke="var(--c-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Linha com eixo base e pontos. */
export function LineChart({ data, labels = [] }: { data: number[]; labels?: string[] }) {
  const w = 320, h = 150, pad = 10, max = Math.max(...data) * 1.1 || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (d: number) => h - 24 - (d / max) * (h - 38);
  const pts = data.map((d, i) => `${x(i)},${y(d)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="150">
      <line x1={pad} y1={h - 24} x2={w - pad} y2={h - 24} stroke="var(--c-border)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="var(--c-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d)} r="3" fill="var(--c-accent)" />)}
      {labels.map((l, i) => <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="9" fontFamily="var(--c-font-mono)" fill="var(--c-text-muted)">{l}</text>)}
    </svg>
  );
}

/** Barras (vertical ou horizontal) — barras na cor da marca, labels mono, eixo sutil. */
export function BarChart({ data, labels = [], horizontal = false }: { data: number[]; labels?: string[]; horizontal?: boolean }) {
  const max = Math.max(...data) || 1;
  if (horizontal) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 72, fontSize: 11, fontFamily: 'var(--c-font-mono)', color: 'var(--c-text-muted)', textAlign: 'right' }}>{labels[i] ?? ''}</span>
            <div style={{ flex: 1, height: 24, background: 'var(--c-surface-alt)', borderRadius: 6 }}>
              <div style={{ width: `${(d / max) * 100}%`, height: '100%', background: 'var(--c-accent)', borderRadius: 6 }} />
            </div>
            <span style={{ width: 34, fontSize: 12, fontFamily: 'var(--c-font-mono)', color: 'var(--c-text)' }}>{d}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150, borderBottom: '1px solid var(--c-border)' }}>
        {data.map((d, i) => (
          <div key={i} title={`${labels[i] ?? ''}: ${d}`} style={{ flex: 1, height: `${(d / max) * 100}%`, background: 'var(--c-accent)', borderRadius: '6px 6px 0 0' }} />
        ))}
      </div>
      {labels.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          {labels.map((l, i) => <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontFamily: 'var(--c-font-mono)', color: 'var(--c-text-muted)' }}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

/** Donut — fatias na escala da marca por padrão; passe `color` p/ semânticos (status). */
export function Donut({ segments }: { segments: { label: string; value: number; color?: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const palette = ['var(--c-accent)', 'color-mix(in oklab, var(--c-accent), white 35%)', 'color-mix(in oklab, var(--c-accent), white 60%)', 'var(--c-accent-deep)'];
  let acc = 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <svg viewBox="0 0 42 42" width="150" height="150">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--c-border-soft)" strokeWidth="5" />
        {segments.map((s, i) => {
          const dash = (s.value / total) * 100;
          const seg = <circle key={i} cx="21" cy="21" r="15.9155" fill="none" stroke={s.color ?? palette[i % palette.length]} strokeWidth="5" strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={25 - acc} />;
          acc += dash;
          return seg;
        })}
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        {segments.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-text-body)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color ?? palette[i % palette.length] }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Gauge semicircular — progresso de meta. */
export function Gauge({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const arc = 126; // ~π*40
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 100 60" width="160" height="92">
        <path d="M10 54 A40 40 0 0 1 90 54" fill="none" stroke="var(--c-border-soft)" strokeWidth="9" strokeLinecap="round" />
        <path d="M10 54 A40 40 0 0 1 90 54" fill="none" stroke="var(--c-accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(pct / 100) * arc} 999`} />
        <text x="50" y="50" textAnchor="middle" fontSize="16" fontWeight="600" fontFamily="var(--c-font-mono)" fill="var(--c-text)">{pct}%</text>
      </svg>
      {label && <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: -8 }}>{label}</div>}
    </div>
  );
}

/** Funnel — forma real de funil (trapézios que afunilam). Número dentro (não corta), label + % ao lado. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = steps[0]?.value || 1;
  const W = 300, segH = 52, gap = 6;
  const h = steps.length * segH + (steps.length - 1) * gap;
  const cx = W / 2;
  const wOf = (v: number) => Math.max(0.16, v / max) * W;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${W} ${h}`} width={W} height={h} style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label="Funil de conversão">
        <defs><linearGradient id="cFnl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--c-accent)" /><stop offset="100%" stopColor="var(--c-accent-deep)" /></linearGradient></defs>
        {steps.map((s, i) => {
          const top = wOf(s.value);
          const bottom = wOf(steps[i + 1] ? steps[i + 1].value : s.value * 0.65);
          const y = i * (segH + gap);
          const pts = `${cx - top / 2},${y} ${cx + top / 2},${y} ${cx + bottom / 2},${y + segH} ${cx - bottom / 2},${y + segH}`;
          return <polygon key={i} points={pts} fill="url(#cFnl)" opacity={1 - i * 0.13} />;
        })}
        {steps.map((s, i) => (
          <text key={i} x={cx} y={i * (segH + gap) + segH / 2} textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="600" fill="#fff" fontFamily="var(--c-font-mono)">{s.value.toLocaleString('pt-BR')}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ height: segH, marginBottom: i < steps.length - 1 ? gap : 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <strong style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 500 }}>{s.label}</strong>
            <span style={{ fontFamily: 'var(--c-font-mono)', fontSize: 12, color: 'var(--c-text-muted)' }}>{Math.round((s.value / max) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ data, up = true }: { data: number[]; up?: boolean }) {
  const w = 80, h = 24, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / (max - min || 1)) * h}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} width="80" height="24"><polyline points={pts} fill="none" stroke={up ? 'var(--c-accent)' : 'var(--c-danger)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** KPI tile — label mono + número grande display + delta + sparkline. Pro topo de dashboard. */
export function KPITile({ label, value, delta, data = [] }: { label: string; value: string; delta?: string; data?: number[] }) {
  const down = !!delta && delta.trim().startsWith('-');
  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-lg)', padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: 'var(--c-font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-text-muted)' }}>{label}</span>
      <strong style={{ fontFamily: 'var(--c-font)', fontSize: 28, lineHeight: 1, color: 'var(--c-text)', letterSpacing: '-0.02em' }}>{value}</strong>
      {delta && <span style={{ fontFamily: 'var(--c-font-mono)', fontSize: 12, fontWeight: 600, color: down ? 'var(--c-danger)' : 'var(--c-success)' }}>{down ? '▼' : '▲'} {delta}</span>}
      {data.length > 1 && <div style={{ marginTop: 4 }}><Sparkline data={data} up={!down} /></div>}
    </div>
  );
}
