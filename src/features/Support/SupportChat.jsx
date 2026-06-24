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

function Body({ text, mine }) {
  const str = String(text || '')
  const media = str.match(MEDIA_RE)
  const parts = str.split(URL_RE)
  // No balão do cliente (terracota) o link é branco; no da Bia (fundo branco) usa a
  // cor da marca — senão fica branco-no-branco e some.
  const linkColor = mine ? '#fff' : '#AB4B2B'
  return (
    <>
      {media && (/\.mp4$/i.test(media[1])
        ? <video src={media[1]} controls style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 6 }} />
        : <audio src={media[1]} controls style={{ width: '100%', marginBottom: 6 }} />)}
      <span>{parts.map((p, i) => /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: linkColor, textDecoration: 'underline', fontWeight: 600, wordBreak: 'break-all' }}>{p}</a>
        : <span key={i}>{p}</span>)}</span>
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
  const scroller = useRef(null)
  const lastOutAt = useRef(null)

  const orderId = readOrderId(loc.pathname)

  const persist = useCallback((arr) => {
    try { sessionStorage.setItem('lc_chat_msgs', JSON.stringify(arr.slice(-80))) } catch (_) {}
  }, [])
  const push = useCallback((m) => {
    setMsgs(prev => { const next = [...prev, m]; persist(next); return next })
    if (m.role === 'out' && m.created_at) lastOutAt.current = m.created_at
  }, [persist])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, open])

  // Saudação contextual ao abrir pela 1ª vez (text vazio → bot responde pelo estado).
  useEffect(() => {
    if (!open || greeted) return
    setGreeted(true)
    if (msgs.length) return // já tem histórico → não re-cumprimenta
    sendRaw('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
          push({ role: 'out', body: m.body, author: m.author, created_at: m.created_at })
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
      for (const m of (r.replies || [])) push({ role: 'out', body: m.body, author: m.author || 'bia', created_at: m.created_at })
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
      {/* Botão flutuante */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Falar com a Bia"
          style={{
            position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000,
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 8px 8px',
            background: '#fff', border: 'none', borderRadius: 999, cursor: 'pointer',
            boxShadow: '0 10px 30px -8px rgba(0,0,0,.35)', fontFamily: 'Inter, system-ui, sans-serif',
          }}>
          <span style={{ position: 'relative', width: 42, height: 42, flex: '0 0 auto' }}>
            <img src="/assets/Bia.jpeg" alt="Bia" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.display = 'none' }} />
            <span style={{ position: 'absolute', right: 0, bottom: 2, width: 11, height: 11, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} />
          </span>
          <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#1C1917' }}>Falar com a Bia</span>
            <span style={{ display: 'block', fontSize: 11.5, color: '#16a34a', fontWeight: 600 }}>online · responde na hora</span>
          </span>
        </button>
      )}

      {/* Painel do chat */}
      {open && (
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
              <span style={{ position: 'absolute', right: -1, bottom: 1, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} />
            </span>
            <div style={{ flex: 1, lineHeight: 1.25 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Bia · Lembrança Cantada</div>
              <div style={{ fontSize: 11.5, opacity: .9 }}>Atendimento · responde na hora</div>
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
