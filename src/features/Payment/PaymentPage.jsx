// Pagina standalone de PAGAMENTO/FINALIZACAO — aberta em /finalizar/:id.
// Util pra:
//   1) Cliente que perdeu a tela do chat e quer voltar pro PIX
//   2) Recuperacao de carrinho via WhatsApp/email com link direto
//   3) Cobranca manual de orders preview_sent
//
// Migrada de src/PaymentPage.jsx pra features/Payment/ na Fase 6 do refactor.
// Mudancas:
//   - getOrderId() regex REMOVIDO -> useParams() do router
//   - fetchs centralizados em api/paymentService
//   - polling extraido pra hook usePixPolling
import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchOrderStatus, createPix } from './api/paymentService'
import { usePixPolling } from './hooks/usePixPolling'
import { getPriceVariant, isTestVariant, TEST_VARIANTS } from './constants'
// Self-edit: cliente ajusta a própria prévia (1×) antes de pagar — mesmo componente
// usado em Minhas Músicas / DeliveryPage.
import { MusicSelfEdit, MSE_ENABLED } from '../../components/MusicSelfEdit'

// Ordem importa: o primeiro fica em cima na UI. Completa e o destaque (badge
// "Mais escolhido") e o default pre-selecionado.
const CONTROL_PLANS = [
  {
    key: 'completa',
    label: 'Música + Vídeo (estilo Spotify)',
    price: 29.90,
    badge: 'Mais escolhido',
    detail: '2 versões da música + vídeo com a letra (perfeito pra postar)',
  },
  {
    key: 'musica',
    label: 'Só a Música',
    price: 19.90,
    badge: null,
    detail: '2 versões da música em alta qualidade pra você escolher',
  },
]

// Monta a lista de planos exibida conforme a variante do teste A/B.
// Teste (p37/p47/p67): plano ÚNICO música-only + 1 edição incluída, SEM vídeo.
function plansForVariant(variant) {
  if (isTestVariant(variant)) {
    const cfg = TEST_VARIANTS[variant]
    return [{
      key: cfg.planKey,
      label: 'Música personalizada',
      price: cfg.price,
      badge: null,
      detail: '2 versões da música em alta qualidade + 1 edição incluída caso queira ajustar a música',
    }]
  }
  return CONTROL_PLANS
}

