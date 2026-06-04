import { useEffect, useRef, useState } from 'react';

/** Histórias Cantadas · CountUp — anima um número até o valor (KPIs). Respeita prefers-reduced-motion. */
export function CountUp({ to, duration = 900, prefix = '', suffix = '', decimals = 0 }: { to: number; duration?: number; prefix?: string; suffix?: string; decimals?: number }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(to); return; }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    const safety = setTimeout(() => setN(to), duration + 120);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(safety); };
  }, [to, duration]);
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{prefix}{n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}
