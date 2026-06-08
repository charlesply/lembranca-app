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
import { useParams } from 'react-router-dom'
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
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [shareState, setShareState] = useState({})
  const setShare = (key, patch) => setShareState(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  useEffect(() => {
    if (!id) { setErr('Link inválido. Verifique a URL.'); return }
    fetchOrderStatus(id)
      .then(o => {
        if (o) setData(o)
        else setErr('Não conseguimos carregar seu pedido. Tente atualizar a página.')
      })
  }, [id])

  const videoPoster = useVideoPoster(data?.video_brinde_url)

  async function handleShare(key, url, filename, mimeType, label) {
    if (shareState[key]?.loading) return
    setShare(key, { loading: true, msg: null })
    try {
      if (!canShareFiles()) {
        downloadFile(url, filename)
        setShare(key, { loading: false, msg: 'Arquivo baixado! Abra o WhatsApp e anexe pelo clipe 📎' })
        return
      }
      const resp = await fetch(url, { credentials: 'omit' })
      if (!resp.ok) throw new Error('http ' + resp.status)
      const blob = await resp.blob()
      const file = new File([blob], filename, { type: mimeType })
      if (!navigator.canShare({ files: [file] })) {
        downloadFile(url, filename)
        setShare(key, { loading: false, msg: 'Arquivo baixado! Abra o WhatsApp e anexe pelo clipe 📎' })
        return
      }
      await navigator.share({ files: [file], title: label, text: label })
      setShare(key, { loading: false, msg: null })
    } catch (e) {
      if (e?.name === 'AbortError') {
        setShare(key, { loading: false, msg: null })
        return
      }
      console.warn('share failed, falling back to download:', e)
      try { downloadFile(url, filename) } catch (_) {}
      setShare(key, { loading: false, msg: 'Arquivo baixado! Abra o WhatsApp e anexe pelo clipe 📎' })
    }
  }

  if (err) return <Shell><div className="dp-err">{err}</div></Shell>
  if (!data) return <Shell><div className="dp-loading">Carregando sua música…</div></Shell>

  let audios = Array.isArray(data.full_audio_urls) ? data.full_audio_urls.filter(Boolean) : []
  if (!audios.length && data.original_audio_url) audios = [data.original_audio_url]
  if (!audios.length && data.preview_audio_url) audios = [data.preview_audio_url]

  const video = data.video_brinde_url
  const honoree = data.honoree_name || 'você'
  const paid = !!data.paid_at

  return (
    <Shell>
      <div className="dp-card">
        <div className="dp-emoji">🎵</div>
        <h1 className="dp-title">Sua música para <span>{honoree}</span></h1>
        <p className="dp-subtitle">
          {paid ? 'Pagamento confirmado — aproveite!' : 'Aqui está sua prévia.'}
        </p>

        {audios.map((url, i) => {
          const filename = safeFilename(honoree, 'mp3', audios.length > 1 ? `v${i+1}` : '')
          const label = `🎵 Música para ${honoree}${audios.length > 1 ? ' (Versão ' + (i+1) + ')' : ''}`
          const key = `audio-${i}`
          const st = shareState[key] || {}
          return (
            <section key={url} className="dp-section">
              <h2>🎧 Música {audios.length > 1 ? `— Versão ${i + 1}` : ''}</h2>
              <audio controls preload="metadata" src={url} style={{ width: '100%' }} />
              <div className="dp-btn-row">
                <a className="dp-btn dp-btn-primary" href={url} download={filename}>
                  ⬇ Baixar MP3
                </a>
                <button type="button" className="dp-btn dp-btn-wa"
                        disabled={st.loading}
                        onClick={() => handleShare(key, url, filename, 'audio/mpeg', label)}>
                  {st.loading
                    ? <><Spinner /> Preparando…</>
                    : <><WaIcon /> Compartilhar</>}
                </button>
              </div>
              {st.msg && <p className="dp-share-msg">{st.msg}</p>}
            </section>
          )
        })}

        {video && (() => {
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
        })()}

        {!audios.length && !video && (
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
      `}</style>
      {children}
    </div>
  )
}
