import { useRef, useState, useEffect } from 'react'

// Player de PRÉVIA com TETO RÍGIDO (maxSec) — usado nas telas de prévia NÃO-paga
// (/finalizar, promo). Diferente do <audio controls> nativo (que no iOS deixa
// arrastar a barra e ouvir a música inteira), aqui a barra é escalada só até o
// teto e o playback pausa/segura ao bater maxSec. Ao atingir o teto, chama onCap
// UMA vez (usado pra trazer o pagamento pra tela, igual o popup do checkout).
//
// A música por baixo é a completa (cdn1) — o corte é feito AQUI no player.
export default function PreviewPlayer({ src, maxSec = 50, onCap }) {
  const audioRef = useRef(null)
  const retryRef = useRef(0)
  const capFiredRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)

  // reset ao trocar de faixa
  useEffect(() => {
    const a = audioRef.current
    if (a) a.pause()
    setPlaying(false); setT(0); retryRef.current = 0; capFiredRef.current = false
  }, [src])

  // clamp no teto: pausa, segura em maxSec e dispara onCap 1x
  useEffect(() => {
    if (!maxSec || t < maxSec) return
    const a = audioRef.current
    if (a) a.pause()
    setPlaying(false); setT(maxSec)
    if (!capFiredRef.current) {
      capFiredRef.current = true
      try { onCap && onCap() } catch (_) {}
    }
  }, [t, maxSec, onCap])

  // retry se o cdn1 ainda não publicou o arquivo (lag pós-complete)
  const onAudioError = () => {
    const a = audioRef.current
    if (!a || retryRef.current >= 4) return
    retryRef.current++
    setTimeout(() => { try { a.load() } catch (_) {} }, 1500 * retryRef.current)
  }

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else {
      if (a.currentTime >= maxSec - 0.3) { a.currentTime = 0; setT(0); capFiredRef.current = false } // recomeça se parou no fim
      a.play().then(() => setPlaying(true)).catch(() => {})
    }
  }

  const seek = (e) => {
    const a = audioRef.current
    if (!a) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    a.currentTime = Math.max(0, Math.min(maxSec, pct * maxSec)) // seek clampado ao teto
  }

  const fmt = (s) => {
    if (!Number.isFinite(s)) return '0:00'
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }
  const pct = maxSec > 0 ? Math.min(100, (t / maxSec) * 100) : 0

  const C = '#C96240'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', background: '#fff', border: '1px solid #eaddd4', borderRadius: 14 }}>
      <button type="button" onClick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'}
        style={{ flex: '0 0 auto', width: 44, height: 44, borderRadius: '50%', border: 'none', background: C, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {playing
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3" /></svg>}
      </button>
      <div onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={maxSec} aria-valuenow={Math.round(t)}
        style={{ flex: '1 1 auto', height: 8, background: '#f0e6de', borderRadius: 5, cursor: 'pointer', position: 'relative' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: C, borderRadius: 5 }} />
      </div>
      <span style={{ flex: '0 0 auto', fontSize: 12.5, color: '#8a7969', fontVariantNumeric: 'tabular-nums' }}>{fmt(t)} / 0:{maxSec}</span>
      <audio ref={audioRef} src={src} preload="metadata"
        onTimeUpdate={e => setT(e.currentTarget.currentTime)}
        onError={onAudioError}
        onEnded={() => { setPlaying(false); setT(0) }} />
    </div>
  )
}
