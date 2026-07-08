// Modal de pagamento PIX inline — aberto a partir do chat ou da tela de
// preview. Fluxo:
//   plan → pay (QR + brCode) → success (via webhook AbacatePay)
//                                    ↘ upload → sending → review/rejected
//
// Migrado do App.jsx pra features/Payment/components na Fase A do refactor
// pos-merge. Dependencias externas:
//   - onHelpWhatsApp prop: callback que abre WhatsApp na rejected screen
//     (era openHelpOnWhatsApp definida no App.jsx — passa via prop pra
//     manter o modal sem dependencia direta da home).
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { fmtBRL } from '../../../core/utils'
import { API_URL } from '../../../core/infra'
import { PLAN_DETAILS, getPriceVariant, isTestVariant, TEST_VARIANTS } from '../constants'
import { submitPaymentProof, checkPaymentStatus } from '../api/paymentService'
import { fetchOrderStatus } from '../api/paymentService'

export default function PixPaymentModal({
  open, onClose, planKey = 'musica', orderId, honoreeName, customerName, customerPhone,
  onPaid, onHelpWhatsApp, startAt = 'plan',
}) {
  const [copied, setCopied] = useState(false)
  // 'plan' = escolha do plano · 'pay' = QR · 'upload' = comprovante · 'sending' · 'success' · 'review' · 'rejected'
  const [step, setStep] = useState('plan')
  // Variante do teste A/B de preço — atribuída 1× por visitante (localStorage).
  const [priceVariant] = useState(() => getPriceVariant())
  const testVariant = isTestVariant(priceVariant)
  const testCfg = testVariant ? TEST_VARIANTS[priceVariant] : null
  // selectedPlan vive DENTRO do modal pra permitir o usuario trocar de plano
  // na tela 0 sem precisar reabrir. O prop planKey vira o default inicial.
  // No teste A/B o plano é ÚNICO (o planKey do teste), sem escolha.
  const [selectedPlan, setSelectedPlan] = useState(testVariant ? testCfg.planKey : planKey)
  const [file, setFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const [proofResp, setProofResp] = useState(null)
  const plan = PLAN_DETAILS[selectedPlan] || PLAN_DETAILS.musica

  // Decisão do dono: só o X fecha — sem ESC, sem clique fora.
  // Evita perda acidental durante o pagamento (cliente pode tocar fora pra
  // alternar pro app do banco e voltar — não pode fechar o modal).
  useEffect(() => {
    if (!open) return
    // Teste A/B: no test variant, começa direto no pagamento (plano único) e força o planKey do teste.
    const initialPlan = testVariant ? testCfg.planKey : planKey
    setStep(testVariant ? 'pay' : (startAt || 'plan')); setSelectedPlan(initialPlan); setFile(null); setFilePreview(null); setProofResp(null)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open, startAt, planKey])

  // Preview do arquivo selecionado (objectURL revogado ao trocar/desmontar)
  useEffect(() => {
    if (!file) { setFilePreview(null); return }
    if (!/^image\//.test(file.type)) { setFilePreview(null); return }
    const url = URL.createObjectURL(file)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Sobe o comprovante pro backend e trata a resposta.
  const submitProof = async () => {
    if (!file || !orderId) return
    setStep('sending')
    const data = await submitPaymentProof(orderId, file, selectedPlan)
    setProofResp(data)
    if (data?.auto_approved) {
      setStep('success')
      try { onPaid && onPaid(orderId, data) } catch (_) {}
    } else if (data?.proof_status === 'awaiting_validation') {
      setStep('review')
    } else {
      setStep('rejected')
    }
  }

  // Polling do status do pagamento (PIX AbacatePay).
  // No step 'pay': cliente tá com o QR aberto — checamos /api/pay/status
  // a cada 4s. Quando webhook AbacatePay confirma → status='paid' → success.
  useEffect(() => {
    if (!open || step !== 'pay' || !orderId) return
    let active = true
    const tick = async () => {
      const j = await checkPaymentStatus(orderId)
      if (!active) return
      if (j?.paid) {
        setStep('success')
        try { onPaid && onPaid(orderId, { auto_approved: true, abacate: true }) } catch (_) {}
      }
    }
    const id = setInterval(tick, 4000)
    return () => { active = false; clearInterval(id) }
  }, [open, step, orderId, onPaid])

  // Polling do status enquanto está em revisão manual.
  useEffect(() => {
    if (!open || step !== 'review' || !orderId) return
    let active = true
    const tick = async () => {
      const row = await fetchOrderStatus(orderId)
      if (!active) return
      if (row?.paid_at || row?.status === 'paid' || row?.status === 'delivered') {
        setStep('success')
        try { onPaid && onPaid(orderId, { auto_approved: true, manual: true }) } catch (_) {}
      }
    }
    const id = setInterval(tick, 5000)
    tick()
    return () => { active = false; clearInterval(id) }
  }, [open, step, orderId, onPaid])

  // Countdown de 30s antes do botão "Já paguei" ficar clicável.
  const [paidEnabledAt, setPaidEnabledAt] = useState(0)
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    if (!open || step !== 'pay' || !orderId) return
    const key = `hc_pix_paid_at_${orderId}`
    let t = parseInt(sessionStorage.getItem(key) || '0', 10)
    if (!t) {
      t = Date.now() + 30000
      try { sessionStorage.setItem(key, String(t)) } catch (_) {}
    }
    setPaidEnabledAt(t)
    const id = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open, step, orderId])
  const paidSecsLeft = Math.max(0, Math.ceil((paidEnabledAt - nowTs) / 1000))
  const paidReady = paidEnabledAt > 0 && paidSecsLeft === 0

  // Cronômetro de 10 min · PERSISTE entre fechar/abrir do modal.
  const [secsLeft, setSecsLeft] = useState(600)
  useEffect(() => {
    if (!open || !orderId) return
    const key = `hc_pix_cd_${orderId}`
    let start = parseInt(localStorage.getItem(key) || '0', 10) || 0
    const compute = () => {
      const now = Date.now()
      if (!start || (now - start) >= 600000) {
        start = now
        try { localStorage.setItem(key, String(start)) } catch (_) {}
      }
      return Math.max(0, 600 - Math.floor((now - start) / 1000))
    }
    setSecsLeft(compute())
    const id = setInterval(() => setSecsLeft(compute()), 1000)
    return () => clearInterval(id)
  }, [open, orderId])
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0')
  const ss = String(secsLeft % 60).padStart(2, '0')

  // PIX agora vem da AbacatePay (confirmação automática).
  const [brCode, setBrCode] = useState('')
  const [qrSrc, setQrSrc] = useState('')
  const [payError, setPayError] = useState('')
  useEffect(() => {
    if (!open || !orderId || !selectedPlan) return
    let cancelled = false
    setBrCode(''); setQrSrc(''); setPayError('')
    ;(async () => {
      try {
        const r = await fetch(`${API_URL}/api/pay/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, plan: selectedPlan, priceVariant }),
        })
        const j = await r.json()
        if (cancelled) return
        if (!r.ok || !j?.brCode) {
          // 409 'sem_previa' = música/prévia ainda não pronta → mensagem específica.
          setPayError(j?.message || (j?.error === 'sem_previa' ? 'A prévia da sua música ainda não ficou pronta.' : j?.error) || 'Falha ao gerar PIX')
          return
        }
        setBrCode(j.brCode)
        setQrSrc(j.brCodeBase64 || '')
      } catch (e) {
        if (!cancelled) setPayError(e?.message || 'Erro de rede')
      }
    })()
    return () => { cancelled = true }
  }, [open, orderId, selectedPlan])

  if (!open) return null

  // Copia 100% UNIVERSAL — execCommand SINCRONO + clipboard moderno em paralelo.
  // Por que execCommand primeiro? Em iOS Safari + WebView, o "user gesture"
  // que autoriza clipboard expira apos await assincrono.
  const copy = (e) => {
    if (e?.preventDefault) e.preventDefault()
    setCopied(true)
    setTimeout(() => setCopied(false), 2400)

    try {
      const ta = document.createElement('textarea')
      ta.value = brCode
      ta.setAttribute('readonly', '')
      ta.setAttribute('contenteditable', 'true')
      ta.style.cssText = 'position:fixed;top:50%;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;margin:0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const range = document.createRange()
      range.selectNodeContents(ta)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      ta.setSelectionRange(0, brCode.length)
      document.execCommand('copy')
      sel.removeAllRanges()
      document.body.removeChild(ta)
    } catch (_) {}

    try {
      const writePromise = navigator.clipboard?.writeText?.(brCode)
      if (writePromise && typeof writePromise.then === 'function') {
        Promise.race([
          writePromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
        ]).catch(() => {})
      }
    } catch (_) {}
  }

  return createPortal(
    <div className="pix-modal-root" role="dialog" aria-modal="true" aria-labelledby="pix-modal-title">
      <div className="pix-modal-backdrop" aria-hidden="true" />
      <button type="button" className="pix-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
      <div className="pix-modal-card">

        {step === 'plan' && !testVariant && <>
        <span className="pix-modal-eyebrow">Escolha o plano</span>
        <h2 className="pix-modal-title">
          {honoreeName ? <>Sua música pra <em>{honoreeName}</em></> : 'Sua música'}
        </h2>
        <p className="pix-plan-sub">Os dois saem hoje. Escolha como quer receber.</p>

        <div className="pix-plan-list">
          <button type="button" className={`pix-plan-card pix-plan-card--featured${selectedPlan === 'completa' ? ' is-selected' : ''}`}
            onClick={() => { setSelectedPlan('completa'); setStep('pay') }}>
            <span className="pix-plan-badge">★ Mais escolhido</span>
            <span className="pix-plan-card-row">
              <span className="pix-plan-card-name">Música + Vídeo karaokê</span>
              <span className="pix-plan-card-price">{fmtBRL(PLAN_DETAILS.completa.amount)}</span>
            </span>
            <ul className="pix-plan-card-list">
              <li>Tudo do plano Música</li>
              <li>Vídeo com a letra na tela (estilo Spotify)</li>
              <li>Perfeito pra postar no Instagram</li>
            </ul>
            <span className="pix-plan-card-arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </span>
          </button>

          <button type="button" className={`pix-plan-card pix-plan-card--basic${selectedPlan === 'musica' ? ' is-selected' : ''}`}
            onClick={() => { setSelectedPlan('musica'); setStep('pay') }}>
            <span className="pix-plan-card-row">
              <span className="pix-plan-card-name">Música</span>
              <span className="pix-plan-card-price">{fmtBRL(PLAN_DETAILS.musica.amount)}</span>
            </span>
            <ul className="pix-plan-card-list">
              <li>Música completa</li>
              <li>2 versões da música</li>
              <li>Liberação imediata após o Pix</li>
            </ul>
          </button>
        </div>

        <p className="pix-modal-tip" style={{ marginTop: 14 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{verticalAlign:'-1px',marginRight:5}}>
            <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
          </svg>
          Pagamento via PIX · liberação automática após confirmação
        </p>
        </>}

        {step === 'pay' && payError && <div className="pix-state pix-state--review">
          <div className="pix-state-icon pix-state-icon--review" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3>Sua música ainda está sendo preparada</h3>
          <p>Estamos finalizando sua prévia — assim que ficar pronta, o pagamento libera aqui automaticamente. É rapidinho 💛</p>
          <button type="button" className="pix-modal-copy" onClick={onClose} style={{ marginTop: 10 }}>Fechar</button>
        </div>}

        {step === 'pay' && !payError && <>
        {!testVariant && <button type="button" className="pix-step-back" onClick={() => setStep('plan')}>← Trocar plano</button>}
        <span className="pix-modal-eyebrow">Pagamento PIX</span>
        <h2 id="pix-modal-title" className="pix-modal-title">Desbloquear música</h2>

        {testVariant && (
          <p className="pix-plan-sub" style={{ margin: '0 0 10px' }}>
            Música personalizada · 2 versões da música + 1 edição incluída caso queira ajustar.
          </p>
        )}

        <div className="pix-modal-amount-card">
          <span className="pix-modal-amount-label">
            {testCfg && testCfg.anchor
              ? <>De <s style={{ color: '#b39a8c' }}>{fmtBRL(testCfg.anchor)}</s> por</>
              : 'Valor único'}
          </span>
          <strong className="pix-modal-amount">{fmtBRL(plan.amount)}</strong>
          <span className="pix-modal-offer" role="timer" aria-live="off">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
            </svg>
            Esta oferta expira em <strong className="pix-modal-cd">{mm}:{ss}</strong>
          </span>
        </div>

        <div className="pix-modal-qr">
          <img src={qrSrc} alt="QR Code Pix copia e cola" width="200" height="200" />
        </div>

        <span className="pix-modal-qr-hint">Aponte a câmera do app do banco no QR</span>

        <button type="button" className="pix-modal-copy" onClick={copy}>
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Código copiado!
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copiar código Pix
            </>
          )}
        </button>

        <div className={`pix-modal-paid is-waiting`} aria-live="polite" style={{cursor:'default'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
          <span className="pix-modal-paid-text">Aguardando confirmação automática do PIX…</span>
        </div>

        <p className="pix-modal-instructions">
          1. Abra o app do seu banco e escolha <strong>Pix copia e cola</strong>.<br/>
          2. Cole o código copiado — chave, valor e recebedor já vêm preenchidos.<br/>
          3. Liberamos sua música automaticamente assim que o PIX cair (em segundos).
        </p>

        <div className="pix-modal-trust">
          <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> SSL 256-bit</span>
          <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg> Compra protegida</span>
        </div>

        {orderId && (
          <p className="pix-modal-order">Pedido #{String(orderId).slice(0, 8).toUpperCase()}</p>
        )}
        </>}

        {step === 'upload' && <>
          <button type="button" className="pix-step-back" onClick={() => setStep('pay')}>← Voltar</button>
          <span className="pix-modal-eyebrow">Comprovante</span>
          <h2 className="pix-modal-title">Envie o comprovante</h2>
          <p className="pix-modal-sub">
            Mande o print ou PDF do app do banco. A gente confere em segundos e libera sua música.
          </p>

          <label className={`pix-drop${file ? ' has-file' : ''}`}>
            <input type="file" accept="image/*,application/pdf"
              onChange={e => setFile(e.target.files?.[0] || null)} />
            {!file ? (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <strong>Toque pra escolher o arquivo</strong>
                <span>Foto (JPG/PNG) ou PDF · até 5MB</span>
              </>
            ) : (
              <>
                {filePreview
                  ? <img className="pix-drop-preview" src={filePreview} alt="prévia do comprovante" />
                  : <div className="pix-drop-pdf">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span style={{minWidth:0,flex:'1 1 auto',wordBreak:'break-all',overflowWrap:'anywhere'}}>{file.name}</span>
                    </div>}
                <span className="pix-drop-info">{Math.round(file.size / 1024)} KB</span>
                <button type="button" className="pix-drop-change"
                  onClick={(e) => { e.preventDefault(); setFile(null) }}>Trocar arquivo</button>
              </>
            )}
          </label>

          <button type="button" className="pix-modal-copy" disabled={!file}
            onClick={submitProof}>
            Enviar comprovante pra liberar
          </button>

          <p className="pix-modal-tip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{verticalAlign:'-1px',marginRight:5}}>
              <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
            </svg>
            Verificação automática em segundos. Liberamos sua música quando os dados batem com o pedido.
          </p>
        </>}

        {step === 'sending' && <div className="pix-state pix-state--sending">
          <div className="pix-spinner" aria-hidden="true" />
          <h3>Conferindo seu comprovante…</h3>
          <p>Geralmente leva uns 10 segundos.</p>
        </div>}

        {step === 'success' && <div className="pix-state pix-state--success">
          <div className="pix-state-icon" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3>Pagamento aprovado!</h3>
          <p>{selectedPlan === 'completa'
            ? 'Sua música completa e o vídeo já estão liberados pra baixar.'
            : 'Sua música completa já está liberada pra baixar.'}</p>
          <button type="button" className="pix-modal-copy" onClick={onClose}>Ver minha música</button>
        </div>}

        {step === 'review' && <div className="pix-state pix-state--review">
          <div className="pix-state-icon pix-state-icon--review" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
          </div>
          <h3>Comprovante recebido</h3>
          <p>Já estamos conferindo. Em poucos minutos liberamos a música automaticamente — você não precisa fazer nada.</p>
          {proofResp?.reasons?.length > 0 && (
            <>
              <p style={{fontSize:12.5, color:'var(--c-text-muted)', marginTop:2}}>
                {proofResp.reasons.length === 1 ? 'Pra você saber, encontramos isso:' : 'Pra você saber, encontramos:'}
              </p>
              <ul className="pix-state-reasons-list">
                {proofResp.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}
          <button type="button" className="pix-modal-copy" onClick={onClose}>Entendi</button>
        </div>}

        {step === 'rejected' && <div className="pix-state pix-state--rejected">
          <div className="pix-state-icon pix-state-icon--rejected" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
          <h3>Comprovante não bateu</h3>
          {proofResp?.reasons?.length > 0 ? (
            <>
              <p>Encontramos {proofResp.reasons.length === 1 ? 'um problema' : `${proofResp.reasons.length} problemas`} no que você enviou:</p>
              <ul className="pix-state-reasons-list">
                {proofResp.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          ) : (
            <p>{proofResp?.reason || 'Esse arquivo não bateu com as regras de validação.'}</p>
          )}
          <button type="button" className="pix-modal-copy" onClick={() => { setFile(null); setProofResp(null); setStep('upload') }}>
            Enviar outro comprovante
          </button>
        </div>}
      </div>
    </div>,
    document.body
  )
}
