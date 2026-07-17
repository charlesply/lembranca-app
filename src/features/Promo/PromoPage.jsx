// Pagina standalone de PROMO RECOVERY — aberta em /promo/:id.
//
// Quem chega aqui: leads que abandonaram a previa nas ultimas 48h e
// receberam o email da campanha (promo_recovery_jun26). Oferta unica:
// R$19,90 com video lyric incluso (plano `promo_recovery_jun26` no backend).
//
// UX:
//   1. Countdown 30min (visual de urgencia, backend NAO bloqueia depois)
//   2. Player da previa em destaque
//   3. Caixa do preco: ~~R$29,90~~ -> R$19,90 + video
//   4. Botao GIGANTE com cadeado 🔒 pra liberar
//   5. PIX gerado (QR + copia-cola) + polling de pagamento
//   6. Pos-pagamento: 2 audios full + card "video sendo produzido"
//   7. Polling de video -> renderiza <video> quando video_brinde_url aparece
//
// Reuso:
//   - createPix do feature Payment (mesmo endpoint /api/pay/create)
//   - usePixPolling do feature Payment
//   - fetchOrderStatus do feature Delivery
//   - estetica/tokens do PaymentPage (cores #CC785C, #fef9f5)
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchOrderStatus } from '../Delivery/api/deliveryService'
import { createPix } from '../Payment/api/paymentService'
import { usePixPolling } from '../Payment/hooks/usePixPolling'
import PreviewPlayer from '../Payment/components/PreviewPlayer'
import { safeFilename } from '../../core/utils'

const PROMO_PLAN_KEY = 'promo_recovery_jun26'
const PROMO_PRICE = 19.90
const PROMO_ORIGINAL_PRICE = 29.90
const COUNTDOWN_MS = 30 * 60 * 1000 // 30 minutos
const VIDEO_POLL_MS = 15000
const VIDEO_MAX_TICKS = 60 // 60 x 15s = 15 min

