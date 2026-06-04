import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Histórias Cantadas · Reveal — fade + slide ao entrar na viewport (stagger via delay). Respeita reduced-motion. */
export function Reveal({ children, delay = 0, y = 16 }: { children: ReactNode; delay?: number; y?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } });
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(' + y + 'px)', transition: 'opacity .5s var(--c-ease-out, cubic-bezier(.16,1,.3,1)) ' + delay + 'ms, transform .5s var(--c-ease-out, cubic-bezier(.16,1,.3,1)) ' + delay + 'ms' }}>
      {children}
    </div>
  );
}