export default function PaymentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [err, setErr] = useState(null)
  // Variante do teste A/B de preço — atribuída 1× por visitante (localStorage).
  const [priceVariant] = useState(() => getPriceVariant())
  const PLANS = plansForVariant(priceVariant)
  // Default: control pré-seleciona 'completa'; teste tem plano único.
  const [plan, setPlan] = useState(() => plansForVariant(priceVariant)[0].key)
  const [pix, setPix] = useState(null)
  const [loadingPix, setLoadingPix] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Self-edit da prévia (1×): editor aberto? / cliente acabou de confirmar?
  const [editing, setEditing] = useState(false)
  const [justSent, setJustSent] = useState(false)

  // 1) Carrega dados da order
  useEffect(() => {
    if (!id) { setErr('Link inválido — verifique a URL.'); return }
    fetchOrderStatus(id).then(o => {
      if (!o) { setErr('Não conseguimos carregar seu pedido. Confirma o link com a gente.'); return }
      if (o.status === 'paid' || o.paid_at) {
        navigate(`/p/${id}`, { replace: true })
        return
      }
      // ⚠️ /status NÃO retorna o campo `id` — injetamos o da rota pra que o
      // self-edit (MusicSelfEdit) chame /api/order/{id}/edit/* com id válido.
      // Sem isso vira /api/order/undefined/... → 400 e o editor falha.
      setOrder({ ...o, id })
      // SEMPRE default 'completa' (R$29,90 com vídeo) na PaymentPage — independente
      // do que o cliente escolheu na criação do pedido. Decisão do dono em 16/jun:
      // o plano "completa" é o que queremos pré-selecionado pra maximizar upsell.
      // Cliente que quer só musica pode trocar manualmente no card.
    })
  }, [id, navigate])

  // 2) Polling de pagamento (hook isolado)
  usePixPolling({
    orderId: id,
    hasPix: !!pix,
    onPaid: () => {
      setConfirming(true)
      // Pós-pagamento → área "Minhas músicas" (vê TODAS as músicas, pode ajustar).
      // Fallback pro /p/ se não tiver telefone. Usa location pra garantir que o
      // deep-link ?tel= do App rode (mount fresco).
      const digits = String(order?.phone || '').replace(/\D/g, '')
      setTimeout(() => {
        if (digits) window.location.href = `/?tel=${digits}`
        else navigate(`/p/${id}`, { replace: true })
      }, 1200)
    },
  })

  // 3) Enquanto a nova prévia está sendo criada (self-edit), polla o /status a
  //    cada 15s e mescla — quando fica pronta (edit_status='done' + preview novo),
  //    o editor some sozinho e a prévia nova aparece pra pagar. Sem F5.
  const editStatus = order?.edit_status
  useEffect(() => {
    if (!id || !order) return
    const regen = editStatus === 'regenerating' || (justSent && !['done', 'error'].includes(editStatus))
    if (!regen) return
    let alive = true
    const tick = async () => {
      try {
        const d = await fetchOrderStatus(id)
        if (!alive || !d || d.error) return
        // Se pagou no meio, o usePixPolling/redirect cuidam; aqui só mescla dados.
        // Reinjeta o id (o /status não traz) pra não perder a referência.
        setOrder(prev => ({ ...(prev || {}), ...d, id }))
      } catch (_) {}
    }
    const iv = setInterval(tick, 15000)
    tick()
    return () => { alive = false; clearInterval(iv) }
  }, [id, editStatus, justSent, order?.preview_audio_url])

  const generatePix = useCallback(async () => {
    if (!id) return
    setLoadingPix(true); setPix(null); setCopied(false)
    try {
      const data = await createPix(id, plan, priceVariant)
      if (!data?.brCode) throw new Error('falha')
      setPix({ brCode: data.brCode, brCodeBase64: data.brCodeBase64, expiresAt: data.expiresAt })
    } catch (e) {
      setErr('Não conseguimos gerar o PIX agora. Tenta de novo em alguns segundos.')
    } finally {
      setLoadingPix(false)
    }
  }, [id, plan, priceVariant])

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

  if (err) return <Shell><div className="pp-err">{err}</div></Shell>
  if (!order) return <Shell><div className="pp-loading">Carregando seu pedido…</div></Shell>

  const honoree = order.honoree_name || 'sua pessoa especial'
  const preview = order.preview_audio_url

  // ── Self-edit da prévia (1×) ──
  const regenerating = order.edit_status === 'regenerating' || (justSent && !['done', 'error'].includes(order.edit_status))
  const editErr = order.edit_status === 'error'
  // Pode ajustar quem tem prévia, ainda não usou o self-edit e não está em regeneração.
  const canEdit = MSE_ENABLED && !!preview && !order.self_edit_used && !regenerating && !editErr && !pix && !confirming
  // 🔒 SEM PRÉVIA = SEM PAGAMENTO. Só mostra planos/PIX se a prévia existe.
  // Se a prévia falhou (nunca gerou), mostra mensagem de problema (o backend
  // também bloqueia o /api/pay/create — trava dupla).
  const semPrevia = !preview && !regenerating && !editing
  const showPlans = !!preview && !pix && !confirming && !editing && !regenerating

  return (
    <Shell>
      <div className="pp-card">
        <div className="pp-emoji">🎵</div>
        <h1 className="pp-title">Falta pouquinho!</h1>
        <p className="pp-subtitle">
          Sua música pra <strong>{honoree}</strong> está pronta no estúdio.
          Finalize aqui pra liberar a versão completa em alta qualidade.
        </p>

        {/* Durante a regeneração a prévia antiga SOME — só reaparece (como "nova")
            quando a nova fica pronta (edit_status='done', regenerating=false). */}
        {preview && !editing && !regenerating && (
          <section className="pp-section">
            <h2>🎧 {order.self_edit_used ? 'Sua prévia nova' : 'Sua prévia'}</h2>
            <audio controls preload="metadata" src={preview} style={{ width: '100%' }} />
            <p className="pp-hint">A versão final é mais longa, em alta qualidade e sem marca d'água.</p>
          </section>
        )}

        {/* ── Ajustar a prévia (1×, sem custo) ── */}
        {editing ? (
          <section className="pp-section">
            <MusicSelfEdit
              order={order}
              onClose={() => setEditing(false)}
              onConfirmed={() => { setJustSent(true); setEditing(false) }}
            />
          </section>
        ) : regenerating ? (
          <section className="pp-section">
            <div className="pp-editregen">
              <div className="pp-editregen-ic">🎼</div>
              <strong>Sua nova prévia está sendo criada</strong>
              <p>Fica pronta em 5 a 10 minutinhos e aparece aqui automaticamente — e a gente te avisa por e-mail também. Aí é só finalizar o pagamento 💛</p>
            </div>
          </section>
        ) : editErr ? (
          <p className="pp-hint" style={{ textAlign: 'center', color: '#b04a30' }}>
            Tivemos um probleminha pra criar sua nova prévia — pode seguir com a atual que a equipe te ajuda 💛
          </p>
        ) : canEdit ? (
          <button type="button" className="pp-btn pp-btn-ghost pp-editbtn" onClick={() => setEditing(true)}>
            ✏️ Quero ajustar minha prévia antes de pagar
          </button>
        ) : null}

        {semPrevia && (
          <section className="pp-section" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>🎧</div>
            <h2 style={{ justifyContent: 'center' }}>Sua música ainda está sendo preparada</h2>
            <p className="pp-hint">
              Estamos finalizando a prévia da sua música — assim que ficar pronta, o pagamento libera aqui automaticamente. É rapidinho 💛
            </p>
          </section>
        )}

        {showPlans && (
          <section className="pp-section">
            <h2>📦 Escolha seu pacote</h2>
            <div className="pp-plans">
              {PLANS.map((p) => (
                <button key={p.key} type="button"
                        className={`pp-plan ${plan === p.key ? 'pp-plan-selected' : ''}`}
                        onClick={() => setPlan(p.key)}>
                  {p.badge && <span className="pp-plan-badge">{p.badge}</span>}
                  <div className="pp-plan-label">{p.label}</div>
                  <div className="pp-plan-price">R$ {p.price.toFixed(2).replace('.', ',')}</div>
                  <div className="pp-plan-detail">{p.detail}</div>
                </button>
              ))}
            </div>
            <button className="pp-btn pp-btn-primary" onClick={generatePix} disabled={loadingPix}>
              {loadingPix ? 'Gerando PIX…' : `Gerar PIX de R$ ${(PLANS.find(p => p.key === plan)?.price || 0).toFixed(2).replace('.', ',')}`}
            </button>
            <p style={{ fontSize: '12px', color: '#8a7969', textAlign: 'center', marginTop: '10px', lineHeight: 1.4 }}>
              Ao gerar o PIX e pagar, você concorda com os{' '}
              <a href="/termos.html" target="_blank" rel="noopener noreferrer" style={{ color: '#CC785C', textDecoration: 'underline' }}>Termos de Uso</a>,
              incluindo que é um produto personalizado, ouvido em prévia gratuita antes da compra.
            </p>
          </section>
        )}

        {pix && !confirming && (
          <section className="pp-section">
            <h2>💳 PIX gerado — Aguardando pagamento</h2>
            <div className="pp-pix-status">
              <span className="pp-spinner" /> Detectamos o pagamento automaticamente, é só pagar e aguardar.
            </div>
            {pix.brCodeBase64 && (
              <div className="pp-qr-wrap">
                <img src={pix.brCodeBase64} alt="QR code PIX" className="pp-qr" />
              </div>
            )}
            <div className="pp-brcode">{pix.brCode}</div>
            <div className="pp-btn-row">
              <button className="pp-btn pp-btn-primary" onClick={copyPix}>
                {copied ? '✓ Copiado!' : '📋 Copiar código PIX'}
              </button>
              <button className="pp-btn pp-btn-ghost" onClick={generatePix}>
                Gerar novo
              </button>
            </div>
            <ol className="pp-steps">
              <li>Abra o app do seu banco</li>
              <li>Vá em <strong>PIX → Pagar/Copia e Cola</strong></li>
              <li>Cole o código acima e confirme</li>
              <li>Volte aqui — a página libera sua música sozinha 💛</li>
            </ol>
          </section>
        )}

        {confirming && (
          <section className="pp-section pp-section-success">
            <div className="pp-check">✅</div>
            <h2 style={{ textAlign: 'center', margin: '0 0 8px' }}>Pagamento recebido!</h2>
            <p className="pp-hint" style={{ textAlign: 'center' }}>
              Liberando sua música agora…
            </p>
          </section>
        )}

        <p className="pp-footer">
          Lembrança Cantada · Feito com carinho 💛
        </p>
      </div>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="pp-shell">
      <style>{`
        @keyframes pp-spin { to { transform: rotate(360deg); } }
        @keyframes pp-pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
        .pp-shell {
          min-height: 100vh;
          background: linear-gradient(180deg, #fef9f5 0%, #fff 100%);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 24px 16px 48px;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #2b1d14;
        }
        .pp-card {
          width: 100%; max-width: 560px;
          background: #fff;
          border: 1px solid #f3e5d8;
          border-radius: 20px;
          padding: 32px 24px;
          box-shadow: 0 12px 40px rgba(204, 120, 92, 0.08);
        }
        .pp-emoji { font-size: 48px; text-align: center; margin-bottom: 8px; }
        .pp-title { font-size: 26px; margin: 0 0 8px; text-align: center; font-weight: 700; line-height: 1.25; }
        .pp-subtitle { text-align: center; color: #7a6354; margin: 0 0 28px; font-size: 15px; line-height: 1.5; }
        .pp-section { margin: 24px 0; padding: 20px; background: #fdfaf6; border-radius: 14px; border: 1px solid #f6ede2; }
        .pp-section-success { background: #eef9f0; border-color: #c8e6cf; }
        .pp-section h2 { font-size: 16px; margin: 0 0 12px; font-weight: 600; color: #2b1d14; }
        .pp-hint { font-size: 13px; color: #7a6354; line-height: 1.5; margin: 8px 0 0; }
        .pp-plans { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
        .pp-plan {
          position: relative; padding: 16px; border-radius: 12px; cursor: pointer;
          background: #fff; border: 2px solid #f3e5d8; text-align: left;
          font-family: inherit; transition: border .15s, transform .1s;
        }
        .pp-plan:hover { border-color: #e8c4b3; }
        .pp-plan-selected { border-color: #CC785C; background: #fffaf6; }
        .pp-plan-badge {
          position: absolute; top: -10px; right: 14px;
          background: #CC785C; color: #fff; font-size: 11px; font-weight: 700;
          padding: 4px 10px; border-radius: 100px; letter-spacing: .3px;
        }
        .pp-plan-label { font-weight: 700; font-size: 15px; color: #2b1d14; }
        .pp-plan-price { font-size: 22px; font-weight: 800; color: #CC785C; margin: 4px 0; }
        .pp-plan-detail { font-size: 13px; color: #7a6354; line-height: 1.45; }
        .pp-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 14px 18px; border-radius: 12px;
          font-family: inherit; font-weight: 700; font-size: 15px;
          cursor: pointer; border: none; box-sizing: border-box;
          transition: opacity .15s, transform .1s;
        }
        .pp-btn:hover { opacity: .92; }
        .pp-btn:active { transform: translateY(1px); }
        .pp-btn:disabled { opacity: .65; cursor: wait; }
        .pp-btn-primary { background: #CC785C; color: #fff; box-shadow: 0 6px 16px rgba(204,120,92,.2); }
        .pp-btn-ghost { background: #fff; color: #7a6354; border: 1px solid #f3e5d8; }
        .pp-btn-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
        .pp-btn-row .pp-btn { flex: 1 1 180px; }
        .pp-pix-status {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px; background: #fff8ef;
          border: 1px solid #f7e4cf; border-radius: 10px;
          font-size: 13px; color: #8a5a2b; margin-bottom: 14px;
          animation: pp-pulse 2.4s ease-in-out infinite;
        }
        .pp-spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid #f0bf85; border-top-color: #8a5a2b;
          border-radius: 50%; animation: pp-spin .7s linear infinite;
        }
        .pp-qr-wrap { display: flex; justify-content: center; padding: 14px; background: #fff; border-radius: 12px; margin-bottom: 12px; }
        .pp-qr { width: 240px; height: 240px; image-rendering: pixelated; }
        .pp-brcode {
          font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.4;
          background: #fff; padding: 12px; border-radius: 10px;
          border: 1px solid #f3e5d8; word-break: break-all; color: #5a4434;
          max-height: 110px; overflow-y: auto; margin-bottom: 10px;
        }
        .pp-steps { margin: 14px 0 0; padding: 0 0 0 20px; font-size: 14px; color: #5a4434; line-height: 1.7; }
        .pp-steps li { margin-bottom: 4px; }
        .pp-check { font-size: 56px; text-align: center; margin: 4px 0 8px; }
        .pp-editbtn { margin: 4px 0 8px; }
        .pp-editregen { text-align: center; padding: 20px 16px; background: #fff8ef; border: 1px solid #f7e4cf; border-radius: 14px; }
        .pp-editregen-ic { font-size: 40px; margin-bottom: 6px; }
        .pp-editregen strong { display: block; font-size: 16px; color: #2b1d14; margin-bottom: 6px; }
        .pp-editregen p { font-size: 14px; color: #7a6354; line-height: 1.5; margin: 0; }
        .pp-loading, .pp-err {
          text-align: center; padding: 80px 24px; color: #7a6354; font-size: 16px;
        }
        .pp-err { color: #b04a30; }
        .pp-footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #f3e5d8; color: #a09080; font-size: 13px; }
      `}</style>
      {children}
    </div>
  )
}
