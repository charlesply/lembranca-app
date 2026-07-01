// Pagina de entrega standalone — aberta em /p/:id.
// Mostra TODAS as versoes do audio (full_audio_urls) + video + downloads
// + botao "Compartilhar" via Web Share API com arquivos (anexa midia nativa
// no WhatsApp). Fallback: baixa o arquivo e instrui a anexar manualmente.
//
// Migrada da raiz `src/DeliveryPage.jsx` pra `features/Delivery/` na Fase 5
// do refactor. Mudancas:
//   - getOrderId() regex removido — usa useParams() do react-router-dom
//   - safeFilename importado de core/utils (Fase 1)
//   - poster do video extraido pra hook useVideoPoster (limpa o componente)
//   - fetch de order foi pra api/deliveryService
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { safeFilename } from '../../core/utils'
import { useVideoPoster } from './hooks/useVideoPoster'
import { fetchOrderStatus } from './api/deliveryService'

// Detecta suporte a compartilhar arquivos via Web Share API.
// Em mobile (Android Chrome, iOS Safari 15+) compartilha o ARQUIVO direto
// pro WhatsApp (audio/video nativo). Em desktop costuma cair no fallback.
function canShareFiles() {
  try {
    if (!navigator.canShare) return false
    const probe = new File(['x'], 'probe.txt', { type: 'text/plain' })
    return navigator.canShare({ files: [probe] })
  } catch (_) { return false }
}

