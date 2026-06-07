// Pagina de entrega standalone — abre quando a URL e /p/:id.
// Mostra TODAS as versoes do audio (full_audio_urls) + video + downloads
// + botao "Compartilhar pelo WhatsApp" em cada item.
import React, { useEffect, useState } from 'react'

const API_URL = 'https://suno-api-novo.bvph.uk'

function getOrderId() {
  const m = window.location.pathname.match(/^\/p\/([a-f0-9-]{8,})/i)
  return m ? m[1] : null
}

function safeFilename(name, ext, suffix) {
  const clean = String(name || 'musica')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)
  return `Para_${clean || 'voce'}${suffix ? '_' + suffix : ''}.${ext}`
}

// Abre o WhatsApp ja com a URL pre-preenchida — o user escolhe o contato/grupo.
// wa.me sem numero = seletor de contato; com numero = vai direto pra conversa.
function shareUrl(url, label) {
  const text = `${label}\n\n${url}`
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
}

export default function DeliveryPage() {
  const id = getOrderId()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!id) { setErr('Link inválido. Verifique a URL.'); return }
    fetch(`${API_URL}/api/order/${id}/status`)
      .then(r => r.ok ? r.json() : Promise.reject(`${r.status}`))
      .then(setData)
      .catch(() => setErr('Não conseguimos carregar seu pedido. Tente atualizar a página.'))
  }, [id])

  if (err) return <Shell><div className="dp-err">{err}</div></Shell>
  if (!data) return <Shell><div className="dp-loading">Carregando sua música…</div></Shell>

  // Monta lista de audios: full_audio_urls (1 ou 2 itens) + fallback p/ original
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

        {audios.map((url, i) => (
          <section key={url} className="dp-section">
            <h2>🎧 Música {audios.length > 1 ? `— Versão ${i + 1}` : ''}</h2>
            <audio controls preload="metadata" src={url} style={{ width: '100%' }} />
            <div className="dp-btn-row">
              <a className="dp-btn dp-btn-primary"
                 href={url}
                 download={safeFilename(honoree, 'mp3', audios.length > 1 ? `v${i+1}` : '')}>
                ⬇ Baixar MP3
              </a>
              <a className="dp-btn dp-btn-wa"
                 href={shareUrl(url, `🎵 Música para ${honoree}${audios.length > 1 ? ' (Versão ' + (i+1) + ')' : ''}`)}
                 target="_blank" rel="noopener noreferrer">
                <WaIcon /> Compartilhar pelo WhatsApp
              </a>
            </div>
          </section>
        ))}

        {video && (
          <section className="dp-section">
            <h2>🎬 Vídeo com a letra</h2>
            <video controls preload="metadata" src={video} playsInline style={{ width: '100%', borderRadius: 12 }} />
            <div className="dp-btn-row">
              <a className="dp-btn dp-btn-primary"
                 href={video}
                 download={safeFilename(honoree, 'mp4')}>
                ⬇ Baixar MP4
              </a>
              <a className="dp-btn dp-btn-wa"
                 href={shareUrl(video, `🎬 Vídeo da música para ${honoree}`)}
                 target="_blank" rel="noopener noreferrer">
                <WaIcon /> Compartilhar pelo WhatsApp
              </a>
            </div>
          </section>
        )}

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

function Shell({ children }) {
  return (
    <div className="dp-shell">
      <style>{`
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
          text-decoration: none;
          padding: 12px 16px; border-radius: 10px; font-weight: 600;
          text-align: center; box-sizing: border-box;
          transition: opacity .15s, transform .1s;
          font-size: 14px;
        }
        .dp-btn:hover { opacity: .92; }
        .dp-btn:active { transform: translateY(1px); }
        .dp-btn-primary { background: #CC785C; color: #fff; }
        .dp-btn-wa { background: #25D366; color: #fff; }
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