function formatCountdown(ms) {
  if (ms <= 0) return '00:00'
  const totalSec = Math.floor(ms / 1000)
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const ss = String(totalSec % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function PromoPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [order, setOrder] = useState(null)
  const [err, setErr] = useState(null)
  const [pix, setPix] = useState(null)
  const [loadingPix, setLoadingPix] = useState(false)
  const payRef = useRef(null) // rola até o preço quando a prévia bate 0:50
  const [copied, setCopied] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [startedAt] = useState(() => Date.now())

  // 1) Carrega dados da order
  useEffect(() => {
    if (!id) { setErr('Link inválido — verifique a URL.'); return }
    fetchOrderStatus(id).then(o => {
      if (!o) { setErr('Não conseguimos carregar seu pedido. Confirma o link com a gente.'); return }
      setOrder(o)
      // Se já pagou, vai direto pra unlocked
      if (o.status === 'paid' || o.paid_at) {
        setUnlocked(true)
      }
    })
  }, [id])

  // 2) Tick do countdown (1s) — só visual, não bloqueia compra
  useEffect(() => {
    if (unlocked) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [unlocked])

  const countdownMs = useMemo(() => {
    const elapsed = now - startedAt
    return Math.max(0, COUNTDOWN_MS - elapsed)
  }, [now, startedAt])
  const expired = countdownMs <= 0

  // 3) Polling de pagamento (hook isolado, mesma lógica do PaymentPage)
  usePixPolling({
    orderId: id,
    hasPix: !!pix && !unlocked,
    onPaid: async () => {
      setConfirming(true)
      // Pequeno delay pra dar feedback visual antes de revelar mídia
      setTimeout(async () => {
        // Refetch pra pegar full_audio_urls atualizado
        const o = await fetchOrderStatus(id)
        if (o) setOrder(o)
        setUnlocked(true)
        setConfirming(false)
      }, 1500)
    },
  })

  // 4) Polling de vídeo (post-paid, plano com video, sem video ainda)
  useEffect(() => {
    if (!unlocked || !id) return
    const needsVideo = !order?.video_brinde_url
    if (!needsVideo) return
    let ticks = 0
    const t = setInterval(async () => {
      ticks++
      try {
        const o = await fetchOrderStatus(id)
        if (o && o.video_brinde_url) {
          setOrder(o)
          clearInterval(t)
          return
        }
      } catch (_) {}
      if (ticks >= VIDEO_MAX_TICKS) clearInterval(t)
    }, VIDEO_POLL_MS)
    return () => clearInterval(t)
  }, [unlocked, id, order?.video_brinde_url])

  const generatePix = useCallback(async () => {
    if (!id) return
    setLoadingPix(true); setPix(null); setCopied(false)
    try {
      const data = await createPix(id, PROMO_PLAN_KEY)
      if (!data?.brCode) throw new Error('falha')
      setPix({ brCode: data.brCode, brCodeBase64: data.brCodeBase64, expiresAt: data.expiresAt })
    } catch (e) {
      setErr('Não conseguimos gerar o PIX agora. Tenta de novo em alguns segundos.')
    } finally {
      setLoadingPix(false)
    }
  }, [id])

  const copyPix = async () => {
    if (!pix?.brCode) return
    try {
      await navigator.clipboard.writeText(pix.brCode)
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = pix.brCode; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch (_) {}
      document.body.removeChild(ta)
    }
  }

  if (err) return <Shell><div className="pr-err">{err}</div></Shell>
  if (!order) return <Shell><div className="pr-loading">Carregando sua oferta…</div></Shell>

  const honoree = order.honoree_name || 'sua pessoa especial'
  const preview = order.preview_audio_url
  const audios = (Array.isArray(order.full_audio_urls) ? order.full_audio_urls : []).filter(Boolean)
  const video = order.video_brinde_url

  // ─────────────────────────────────────────────────────────────────────
  // RENDER POS-PAGAMENTO (unlocked)
  // ─────────────────────────────────────────────────────────────────────
  if (unlocked) {
    return (
      <Shell>
        <div className="pr-card">
          <div className="pr-success-banner">
            <div className="pr-success-check">✅</div>
            <div>
              <strong>Pagamento confirmado!</strong>
              <span>Sua música para {honoree} está liberada 💛</span>
            </div>
          </div>

          {audios.length > 0 ? (
            audios.map((url, i) => {
              const filename = safeFilename(honoree, 'mp3', audios.length > 1 ? `v${i+1}` : '')
              return (
                <section key={url} className="pr-section">
                  <h2>🎧 Música {audios.length > 1 ? `— Versão ${i + 1}` : ''}</h2>
                  <audio controls preload="metadata" src={url} style={{ width: '100%' }} />
                  <a className="pr-btn pr-btn-primary" href={url} download={filename}
                     style={{ marginTop: 12 }}>
                    ⬇ Baixar MP3
                  </a>
                </section>
              )
            })
          ) : (
            <section className="pr-section">
              <p className="pr-hint">Carregando suas versões… atualizando em alguns instantes.</p>
            </section>
          )}

          {video ? (
            <section className="pr-section">
              <h2>🎬 Vídeo com a letra</h2>
              <video controls preload="metadata" src={video} playsInline
                     style={{ width: '100%', borderRadius: 12, background: '#000' }} />
              <a className="pr-btn pr-btn-primary" href={video} download={safeFilename(honoree, 'mp4')}
                 style={{ marginTop: 12 }}>
                ⬇ Baixar MP4
              </a>
            </section>
          ) : (
            <section className="pr-section">
              <h2>🎬 Vídeo com a letra</h2>
              <div className="pr-producing">
                <div className="pr-producing-icon">🎬</div>
                <div className="pr-producing-text">
                  <strong>Seu vídeo está sendo produzido</strong>
                  <span>Em até 10 minutos ele aparece aqui automaticamente — não precisa atualizar 💛</span>
                </div>
              </div>
            </section>
          )}

          <p className="pr-footer">
            Lembrança Cantada · Feito com carinho 💛
          </p>
        </div>
      </Shell>
    )
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER PRE-PAGAMENTO (oferta + previa + botao + PIX)
  // ─────────────────────────────────────────────────────────────────────
  return (
    <Shell>
      <div className="pr-card">
        <div className="pr-emoji">🎵</div>

        <div className="pr-countdown">
          <div className="pr-countdown-label">
            <span className="pr-countdown-pulse" />
            {expired ? 'Oferta encerrando' : 'Oferta termina em'}
          </div>
          <div className="pr-countdown-time">{formatCountdown(countdownMs)}</div>
        </div>

        <h1 className="pr-title">Sua música para <span>{honoree}</span> ficou linda 💛</h1>
        <p className="pr-subtitle">
          Sua prévia está pronta. Hoje preparei uma condição especial:<br/>
          <strong>2 versões da música + vídeo lyric</strong> pelo preço só da música.
        </p>

        {preview && (
          <section className="pr-section pr-section-preview">
            <h2>🎧 Ouça sua prévia</h2>
            {/* Player custom com teto rígido 0:50 (o <audio> nativo deixava ouvir
                a música inteira no iOS arrastando a barra). Ao bater, rola pro preço. */}
            <PreviewPlayer src={preview} maxSec={50}
              onCap={() => { try { payRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (_) {} }} />
            <p className="pr-hint">A versão final é mais longa, em alta qualidade e sem marca d'água.</p>
          </section>
        )}

        {!pix && !confirming && (
          <>
            <div className="pr-price-box" ref={payRef}>
              <div className="pr-price-strike">De R$ {PROMO_ORIGINAL_PRICE.toFixed(2).replace('.', ',')}</div>
              <div className="pr-price-main">R$ {PROMO_PRICE.toFixed(2).replace('.', ',')}</div>
              <div className="pr-price-includes">
                <div>🎵 As <strong>2 versões completas</strong> da música</div>
                <div>🎬 <strong>+ vídeo lyric</strong> com a letra passando <em>(grátis hoje)</em></div>
              </div>
            </div>

            <button className="pr-cta-btn" onClick={generatePix} disabled={loadingPix}>
              {loadingPix
                ? <>Gerando PIX…</>
                : <><span className="pr-cta-lock">🔒</span><span>Liberar minha música por R$ 19,90</span></>}
            </button>
            <p className="pr-cta-hint">Pagamento por PIX · libera na hora</p>
          </>
        )}

        {pix && !confirming && (
          <section className="pr-section">
            <h2>💳 PIX gerado — pague no app do banco</h2>
            <div className="pr-pix-status">
              <span className="pr-spinner" /> Detectamos o pagamento automaticamente — pode pagar com tranquilidade.
            </div>
            {pix.brCodeBase64 && (
              <div className="pr-qr-wrap">
                <img src={pix.brCodeBase64} alt="QR code PIX" className="pr-qr" />
              </div>
            )}
            <div className="pr-brcode">{pix.brCode}</div>
            <div className="pr-btn-row">
              <button className="pr-btn pr-btn-primary" onClick={copyPix}>
                {copied ? '✓ Copiado!' : '📋 Copiar código PIX'}
              </button>
              <button className="pr-btn pr-btn-ghost" onClick={generatePix}>
                Gerar novo
              </button>
            </div>
            <ol className="pr-steps">
              <li>Abra o app do seu banco</li>
              <li>Vá em <strong>PIX → Pagar/Copia e Cola</strong></li>
              <li>Cole o código acima e confirme</li>
              <li>Volte aqui — a página libera tudo sozinha 💛</li>
            </ol>
          </section>
        )}

        {confirming && (
          <section className="pr-section pr-section-success">
            <div className="pr-check">✅</div>
            <h2 style={{ textAlign: 'center', margin: '0 0 8px' }}>Pagamento recebido!</h2>
            <p className="pr-hint" style={{ textAlign: 'center' }}>
              Liberando sua música e vídeo agora…
            </p>
          </section>
        )}

        <p className="pr-footer">
          Lembrança Cantada · Feito com carinho 💛
        </p>
      </div>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="pr-shell">
      <style>{`
        @keyframes pr-spin { to { transform: rotate(360deg); } }
        @keyframes pr-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .55; transform: scale(.9); } }
        @keyframes pr-pulse-box { 0%,100% { box-shadow: 0 8px 22px rgba(22,163,74,0.32), 0 0 0 0 rgba(34,197,94,0.55); transform: scale(1); } 50% { box-shadow: 0 8px 22px rgba(22,163,74,0.32), 0 0 0 12px rgba(34,197,94,0); transform: scale(1.015); } }
        .pr-shell {
          min-height: 100vh;
          background: linear-gradient(180deg, #fef9f5 0%, #fff 100%);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 24px 16px 48px;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #2b1d14;
        }
        .pr-card {
          width: 100%; max-width: 560px;
          background: #fff;
          border: 1px solid #f3e5d8;
          border-radius: 20px;
          padding: 32px 24px;
          box-shadow: 0 12px 40px rgba(204, 120, 92, 0.08);
        }
        .pr-emoji { font-size: 48px; text-align: center; margin-bottom: 8px; }

        .pr-countdown {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          background: linear-gradient(180deg,#fff1f1,#ffe5e5);
          color: #dc2626; border: 1px solid #fecaca;
          padding: 14px 20px; border-radius: 16px;
          margin: 0 auto 20px; max-width: 280px;
          box-shadow: 0 4px 14px rgba(220,38,38,0.15);
        }
        .pr-countdown-label {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 12px; font-weight: 700; letter-spacing: 0.4px;
          text-transform: uppercase; color: #dc2626;
        }
        .pr-countdown-pulse {
          display: inline-block; width: 9px; height: 9px;
          border-radius: 50%; background: #dc2626;
          animation: pr-pulse 1.2s ease-in-out infinite;
          box-shadow: 0 0 0 0 rgba(220,38,38,0.6);
        }
        .pr-countdown-time {
          font-variant-numeric: tabular-nums;
          font-size: 38px; font-weight: 800; line-height: 1;
          color: #dc2626; letter-spacing: -0.5px;
        }

        .pr-title { font-size: 26px; margin: 0 0 12px; text-align: center; font-weight: 700; line-height: 1.25; }
        .pr-title span { color: #CC785C; }
        .pr-subtitle { text-align: center; color: #7a6354; margin: 0 0 28px; font-size: 15px; line-height: 1.55; }
        .pr-subtitle strong { color: #2b1d14; }

        .pr-section { margin: 20px 0; padding: 20px; background: #fdfaf6; border-radius: 14px; border: 1px solid #f6ede2; }
        .pr-section h2 { font-size: 16px; margin: 0 0 12px; font-weight: 600; color: #2b1d14; }
        .pr-section-preview { background: linear-gradient(180deg,#fffaf6,#fdfaf6); border-color: #f0d8c4; }
        .pr-section-success { background: #eef9f0; border-color: #c8e6cf; }
        .pr-hint { font-size: 13px; color: #7a6354; line-height: 1.5; margin: 8px 0 0; }

        .pr-price-box {
          background: linear-gradient(180deg,#fff7f1,#fff);
          border: 2px solid #f0d8c4;
          border-radius: 16px;
          padding: 22px 18px;
          text-align: center;
          margin: 20px 0 16px;
        }
        .pr-price-strike {
          font-size: 15px; color: #a09080; text-decoration: line-through; margin-bottom: 4px;
        }
        .pr-price-main {
          font-size: 44px; font-weight: 800; color: #CC785C; line-height: 1.05; margin-bottom: 10px;
        }
        .pr-price-includes {
          font-size: 14px; color: #5a4a3e; line-height: 1.8;
        }
        .pr-price-includes strong { color: #2b1d14; }

        .pr-cta-btn {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          width: 100%; padding: 20px 18px; border-radius: 14px;
          font-family: inherit; font-weight: 800; font-size: 18px;
          cursor: pointer; border: none; box-sizing: border-box;
          background: linear-gradient(180deg,#22c55e,#16a34a);
          color: #fff;
          letter-spacing: .3px;
          transition: opacity .15s, filter .15s;
          animation: pr-pulse-box 1.8s ease-in-out infinite;
          transform-origin: center;
        }
        .pr-cta-btn:hover { filter: brightness(1.05); }
        .pr-cta-btn:active { transform: scale(0.99); animation: none; }
        .pr-cta-btn:disabled { opacity: .65; cursor: wait; animation: none; }
        .pr-cta-lock { font-size: 20px; }
        .pr-cta-hint { text-align: center; font-size: 12px; color: #a09080; margin: 10px 0 0; }

        .pr-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 14px 18px; border-radius: 12px;
          font-family: inherit; font-weight: 700; font-size: 15px;
          cursor: pointer; border: none; box-sizing: border-box;
          transition: opacity .15s, transform .1s;
        }
        .pr-btn:hover { opacity: .92; }
        .pr-btn:active { transform: translateY(1px); }
        .pr-btn-primary { background: #CC785C; color: #fff; box-shadow: 0 6px 16px rgba(204,120,92,.2); }
        .pr-btn-ghost { background: #fff; color: #7a6354; border: 1px solid #f3e5d8; }
        .pr-btn-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
        .pr-btn-row .pr-btn { flex: 1 1 180px; }

        .pr-pix-status {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px; background: #fff8ef;
          border: 1px solid #f7e4cf; border-radius: 10px;
          font-size: 13px; color: #8a5a2b; margin-bottom: 14px;
        }
        .pr-spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid #f0bf85; border-top-color: #8a5a2b;
          border-radius: 50%; animation: pr-spin .7s linear infinite;
        }
        .pr-qr-wrap { display: flex; justify-content: center; padding: 14px; background: #fff; border-radius: 12px; margin-bottom: 12px; }
        .pr-qr { width: 240px; height: 240px; image-rendering: pixelated; }
        .pr-brcode {
          font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.4;
          background: #fff; padding: 12px; border-radius: 10px;
          border: 1px solid #f3e5d8; word-break: break-all; color: #5a4434;
          max-height: 110px; overflow-y: auto; margin-bottom: 10px;
        }
        .pr-steps { margin: 14px 0 0; padding: 0 0 0 20px; font-size: 14px; color: #5a4434; line-height: 1.7; }
        .pr-steps li { margin-bottom: 4px; }

        .pr-check { font-size: 56px; text-align: center; margin: 4px 0 8px; }

        .pr-success-banner {
          display: flex; align-items: center; gap: 14px;
          padding: 18px 16px;
          background: #eef9f0; border: 1px solid #c8e6cf; border-radius: 14px;
          margin-bottom: 24px;
        }
        .pr-success-check { font-size: 36px; }
        .pr-success-banner strong {
          display: block; color: #1a6b35; font-size: 16px; font-weight: 700;
        }
        .pr-success-banner span {
          display: block; color: #2c8851; font-size: 13px; line-height: 1.5;
        }

        .pr-producing {
          background: #fff;
          border: 1px dashed #ecc8b6;
          border-radius: 12px;
          padding: 22px 18px;
          display: flex; align-items: center; gap: 16px;
        }
        .pr-producing-icon {
          width: 54px; height: 54px; border-radius: 50%;
          background: linear-gradient(135deg, #fdf0e8, #fae0d0);
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; flex-shrink: 0; position: relative;
        }
        .pr-producing-icon::after {
          content: ''; position: absolute; inset: -4px; border-radius: 50%;
          border: 2px solid #CC785C; border-top-color: transparent;
          animation: pr-spin 1.4s linear infinite;
        }
        .pr-producing-text { flex: 1; min-width: 0; }
        .pr-producing-text strong {
          display: block; color: #2b1d14; font-size: 15px; font-weight: 700; margin-bottom: 4px;
        }
        .pr-producing-text span {
          font-size: 13px; color: #7a6354; line-height: 1.5;
        }

        .pr-loading, .pr-err {
          text-align: center; padding: 80px 24px; color: #7a6354; font-size: 16px;
        }
        .pr-err { color: #b04a30; }
        .pr-footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #f3e5d8; color: #a09080; font-size: 13px; }
      `}</style>
      {children}
    </div>
  )
}
