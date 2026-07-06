// SupportChat — widget de atendimento PRÓPRIO no site (independente do WhatsApp).
// O cliente conversa com a Bia aqui mesmo; o bot identifica o pedido (pela página,
// pelo telefone ou pelo nome) e devolve o link da música/pagamento. Tudo é
// gerenciado no CRM (aba "Site"), onde um humano pode assumir a conversa.
//
// • order_id: vem da URL (/p/:id, /finalizar/:id, /promo/:id) ou do localStorage
//   (hc_current_order) → o chat já abre sabendo qual é o pedido do cliente.
// • Mensagens do vendedor (respondidas no CRM) chegam aqui via polling.
import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

const CRM_API = import.meta.env.VITE_CRM_API || 'https://crm-api.bvph.uk'
const P = '#C96240', P_DARK = '#AB4B2B' // terracota da marca

const uuid = () => {
  try { return crypto.randomUUID() } catch (_) { return 'sx-' + Date.now() + '-' + Math.random().toString(16).slice(2) }
}
function getSession() {
  try {
    let s = localStorage.getItem('lc_chat_session')
    if (!s) { s = uuid(); localStorage.setItem('lc_chat_session', s) }
    return s
  } catch (_) { return uuid() }
}
// order_id da rota (/p/:id, /finalizar/:id, /promo/:id) ou do pedido salvo.
function readOrderId(pathname) {
  const m = String(pathname || '').match(/\/(?:p|finalizar|promo)\/([0-9a-f-]{8,})/i)
  if (m) return m[1]
  try { const o = JSON.parse(localStorage.getItem('hc_current_order') || 'null'); return o?.id || null } catch (_) { return null }
}
const MEDIA_RE = /(https?:\/\/[^\s]+?\.(?:mp3|mp4|m4a|wav|ogg))(?=$|\s)/i
const URL_RE = /(https?:\/\/[^\s]+)/g
// Marcador oculto que o backend usa pra passar o telefone pro botão "todas as
// músicas" sem mostrar a URL. Ex.: [[tel:5511999998888]] → some no render.
const HIDDEN_RE = /\[\[tel:\d+\]\]/g

// Renderiza um trecho de texto com *negrito* estilo WhatsApp + links clicáveis.
function renderRich(str, linkColor, keyBase) {
  const out = []
  str.split(URL_RE).forEach((seg, si) => {
    if (/^https?:\/\//.test(seg)) {
      out.push(<a key={`${keyBase}u${si}`} href={seg} target="_blank" rel="noopener noreferrer"
        style={{ color: linkColor, textDecoration: 'underline', fontWeight: 600, wordBreak: 'break-all' }}>{seg}</a>)
      return
    }
    // *negrito*: quebra mantendo os delimitadores pra transformar em <strong>
    seg.split(/(\*[^*\n]+\*)/g).forEach((bp, bi) => {
      if (!bp) return
      if (/^\*[^*\n]+\*$/.test(bp)) out.push(<strong key={`${keyBase}b${si}-${bi}`}>{bp.slice(1, -1)}</strong>)
      else out.push(<span key={`${keyBase}t${si}-${bi}`}>{bp}</span>)
    })
  })
  return out
}

function Body({ text, mine }) {
  let str = String(text || '')
  const media = str.match(MEDIA_RE)
  // remove marcadores ocultos ([[tel:...]]) — são só pro widget, não pro cliente.
  str = str.replace(HIDDEN_RE, '')
  // No balão do cliente (terracota) o link é branco; no da Bia (fundo branco) usa a
  // cor da marca — senão fica branco-no-branco e some.
  const linkColor = mine ? '#fff' : '#AB4B2B'
  return (
    <>
      {media && (/\.mp4$/i.test(media[1])
        ? <video src={media[1]} controls style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 6 }} />
        : <audio src={media[1]} controls style={{ width: '100%', marginBottom: 6 }} />)}
      <span>{renderRich(str, linkColor, 'r')}</span>
    </>
  )
}

