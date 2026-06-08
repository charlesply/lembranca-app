// PreviewCarousel — seção "Ouça trechos reais" da landing.
// Carrossel de vídeo + músicas reais, com auto-advance a cada 8s, dots
// e CTA "Criar a minha agora" que dispara scroll pro formulário.
//
// State, refs e handlers ficam dentro do componente (eram do App.jsx).
//
// Props:
//   - examples (array opcional): items {kind:'video'|'audio', title, meta, src, poster?}
//   - onScrollToForm (function): dispara scroll pro formulário do quiz
//   - active (bool, default true): pausa auto-advance quando false
//     (importante pra parar o timer quando a view sai da landing)
import { useState, useEffect, useRef } from 'react'
import { Pill } from '../../../components/ui/Pill'
import { IconMusic, IconPlay, IconPause, IconArrowRight } from '../../../core/icons'

// Waveform decorativa do song-cover (barras estáticas, sem animação JS).
const Waveform = () => {
  const heights = [30, 60, 45, 80, 55, 35, 70, 50, 65, 40, 75, 30]
  return (
    <div className="waveform">
      {heights.map((h, i) => <div key={i} className="wave-bar" style={{ height: `${h}%` }} />)}
    </div>
  )
}

// Exemplos default (vídeos + áudios reais de clientes).
const DEFAULT_EXAMPLES = [
  { kind: 'video', title: 'Cristiane para João Paulo', meta: 'Sertanejo · Romântica', src: '/assets/previa/previa-web.mp4', poster: '/assets/previa/previa-poster.jpg' },
  { kind: 'video', title: 'Para Edson', meta: 'Pagode · Homenagem', src: '/assets/previa/edson-web.mp4', poster: '/assets/previa/edson-poster.jpg' },
  { kind: 'audio', title: 'Para Beatriz', meta: 'Sertanejo', src: '/assets/musicas/m1.mp3' },
  { kind: 'audio', title: 'Para Camila', meta: 'Pop romântico', src: '/assets/musicas/m2.mp3' },
  { kind: 'audio', title: 'Para Daniel', meta: 'Pagode', src: '/assets/musicas/m3.mp3' },
  { kind: 'audio', title: 'Para Aldo', meta: 'MPB', src: '/assets/musicas/m4.mp3' },
  { kind: 'audio', title: 'Para Eduardo', meta: 'Gospel', src: '/assets/musicas/m5.mp3' },
  { kind: 'audio', title: 'Para Rafaela', meta: 'Sertanejo', src: '/assets/musicas/m6.mp3' },
  { kind: 'audio', title: 'Para Vanessa', meta: 'Forró', src: '/assets/musicas/m7.mp3' },
  { kind: 'audio', title: 'Para Yasmim', meta: 'Pop', src: '/assets/musicas/m8.mp3' },
]

export default function PreviewCarousel({
  examples = DEFAULT_EXAMPLES,
  onScrollToForm,
  active = true,
}) {
  const [previewIdx, setPreviewIdx] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const previewAudioRef = useRef(null)
  const previewVideoRef = useRef(null)

  const _stopPreview = () => {
    try { previewAudioRef.current && previewAudioRef.current.pause() } catch (_) {}
    try { previewVideoRef.current && previewVideoRef.current.pause() } catch (_) {}
    setPreviewPlaying(false)
  }
  const selectPreview = (idx) => { _stopPreview(); setPreviewIdx(idx) }
  const nextPreview = () => selectPreview((previewIdx + 1) % examples.length)
  const prevPreview = () => selectPreview((previewIdx - 1 + examples.length) % examples.length)
  const togglePreviewPlay = () => {
    const ex = examples[previewIdx]
    const el = ex.kind === 'video' ? previewVideoRef.current : previewAudioRef.current
    if (!el) return
    if (el.paused) { el.play().catch(() => {}) } else { el.pause() }
  }

  // auto-avança a cada 8s. Pausa quando tocando OU quando active=false
  // (caso do view !== 'landing' — não desperdiça timer rodando fora da tela).
  useEffect(() => {
    if (!active || previewPlaying) return
    const id = setInterval(() => setPreviewIdx(i => (i + 1) % examples.length), 8000)
    return () => clearInterval(id)
  }, [active, previewPlaying, examples.length])

  const current = examples[previewIdx]

  return (
    <section className="preview-showcase" id="examples">
      <div className="container preview-grid">
        <div className="preview-visual">
          <button className="carousel-arrow left" onClick={prevPreview} aria-label="Anterior">‹</button>
          {current.kind === 'video' ? (
            <video key={current.src} ref={previewVideoRef} className="preview-video"
              src={current.src} poster={current.poster}
              controls playsInline preload="none"
              onPlay={() => setPreviewPlaying(true)}
              onPause={() => setPreviewPlaying(false)}
              onEnded={() => setPreviewPlaying(false)} />
          ) : (
            <button className="song-cover" onClick={togglePreviewPlay}
              aria-label={previewPlaying ? 'Pausar' : 'Tocar'}>
              <div className="song-cover-art"><IconMusic s={38} /></div>
              <div className="song-cover-title">{current.title}</div>
              <div className="song-cover-meta">{current.meta}</div>
              <Waveform />
              <span className={`song-play${previewPlaying ? ' playing' : ''}`}>
                {previewPlaying ? <IconPause s={24} /> : <IconPlay s={24} />}
              </span>
            </button>
          )}
          <button className="carousel-arrow right" onClick={nextPreview} aria-label="Próximo">›</button>
          <audio ref={previewAudioRef}
            src={current.kind === 'audio' ? current.src : undefined}
            preload="none"
            onPlay={() => setPreviewPlaying(true)}
            onPause={() => setPreviewPlaying(false)}
            onEnded={() => setPreviewPlaying(false)} />
        </div>
        <div className="preview-copy">
          <Pill tone="accent">PRÉVIA GRATUITA</Pill>
          <h2 className="section-title">Ouça trechos reais</h2>
          <p className="section-subtitle" style={{ margin: '0 0 20px' }}>
            Músicas de clientes de verdade. Aperte o play e veja como fica emocionante — a sua vai ser assim, do seu jeito.
          </p>
          <button className="example-mini" onClick={togglePreviewPlay}>
            <span className="play-btn">{previewPlaying ? <IconPause s={16} /> : <IconPlay s={15} />}</span>
            <div className="player-info">
              <div className="player-title">{current.title}</div>
              <div className="player-meta">{current.meta}</div>
            </div>
          </button>
          <div className="carousel-dots">
            {examples.map((_, i) => (
              <button key={i}
                className={`dot${i === previewIdx ? ' active' : ''}`}
                onClick={() => selectPreview(i)}
                aria-label={`Exemplo ${i + 1}`} />
            ))}
          </div>
          <button className="btn-primary auto-width" onClick={onScrollToForm}>
            Criar a minha agora <IconArrowRight s={17} />
          </button>
        </div>
      </div>
    </section>
  )
}
