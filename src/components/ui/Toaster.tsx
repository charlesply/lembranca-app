import { useCallback, useRef, useState } from 'react';

/** Histórias Cantadas · Toaster — hook + host. Empilha no canto, slide-in, auto-dismiss, fechável.
 *  Uso: const { toast, Host } = useToaster();  toast('Salvo', 'success');
 *  Monte <Host /> uma vez na raiz do app. */
type Tone = 'success' | 'info' | 'warning' | 'danger';
interface Toast { id: number; title: string; description?: string; tone: Tone; duration: number; }

export function useToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((title: string, tone: Tone = 'info', opts?: { description?: string; duration?: number }) => {
    const id = ++seq.current;
    const duration = opts?.duration ?? 4000;
    setToasts((t) => [...t, { id, title, description: opts?.description, tone, duration }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
    return id;
  }, []);
  const tones: Record<Tone, string> = { success: 'var(--c-success)', info: 'var(--c-accent)', warning: 'var(--c-warning)', danger: 'var(--c-danger)' };
  const Host = () => (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id} role="status" style={{ pointerEvents: 'auto', position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 280, maxWidth: 380, padding: '14px 16px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--c-radius-lg)', boxShadow: 'var(--c-shadow-lg)', overflow: 'hidden', animation: 'c-toast-in .32s cubic-bezier(.16,1,.3,1)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tones[t.tone], marginTop: 6, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: 14, color: 'var(--c-text)', fontWeight: 600 }}>{t.title}</strong>
            {t.description && <p style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--c-text-muted)' }}>{t.description}</p>}
          </div>
          <button type="button" aria-label="Fechar" onClick={() => dismiss(t.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          <span style={{ position: 'absolute', left: 0, bottom: 0, height: 2, background: tones[t.tone], animation: 'c-toast-bar ' + t.duration + 'ms linear forwards' }} />
        </div>
      ))}
    </div>
  );
  return { toast, dismiss, Host };
}