export default function SupportChat() {
  const loc = useLocation()
  const sessionRef = useRef(getSession())
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('lc_chat_msgs') || '[]') } catch (_) { return [] }
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [greeted, setGreeted] = useState(false)
  // Cliente já escolheu uma das 2 opções de entrada ("Tenho um pedido" / "Quero
  // saber mais")? Persiste na sessão pra não re-mostrar os botões.
  const [chose, setChose] = useState(() => { try { return sessionStorage.getItem('lc_chat_chose') === '1' } catch { return false } })
  const scroller = useRef(null)
  const lastOutAt = useRef(null)

  const orderId = readOrderId(loc.pathname)
  // Páginas de pedido (checkout /finalizar + entrega /p + oferta /promo) = suporte
  // pra quem já pagou → mostra de cara. Dentro do App (home/quiz/result) depende da
  // TELA, publicada pelo App em window.__lcView / evento 'lc:view'.
  const isOrderPage = /^\/(p|finalizar|promo)\//i.test(loc.pathname)
  const [appView, setAppView] = useState(() => { try { return window.__lcView || null } catch { return null } })
  const [appBusy, setAppBusy] = useState(() => { try { return !!window.__lcBusy } catch { return false } })
  const [revealed, setRevealed] = useState(isOrderPage)

  useEffect(() => {
    const onView = (e) => {
      const d = e?.detail
      if (d && typeof d === 'object') { setAppView(d.view || null); setAppBusy(!!d.busy) }
      else { setAppView(d || null) }
    }
    window.addEventListener('lc:view', onView)
    try { if (window.__lcView) setAppView(window.__lcView); setAppBusy(!!window.__lcBusy) } catch (_) {}
    return () => window.removeEventListener('lc:view', onView)
  }, [])

  // 🚫 PROIBIDO enquanto o App está "ocupado": gerando prévia (progress) OU com o quiz/
  // chat de criação aberto. NUNCA por cima do fluxo de criação.
  const blocked = !isOrderPage && appBusy

  // Reaparece só após ROLAR (home, result-após-prévia, etc.). Páginas de pedido: de
  // cara. Reseta a cada troca de tela → result também exige rolar (mesma lógica da home).
  useEffect(() => {
    if (isOrderPage) { setRevealed(true); return }
    setRevealed(false)
    if (blocked) return
    const onScroll = () => { if (window.scrollY > window.innerHeight * 0.6) setRevealed(true) }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [isOrderPage, loc.pathname, appView, blocked])

  // Se entrou no quiz/gerando com o chat aberto, fecha na hora.
  useEffect(() => { if (blocked) setOpen(false) }, [blocked])

  const persist = useCallback((arr) => {
    try { sessionStorage.setItem('lc_chat_msgs', JSON.stringify(arr.slice(-80))) } catch (_) {}
  }, [])
  const push = useCallback((m) => {
    setMsgs(prev => {
      // Dedup: a resposta do bot chega 2x (resposta direta do POST + polling do
      // vendedor). Se já existe uma msg 'out' idêntica (mesmo created_at+corpo),
      // ignora — senão a entrega aparece duplicada.
      if (m.role === 'out') {
        if (m.id && prev.some(x => x.id === m.id)) return prev
        const key = (m.created_at || '') + '|' + (m.body || '')
        if (prev.some(x => x.role === 'out' && ((x.created_at || '') + '|' + (x.body || '')) === key)) return prev
      }
      const next = [...prev, m]; persist(next); return next
    })
    if (m.role === 'out' && m.created_at) lastOutAt.current = m.created_at
  }, [persist])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, open])

  // Saudação ao abrir pela 1ª vez.
  //  • Página de pedido (/p, /finalizar, /promo) → bot responde direto sobre o pedido.
  //  • Home/geral → saudação + 2 botões de entrada ("Tenho um pedido" / "Quero saber
  //    mais"); só chama o bot quando o cliente escolhe ou digita.
  useEffect(() => {
    if (!open || greeted) return
    setGreeted(true)
    if (msgs.length) return // já tem histórico → não re-cumprimenta
    if (orderId) { sendRaw(''); return }
    push({ role: 'out', author: 'bia', created_at: new Date().toISOString(),
      body: 'Oi! 💛 Sou a Bia, da Lembrança Cantada 🎶 Como posso te ajudar hoje?' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Dispara a intenção de um dos 2 botões: mostra um balão bonito do cliente e
  // manda o sentinel pro bot (que abre o fluxo de pedido ou o chat aberto).
  const pickIntent = useCallback((label, sentinel) => {
    setChose(true)
    try { sessionStorage.setItem('lc_chat_chose', '1') } catch (_) {}
    push({ role: 'in', body: label, created_at: new Date().toISOString() })
    sendRaw(sentinel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push])

  // "Quero criar uma música" → abre o quiz do App (global exposto em App.jsx).
  // Se não estiver na home (widget em /p etc.), navega pra home pra iniciar.
  const startQuiz = useCallback(() => {
    try {
      if (typeof window.__lcStartQuiz === 'function') { setOpen(false); window.__lcStartQuiz(); return }
    } catch (_) {}
    window.location.href = '/'
  }, [])

  // Polling de respostas do vendedor (CRM) enquanto aberto.
  useEffect(() => {
    if (!open) return
    const id = setInterval(async () => {
      try {
        const q = new URLSearchParams({ session_id: sessionRef.current })
        if (lastOutAt.current) q.set('after', lastOutAt.current)
        const r = await fetch(`${CRM_API}/api/site-chat/poll?${q}`).then(x => x.json())
        for (const m of (r.messages || [])) {
          if (m.author && m.author !== 'bia') {
            // resposta humana do vendedor
          }
          push({ role: 'out', body: m.body, author: m.author, created_at: m.created_at, id: m.id })
        }
      } catch (_) {}
    }, 4000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function sendRaw(t) {
    setBusy(true)
    try {
      const r = await fetch(`${CRM_API}/api/site-chat/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionRef.current, order_id: orderId || undefined, text: t, page: loc.pathname }),
      }).then(x => x.json())
      for (const m of (r.replies || [])) push({ role: 'out', body: m.body, author: m.author || 'bia', created_at: m.created_at, id: m.id })
    } catch (_) {
      push({ role: 'out', body: 'Ops, tive um probleminha de conexão 😣 Pode tentar de novo em instantes?', author: 'bia' })
    } finally { setBusy(false) }
  }

  async function send() {
    const t = text.trim()
    if (!t || busy) return
    setText('')
    push({ role: 'in', body: t, created_at: new Date().toISOString() })
    await sendRaw(t)
  }

  return (
    <>
      {/* Botão flutuante — proibido no quiz/gerando; senão: pedido=de cara, resto=após rolar */}
      {!open && revealed && !blocked && (
        <button onClick={() => setOpen(true)} aria-label="Falar com a Bia"
          style={{
            position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000,
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 8px 8px',
            background: '#fff', border: 'none', borderRadius: 999, cursor: 'pointer',
            boxShadow: '0 10px 30px -8px rgba(0,0,0,.35)', fontFamily: 'Inter, system-ui, sans-serif',
            animation: 'lcfab-in .32s cubic-bezier(.2,.7,.3,1)',
          }}>
          <style>{'@keyframes lcfab-in{from{opacity:0;transform:translateY(16px) scale(.92)}to{opacity:1;transform:none}}'}</style>
          <span style={{ position: 'relative', width: 42, height: 42, flex: '0 0 auto' }}>
            <img src="/assets/Bia.jpeg" alt="Bia" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.display = 'none' }} />
          </span>
          <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#1C1917' }}>Falar com a Bia</span>
          </span>
        </button>
      )}

      {/* Painel do chat */}
      {open && !blocked && (
        <div style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000,
          width: 'min(380px, calc(100vw - 24px))', height: 'min(560px, calc(100vh - 32px))',
          display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 18,
          overflow: 'hidden', boxShadow: '0 24px 60px -12px rgba(0,0,0,.45)', fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: `linear-gradient(135deg, ${P} 0%, ${P_DARK} 100%)`, color: '#fff' }}>
            <span style={{ position: 'relative', width: 38, height: 38 }}>
              <img src="/assets/Bia.jpeg" alt="Bia" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.display = 'none' }} />
            </span>
            <div style={{ flex: 1, lineHeight: 1.25 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Bia · Lembrança Cantada</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fechar"
              style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {/* Mensagens */}
          <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', background: '#FAFAF9', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msgs.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#78716C', fontSize: 13, padding: 20 }}>
                Oi! 💛 Sou a Bia. Me conta como posso te ajudar com a sua música.
              </div>
            )}
            {msgs.map((m, i) => {
              const mine = m.role === 'in'
              return (
                <div key={i} style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%',
                  background: mine ? `linear-gradient(135deg, ${P} 0%, ${P_DARK} 100%)` : '#fff',
                  color: mine ? '#fff' : '#292524',
                  border: mine ? 'none' : '1px solid #E7E5E4',
                  borderRadius: 14, borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
                  padding: '8px 11px', fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  boxShadow: mine ? 'none' : '0 1px 2px rgba(0,0,0,.04)',
                }}>
                  <Body text={m.body} mine={mine} />
                </div>
              )
            })}
            {busy && <div style={{ alignSelf: 'flex-start', color: '#a8a29e', fontSize: 13, padding: '2px 6px' }}>Bia está digitando…</div>}

            {/* Botão "Minhas músicas": aparece após o bot achar/entregar um pedido
                (msg com /p/ ou /finalizar/) → leva pra TODAS as músicas da cliente,
                pois às vezes ela tem mais de um pedido. */}
            {(() => {
              if (busy) return null
              const lastOut = [...msgs].reverse().find(m => m.role === 'out')
              if (!lastOut || !/\/(p|finalizar)\//.test(String(lastOut.body || ''))) return null
              const body = String(lastOut.body || '')
              // telefone: 1º do marcador oculto [[tel:...]]; senão link ?tel=; senão digitado
              let tel = ''
              const mk = body.match(/\[\[tel:(\d+)\]\]/)
              if (mk) tel = mk[1]
              if (!tel) { const u = body.match(/https?:\/\/[^\s]*[?&]tel=(\d+)/); tel = u ? u[1] : '' }
              if (!tel) {
                const lastPhone = [...msgs].reverse().find(m => m.role === 'in' && String(m.body || '').replace(/\D/g, '').length >= 10)
                tel = lastPhone ? String(lastPhone.body).replace(/\D/g, '') : ''
              }
              if (!tel) return null
              return (
                <button onClick={() => { window.location.href = `/?tel=${tel}` }}
                  style={{ width: '100%', marginTop: 4, padding: '11px 14px', borderRadius: 14, cursor: 'pointer',
                    background: '#fff', color: P_DARK, border: `1.5px solid ${P}`, fontFamily: 'inherit', fontSize: 14, fontWeight: 700 }}>
                  🎵 Ver todas as minhas músicas
                </button>
              )
            })()}

            {/* 3 botões de entrada — só na home/geral, antes do cliente escolher.
                "Já paguei" e "Já tenho uma prévia" fazem a mesma busca (o bot
                responde certo pelo status real do pedido); "Criar música" abre o quiz. */}
            {!chose && !orderId && !busy && msgs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, alignSelf: 'stretch' }}>
                <button onClick={() => pickIntent('Já paguei o pedido 💳', '__INTENT_ORDER__')}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: `linear-gradient(135deg, ${P} 0%, ${P_DARK} 100%)`, color: '#fff', fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 700, boxShadow: '0 4px 14px -4px rgba(0,0,0,.35)' }}>
                  💳 Já paguei o pedido
                </button>
                <button onClick={() => pickIntent('Já tenho uma prévia 🎧', '__INTENT_ORDER__')}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                    background: '#fff', color: P_DARK, border: `1.5px solid ${P}`, fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 700 }}>
                  🎧 Já tenho uma prévia
                </button>
                <button onClick={startQuiz}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                    background: '#fff', color: P_DARK, border: `1.5px solid ${P}`, fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 700 }}>
                  ✨ Quero criar uma música
                </button>
              </div>
            )}
          </div>

          {/* Composer */}
          <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #E7E5E4', background: '#fff' }}>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder="Escreva sua mensagem…" disabled={busy}
              style={{ flex: 1, border: '1px solid #E7E5E4', borderRadius: 999, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={send} disabled={busy || !text.trim()} aria-label="Enviar"
              style={{ flex: '0 0 auto', width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: text.trim() ? 'pointer' : 'default', background: `linear-gradient(135deg, ${P} 0%, ${P_DARK} 100%)`, color: '#fff', opacity: text.trim() ? 1 : .5, fontSize: 18 }}>➤</button>
          </div>
        </div>
      )}
    </>
  )
}