// Baixa o arquivo como fallback. User abre WhatsApp e anexa do Downloads.
function downloadFile(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export default function DeliveryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [shareState, setShareState] = useState({})
  const setShare = (key, patch) => setShareState(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  const [showOrig, setShowOrig] = useState(false) // originais recolhidas quando há novas

  useEffect(() => {
    if (!id) { setErr('Link inválido. Verifique a URL.'); return }
    fetchOrderStatus(id)
      .then(o => {
        if (!o) { setErr('Não conseguimos carregar seu pedido. Tente atualizar a página.'); return }
        // TRAVA anti-vazamento: /p/ é só ENTREGA (pago). Quem ainda NÃO pagou é
        // mandado pra /finalizar (prévia + planos) — nunca vê/baixa a música
        // completa antes de pagar. Espelha a PaymentPage (que faz pago → /p/).
        if (!o.paid_at && o.status !== 'paid' && o.status !== 'delivered') {
          navigate(`/finalizar/${id}`, { replace: true })
          return
        }
        setData(o)
      })
  }, [id, navigate])

  // Polling automatico do video pro plano COMPLETA enquanto nao chega.
  // Roda a cada 15s ate aparecer video_brinde_url OU passar 15 min (60 ticks).
  // Para imediatamente quando recebe a URL — sem reload, sem botao.
  useEffect(() => {
    if (!data || !id) return
    const needsVideo = !!data.paid_at && data.plan === 'completa' && !data.video_brinde_url
    if (!needsVideo) return
    let ticks = 0
    const MAX_TICKS = 60 // 60 x 15s = 15 min
    const t = setInterval(async () => {
      ticks++
      try {
        const o = await fetchOrderStatus(id)
        if (o && o.video_brinde_url) {
          setData(o)
          clearInterval(t)
          return
        }
      } catch (_) {}
      if (ticks >= MAX_TICKS) clearInterval(t)
    }, 15000)
    return () => clearInterval(t)
  }, [id, data?.paid_at, data?.plan, data?.video_brinde_url])

  // Auto-update do self-edit: enquanto a nova música é criada
  // (edit_status='regenerating'), polla até virar 'done' e mostra as novas.
  useEffect(() => {
    if (!data || !id || data.edit_status !== 'regenerating') return
    let ticks = 0
    const t = setInterval(async () => {
      ticks++
      try {
        const o = await fetchOrderStatus(id)
        if (o && o.edit_status && o.edit_status !== 'regenerating') { setData(o); clearInterval(t); return }
      } catch (_) {}
      if (ticks >= 80) clearInterval(t) // 80 x 15s = 20 min
    }, 15000)
    return () => clearInterval(t)
  }, [id, data?.edit_status])

  const videoPoster = useVideoPoster(data?.video_brinde_url)

  // Cadeia de fallback IGUAL ao ShareButton de Minhas Músicas (que funciona de 1ª):
  // 1) tenta anexar o FILE; 2) se falhar (perdeu o gesto do usuário após o fetch),
  // compartilha só a URL; 3) por fim copia o link. Nunca cai em "download manual"
  // como caminho principal — era isso que exigia vários cliques aqui no /p/.
  async function handleShare(key, url, filename, mimeType, label) {
    if (shareState[key]?.loading) return
    setShare(key, { loading: true, msg: null })
    const text = 'Olha a música que eu fiz para você ❤️'
    let shared = false, copied = false
    try {
      // 1) FILE (melhor no mobile — anexa direto no WhatsApp)
      try {
        const resp = await fetch(url, { credentials: 'omit' })
        if (resp.ok) {
          const blob = await resp.blob()
          const file = new File([blob], filename, { type: mimeType || blob.type })
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: label, text })
            shared = true
          }
        }
      } catch (e) { if (e?.name === 'AbortError') shared = true }
      // 2) URL (rápido, sem fetch)
      if (!shared && navigator.share) {
        try { await navigator.share({ title: label, text, url }); shared = true }
        catch (e) { if (e?.name === 'AbortError') shared = true }
      }
      // 3) copia o link
      if (!shared) { try { await navigator.clipboard.writeText(url); copied = true } catch (_) {} }
    } finally {
      setShare(key, { loading: false, msg: copied ? 'Link copiado! Cole no WhatsApp 💛' : null })
    }
  }

  if (err) return <Shell><div className="dp-err">{err}</div></Shell>
  if (!data) return <Shell><div className="dp-loading">Carregando sua música…</div></Shell>

  let newAudios = Array.isArray(data.full_audio_urls) ? data.full_audio_urls.filter(Boolean) : []
  if (!newAudios.length && data.original_audio_url) newAudios = [data.original_audio_url]
  if (!newAudios.length && data.preview_audio_url) newAudios = [data.preview_audio_url]
  // Se o cliente ajustou a música (self-edit), prev_audio_urls guarda as 2
  // ORIGINAIS e full_audio_urls as 2 NOVAS → mostramos as 4, rotuladas.
  const prevAudios = Array.isArray(data.prev_audio_urls) ? data.prev_audio_urls.filter(Boolean) : []
  // Só rotula "originais vs novas" quando a nova música já ficou pronta — durante
  // a regeneração o full_audio_urls ainda é o antigo (evita mostrar 2x igual).
  const regenerating = data.edit_status === 'regenerating'
  const hasEdit = prevAudios.length > 0 && !regenerating
  const multi = newAudios.length > 1
  const honoree = data.honoree_name || 'você'
  // Listas: NOVAS em destaque; ORIGINAIS recolhidas atrás do toggle.
  const newList = newAudios.map((url, i) => ({ url, grp: hasEdit ? 'Nova' : '', n: i + 1 }))
  const origList = hasEdit ? prevAudios.map((url, i) => ({ url, grp: 'Original', n: i + 1 })) : []

  // Renderiza uma faixa de áudio (player + baixar + compartilhar).
  const renderAudio = (a) => {
    const url = a.url
    const vtag = a.grp === 'Original' ? `original-v${a.n}` : a.grp === 'Nova' ? `nova-v${a.n}` : (multi ? `v${a.n}` : '')
    const filename = safeFilename(honoree, 'mp3', vtag)
    const heading = a.grp === 'Original' ? `🎵 Versão original ${a.n}` : a.grp === 'Nova' ? `✨ Versão nova ${a.n}` : `🎧 Música ${multi ? '— Versão ' + a.n : ''}`
    const label = `🎵 Música para ${honoree}` + (a.grp ? ` (${a.grp} ${a.n})` : (multi ? ` (Versão ${a.n})` : ''))
    const key = a.grp === 'Original' ? `orig-${a.n}` : `audio-${a.n}`
    const st = shareState[key] || {}
    return (
      <section key={key} className="dp-section">
        <h2>{heading}</h2>
        <audio controls preload="metadata" src={url} style={{ width: '100%' }} />
        <div className="dp-btn-row">
          <a className="dp-btn dp-btn-primary" href={url} download={filename}>⬇ Baixar MP3</a>
          <button type="button" className="dp-btn dp-btn-wa" disabled={st.loading}
                  onClick={() => handleShare(key, url, filename, 'audio/mpeg', label)}>
            {st.loading ? <><Spinner /> Preparando…</> : <><WaIcon /> Compartilhar</>}
          </button>
        </div>
        {st.msg && <p className="dp-share-msg">{st.msg}</p>}
      </section>
    )
  }

  const video = data.video_brinde_url
  const paid = !!data.paid_at

  return (
    <Shell>
      <div className="dp-card">
        <div className="dp-emoji">🎵</div>
        <h1 className="dp-title">Sua música para <span>{honoree}</span></h1>
        <p className="dp-subtitle">
          {paid ? 'Pagamento confirmado — aproveite!' : 'Aqui está sua prévia.'}
        </p>

        {regenerating && (
          <div className="dp-regen">🎼 <b>Sua nova música está sendo criada</b> — fica pronta em 5 a 10 minutinhos e aparece aqui sozinha. Enquanto isso, suas versões atuais continuam abaixo 💛</div>
        )}

        {/* NOVAS em destaque (ou versões normais quando não houve edição) */}
        {newList.map(renderAudio)}

        {video ? (() => {
          const filename = safeFilename(honoree, 'mp4')
          const label = `🎬 Vídeo da música para ${honoree}`
          const key = 'video'
          const st = shareState[key] || {}
          return (
            <section className="dp-section">
              <h2>🎬 Vídeo com a letra</h2>
              <video controls preload="metadata" src={video} playsInline
                     poster={videoPoster || undefined}
                     style={{ width: '100%', borderRadius: 12, background: '#000' }} />
              <div className="dp-btn-row">
                <a className="dp-btn dp-btn-primary" href={video} download={filename}>
                  ⬇ Baixar MP4
                </a>
                <button type="button" className="dp-btn dp-btn-wa"
                        disabled={st.loading}
                        onClick={() => handleShare(key, video, filename, 'video/mp4', label)}>
                  {st.loading
                    ? <><Spinner /> Preparando…</>
                    : <><WaIcon /> Compartilhar</>}
                </button>
              </div>
              {st.msg && <p className="dp-share-msg">{st.msg}</p>}
            </section>
          )
        })() : (paid && data.plan === 'completa') && (
          <section className="dp-section">
            <h2>🎬 Vídeo com a letra</h2>
            <div className="dp-video-producing">
              <div className="dp-video-producing-icon">🎬</div>
              <div className="dp-video-producing-text">
                <strong>Seu vídeo está sendo produzido</strong>
                <span>Ficará pronto em até 10 minutos. Te avisamos aqui assim que terminar 💛</span>
              </div>
            </div>
          </section>
        )}

        {/* Versões ORIGINAIS recolhidas — o cliente vê as novas primeiro */}
        {origList.length > 0 && (
          <>
            <button type="button" className="dp-orig-toggle" onClick={() => setShowOrig(v => !v)}>
              {showOrig ? '▾' : '▸'} Versões originais ({origList.length})
            </button>
            {showOrig && origList.map(renderAudio)}
          </>
        )}

        {!newList.length && !video && (
          <p className="dp-subtitle" style={{ marginTop: 24 }}>
            Sua música ainda está sendo gerada. Volte em alguns minutos.
          </p>
        )}

        <p className="dp-footer">
          Lembrança Cantada · Feito com carinho 💛
        </p>
      </div>
    </Shell>
  )
}

function WaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: 6 }}>
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  )
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 14,
      border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
      borderRadius: '50%', marginRight: 8, animation: 'dp-spin 0.7s linear infinite',
    }} />
  )
}

function Shell({ children }) {
  return (
    <div className="dp-shell">
      <style>{`
        @keyframes dp-spin { to { transform: rotate(360deg); } }
        .dp-shell {
          min-height: 100vh;
          background: linear-gradient(180deg, #fef9f5 0%, #fff 100%);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 24px 16px 48px;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #2b1d14;
        }
        .dp-card {
          width: 100%; max-width: 560px;
          background: #fff;
          border: 1px solid #f3e5d8;
          border-radius: 20px;
          padding: 32px 24px;
          box-shadow: 0 12px 40px rgba(204, 120, 92, 0.08);
        }
        .dp-emoji { font-size: 48px; text-align: center; margin-bottom: 12px; }
        .dp-title { font-size: 26px; margin: 0 0 8px; text-align: center; font-weight: 700; line-height: 1.25; }
        .dp-title span { color: #CC785C; }
        .dp-subtitle { text-align: center; color: #7a6354; margin: 0 0 28px; font-size: 15px; }
        .dp-regen { background: #fff5ee; border: 1px solid #f3d9c7; color: #7a5334; border-radius: 14px; padding: 14px 16px; margin: 0 0 24px; font-size: 14px; line-height: 1.5; text-align: center; }
        .dp-orig-toggle { width: 100%; margin: 20px 0 4px; padding: 13px 16px; background: #fdfaf6; border: 1px solid #f0e2d4; border-radius: 12px; color: #7a6354; font-size: 13px; font-weight: 700; text-align: left; cursor: pointer; }
        .dp-orig-toggle:hover { border-color: #e3c9b3; }
        .dp-section { margin: 24px 0; padding: 20px; background: #fdfaf6; border-radius: 14px; border: 1px solid #f6ede2; }
        .dp-section h2 { font-size: 16px; margin: 0 0 12px; font-weight: 600; color: #2b1d14; }
        .dp-btn-row {
          display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;
        }
        .dp-btn {
          flex: 1 1 180px;
          display: inline-flex; align-items: center; justify-content: center;
          text-decoration: none; border: none; cursor: pointer;
          padding: 12px 16px; border-radius: 10px; font-weight: 600;
          text-align: center; box-sizing: border-box;
          transition: opacity .15s, transform .1s;
          font-size: 14px; font-family: inherit;
        }
        .dp-btn:hover { opacity: .92; }
        .dp-btn:active { transform: translateY(1px); }
        .dp-btn:disabled { opacity: .65; cursor: wait; }
        .dp-btn-primary { background: #CC785C; color: #fff; }
        .dp-btn-wa { background: #25D366; color: #fff; }
        .dp-share-msg {
          margin: 10px 0 0; padding: 10px 12px;
          background: #eef9f0; border: 1px solid #c8e6cf;
          border-radius: 10px; font-size: 13px; color: #1a6b35;
          line-height: 1.45;
        }
        .dp-loading, .dp-err {
          text-align: center; padding: 80px 24px; color: #7a6354; font-size: 16px;
        }
        .dp-err { color: #b04a30; }
        .dp-footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #f3e5d8; color: #a09080; font-size: 13px; }
        .dp-video-producing {
          background: #fff;
          border: 1px dashed #ecc8b6;
          border-radius: 12px;
          padding: 22px 18px;
          display: flex; align-items: center; gap: 16px;
        }
        .dp-video-producing-icon {
          width: 54px; height: 54px; border-radius: 50%;
          background: linear-gradient(135deg, #fdf0e8, #fae0d0);
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; flex-shrink: 0; position: relative;
        }
        .dp-video-producing-icon::after {
          content: ''; position: absolute; inset: -4px; border-radius: 50%;
          border: 2px solid #CC785C; border-top-color: transparent;
          animation: dp-spin 1.4s linear infinite;
          -webkit-animation: dp-spin 1.4s linear infinite;
        }
        .dp-video-producing-text { flex: 1; min-width: 0; }
        .dp-video-producing-text strong {
          display: block; color: #2b1d14; font-size: 15px; font-weight: 700; margin-bottom: 4px;
        }
        .dp-video-producing-text span {
          font-size: 13px; color: #7a6354; line-height: 1.5;
        }
      `}</style>
      {children}
    </div>
  )
}

