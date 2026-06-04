import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Quiz from './Quiz'
// Lembrança Cantada · Design System (src/components/ui)
// Importamos os componentes TSX direto dos arquivos pra evitar resolver
// pelo `index.js` legado que mistura JSX em arquivo .js (Vite/oxc nao
// processa). O `index.ts` exporta todos mas Vite prioriza o .js irmao
// na resolucao default, entao temos que ser explicitos.
import { Pill } from './components/ui/Pill'
import { Badge } from './components/ui/Badge'
import { Card } from './components/ui/Card'
import { Accordion } from './components/ui/Accordion'

const API_URL = 'https://suno-api-novo.bvph.uk'

// Fluxo primário: QUIZ personalizado.
// Aprovado → sempre abre o quiz nos CTAs principais; chat fica como fallback
// (acessível por "prefiro conversar" dentro do próprio quiz).
const USE_QUIZ = true

// Rastreamento Meta Pixel + Google Analytics (GA4) de uma vez. custom=true => trackCustom no Meta.
function track(event, params, custom) {
  try { if (typeof window !== 'undefined' && window.fbq) window.fbq(custom ? 'trackCustom' : 'track', event, params || {}) } catch (_) {}
  try { if (typeof window !== 'undefined' && window.gtag) window.gtag('event', event, params || {}) } catch (_) {}
}
const priceToNum = (p) => Number(String(p || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0
const PLAN_VALUES = { musica: 19.90, completa: 29.90 }
function trackPurchase() {
  let v = 0
  try { v = Number(localStorage.getItem('hc_pay_value')) || 0 } catch (_) {}
  track('Purchase', { value: v, currency: 'BRL' })
}

// SEGURANÇA: o frontend NÃO fala mais direto com o banco (sem service_role exposta).
// Tudo passa pelo backend, que guarda as chaves no servidor e valida as entradas.
// Retry com backoff exponencial (3 tentativas) — protege a criação do pedido
// contra hiccup de rede ou 5xx temporário, evitando perder a história escrita.
async function apiCreateOrder(body) {
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${API_URL}/api/order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (r.ok) return r.json()
      if (r.status >= 400 && r.status < 500) throw new Error(`order ${r.status}`) // 4xx: não retenta
      lastErr = new Error(`order ${r.status}`)
    } catch (err) { lastErr = err }
    // backoff: 250ms · 750ms · 2250ms
    await new Promise(res => setTimeout(res, 250 * Math.pow(3, attempt)))
  }
  throw lastErr || new Error('order failed')
}
async function apiOrderStatus(id) {
  try {
    const r = await fetch(`${API_URL}/api/order/${id}/status`)
    if (!r.ok) return null
    return await r.json()
  } catch (_) { return null }
}

// Cliente recorrente: persistência leve em localStorage. Não tem TTL —
// o cliente passou a confiar na gente, faz sentido lembrar dele.
// Limpamos só se algo der errado ou se ele apertar "sair" (não implementado).
const HC_CUSTOMER_KEY = 'hc_customer'
function loadCustomer() {
  try {
    const raw = localStorage.getItem(HC_CUSTOMER_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (!c || !c.phone) return null
    return { phone: String(c.phone), name: String(c.name || ''), savedAt: c.savedAt || Date.now() }
  } catch (_) { return null }
}
function saveCustomer({ phone, name }) {
  try {
    const ph = String(phone || '').replace(/\D/g, '')
    if (ph.length < 10) return
    localStorage.setItem(HC_CUSTOMER_KEY, JSON.stringify({ phone: ph, name: name || '', savedAt: Date.now() }))
  } catch (_) {}
}
function clearCustomer() {
  try { localStorage.removeItem(HC_CUSTOMER_KEY) } catch (_) {}
}

// Pedido em andamento: salvo quando o quiz finaliza e o orderId é criado.
// Sobrevive a reload, fechar a aba, etc. — assim o cliente NÃO perde a
// geração em curso. Tem TTL de 24h pra não ficar acumulando lixo se ele
// abandonar o fluxo. Limpado quando entra em result desbloqueado OU quando
// clica em "criar outra música".
const HC_CURRENT_ORDER_KEY = 'hc_current_order'
const HC_CURRENT_ORDER_TTL_MS = 24 * 60 * 60 * 1000  // 24h

function loadCurrentOrder() {
  try {
    const raw = localStorage.getItem(HC_CURRENT_ORDER_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || !o.id) return null
    // TTL: ignora pedidos antigos (cliente provavelmente já saiu há muito)
    if (o.savedAt && Date.now() - o.savedAt > HC_CURRENT_ORDER_TTL_MS) {
      localStorage.removeItem(HC_CURRENT_ORDER_KEY)
      return null
    }
    return o
  } catch (_) { return null }
}
function saveCurrentOrder({ id, honoreeName, plan, customerName, phone }) {
  try {
    if (!id) return
    localStorage.setItem(HC_CURRENT_ORDER_KEY, JSON.stringify({
      id, honoreeName: honoreeName || '', plan: plan || 'musica',
      customerName: customerName || '', phone: phone || '',
      savedAt: Date.now(),
    }))
  } catch (_) {}
}
function clearCurrentOrder() {
  try { localStorage.removeItem(HC_CURRENT_ORDER_KEY) } catch (_) {}
}

async function apiOrderError(id, msg) {
  try {
    await fetch(`${API_URL}/api/order/${id}/error`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error_message: String(msg || '').slice(0, 400) }),
    })
  } catch (_) {}
}
// PAGAMENTO (InfinitePay) — via backend, sem expor chave
async function apiPayCreate(orderId, plan) {
  // manda só o IDENTIFICADOR do plano — o preço é definido no backend (anti-adulteração)
  const r = await fetch(`${API_URL}/api/pay/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, plan }),
  })
  if (!r.ok) throw new Error(`pay ${r.status}`)
  return r.json()
}
async function apiChatAck(payload) {
  try {
    const r = await fetch(`${API_URL}/api/chat/ack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (!r.ok) return { reply: null, needMore: false }
    return await r.json()
  } catch (_) { return { reply: null, needMore: false } }
}
async function apiTranscribe(blob) {
  const fd = new FormData()
  fd.append('audio', blob, 'audio.webm')
  const r = await fetch(`${API_URL}/api/transcribe`, { method: 'POST', body: fd })
  if (!r.ok) throw new Error(`transcribe ${r.status}`)
  const j = await r.json()
  return (j && j.text) ? j.text.trim() : ''
}
async function apiPayVerify(orderId, transaction_nsu, slug) {
  try {
    const r = await fetch(`${API_URL}/api/pay/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, transaction_nsu, slug }),
    })
    if (!r.ok) return { ok: false, paid: false }
    return await r.json()
  } catch (_) { return { ok: false, paid: false } }
}
async function apiOrderLookup(phone) {
  try {
    const r = await fetch(`${API_URL}/api/order/lookup?phone=${encodeURIComponent(phone)}`)
    if (!r.ok) return { ok: false, orders: [] }
    return await r.json()
  } catch (_) { return { ok: false, orders: [] } }
}
// persistência incremental: atualiza campos do pedido conforme a conversa anda
async function apiOrderUpdate(id, fields) {
  if (!id) return
  try {
    await fetch(`${API_URL}/api/order/${id}/update`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    })
  } catch (_) {}
}
// músicas/vídeo de exemplo mostrados ENQUANTO a prévia gera (entretém o cliente)
// Músicas REAIS de clientes (versão completa) usadas como prova social na
// tela "Últimas músicas dos nossos clientes" durante a geração. ANTES estavam
// apontando pra /assets/musicas/m1.mp3 etc que eram só prévias de 35s —
// trocado pelos arquivos reais em /assets/Para {Nome}.mp3 (~3min cada).
const WAIT_SONGS = [
  { title: 'Para Beatriz',  meta: 'Sertanejo · Romântico', src: '/assets/Para%20Beatriz.mp3' },
  { title: 'Para Camila',   meta: 'Pop romântico',          src: '/assets/Para%20Camila.mp3' },
  { title: 'Para Daniel',   meta: 'Pagode',                 src: '/assets/Para%20Daniel.mp3' },
  { title: 'Para Eduardo',  meta: 'MPB',                    src: '/assets/Para%20Eduardo.mp3' },
  { title: 'Para Vanessa',  meta: 'Sertanejo',              src: '/assets/Para%20Vanessa.mp3' },
  { title: 'Para Yasmim',   meta: 'Pop romântico',          src: '/assets/Para%20Yasmim.mp3' },
]
const WAIT_VIDEO = { src: '/assets/previa/previa-web.mp4', poster: '/assets/previa/previa-poster.jpg' }
// rate limit: pode pedir uma nova prévia? (1 não-paga por número/24h)
async function apiCanPreview(phone, exclude) {
  try {
    const r = await fetch(`${API_URL}/api/order/can_preview?phone=${encodeURIComponent(phone)}&exclude=${encodeURIComponent(exclude || '')}`)
    if (!r.ok) return { blocked: false }
    return await r.json()
  } catch (_) { return { blocked: false } }
}
// persistência do pedido ativo no navegador (sobrevive a refresh)
const HC_ORDER_KEY = 'hc_order'
function saveOrderLocal(o) { try { localStorage.setItem(HC_ORDER_KEY, JSON.stringify(o)) } catch (_) {} }
function loadOrderLocal() { try { return JSON.parse(localStorage.getItem(HC_ORDER_KEY) || 'null') } catch (_) { return null } }
function clearOrderLocal() { try { localStorage.removeItem(HC_ORDER_KEY) } catch (_) {} }

/* ── Icons ── */
const WhatsAppIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
)
const InstaIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
)
/* ── Ícones (Lucide · stroke currentColor) ── */
const Ico = ({ d, s = 20, fill = 'none' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const IconMusic = (p) => <Ico {...p} d={<><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>} />
const IconPlay = (p) => <Ico {...p} fill="currentColor" d={<polygon points="6 3 20 12 6 21 6 3"/>} />
const IconPause = (p) => <Ico {...p} fill="currentColor" d={<><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>} />
const IconGift = (p) => <Ico {...p} d={<><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></>} />
const IconZap = (p) => <Ico {...p} d={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>} />
const IconLock = (p) => <Ico {...p} d={<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>} />
const IconSend = (p) => <Ico {...p} d={<><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></>} />
const IconMic = (p) => <Ico {...p} d={<><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3"/></>} />
const IconCheckCheck = (p) => <Ico {...p} d={<><path d="m2 12 5 5L18 6"/><path d="m12 17 1 1L23 7"/></>} />
const IconArrowRight = (p) => <Ico {...p} d={<><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>} />
const IconArrowLeft = (p) => <Ico {...p} d={<><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>} />
const IconPhone = (p) => <Ico {...p} d={<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>} />
const IconVideo = (p) => <Ico {...p} d={<><path d="m23 7-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></>} />
const IconMore = (p) => <Ico {...p} d={<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>} />
const IconSun = (p) => <Ico {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>} />
const IconMoon = (p) => <Ico {...p} d={<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>} />
const IconHeart = (p) => <Ico {...p} d={<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>} />
const IconSparkRm = (p) => <Ico {...p} d={<><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/></>} />
const IconStar = (p) => <Ico {...p} fill="currentColor" d={<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>} />
const IconShare = (p) => <Ico {...p} d={<><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/></>} />
const IconClock = (p) => <Ico {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />
const IconCard = (p) => <Ico {...p} d={<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>} />
const IconMessage = (p) => <Ico {...p} d={<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>} />

const Waveform = () => {
  const heights = [30,60,45,80,55,35,70,50,65,40,75,30]
  return <div className="waveform">{heights.map((h,i) => <div key={i} className="wave-bar" style={{height:`${h}%`}} />)}</div>
}

/* ── Genre data ── */
const GENRES = [
  { label: 'Sertanejo', icon: '🎵' },
  { label: 'Sertanejo Raiz', icon: '🎶' },
  { label: 'Samba', icon: '🥁' },
  { label: 'Acústico', icon: '🎸' },
  { label: 'Pagode', icon: '🪘' },
  { label: 'Pop', icon: '⭐' },
  { label: 'Rock', icon: '🎸' },
  { label: 'Rap', icon: '🎤' },
  { label: 'Hip-Hop', icon: '🎧' },
  { label: 'RnB', icon: '💜' },
  { label: 'Jazz', icon: '🎷' },
  { label: 'Clássico', icon: '🎻' },
  { label: 'Reggae', icon: '🌿' },
  { label: 'Metal', icon: '⚡' },
  { label: 'Funk', icon: '📻' },
  { label: 'Gospel', icon: '📖' },
  { label: 'Forró', icon: '🪗' },
  { label: 'Axé', icon: '😄' },
  { label: 'MPB', icon: '🎙️' },
  { label: 'Trap', icon: '🔊' },
  { label: 'Eletrônica', icon: '💿' },
]
const MOODS = ['Romântico', 'Feliz', 'Relaxante', 'Épico', 'Triste', 'Agressivo', 'Animado', 'Adoração']
const VOICES = [
  { label: 'Masculino', icon: '👨' },
  { label: 'Feminino', icon: '👩' },
  { label: 'Deixe o maestro decidir', icon: '🎼' },
]
const RELATIONSHIPS = ['Esposo(a)', 'Namorado(a)', 'Filho(a)', 'Pai/Mãe', 'Amigo(a)', 'Eu Mesmo']

/* ── Oferta de lançamento: janela de 5 min por visita (persiste no localStorage,
   não reseta a cada reload). Some sozinha quando zera. ── */
function getOfferEnd() {
  // sempre começa em 5:00 e vai diminuindo (a cada carregamento da página)
  return Date.now() + 5 * 60 * 1000
}
function Countdown({ end, compact }) {
  const [left, setLeft] = useState(Math.max(0, end - Date.now()))
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, end - Date.now())), 1000)
    return () => clearInterval(id)
  }, [end])
  if (left <= 0) return null
  const pad = n => String(n).padStart(2, '0')
  const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60
  const Box = ({ v, l }) => <div className="cd-box"><span className="cd-num">{pad(v)}</span><span className="cd-lbl">{l}</span></div>
  if (compact) return (
    <span className="countdown countdown-compact" role="timer" aria-label="Tempo restante da oferta">
      <Box v={m} l="min" /><span className="cd-sep">:</span><Box v={s} l="seg" />
    </span>
  )
  return (
    <div className="offer-urgency">
      <div className="offer-urgency-top"><IconZap s={15} /> Oferta de lançamento — termina em</div>
      <div className="countdown" role="timer" aria-label="Tempo restante da oferta">
        <Box v={m} l="min" /><span className="cd-sep">:</span><Box v={s} l="seg" />
      </div>
    </div>
  )
}

/* ── Step Indicator ── */
const StepIndicator = ({ current, total }) => (
  <div className="step-indicator">
    {Array.from({ length: total }, (_, i) => (
      <div key={i} className="step-indicator-item">
        <div className={`step-dot${i + 1 <= current ? ' active' : ''}${i + 1 < current ? ' done' : ''}`}>
          {i + 1 < current ? '✓' : i + 1}
        </div>
        {i < total - 1 && <div className={`step-line${i + 1 < current ? ' active' : ''}`} />}
      </div>
    ))}
  </div>
)

/* ══════════════════════════════════════════════════════════════
   TYPEWRITER · hero · frases rotativas com efeito de "digitando"
   ══════════════════════════════════════════════════════════════
   Lista de variações de "Uma música para …" que vão dando hint do
   uso casual do produto. Emoji no fim leva o tom; varia tanto que
   o usuário sente "isso serve pra qualquer ocasião". */
const HERO_TYPED_PHRASES = [
  { text: 'para comemorar um aniversário' },
  { text: 'para seu filho campeão' },
  { text: 'para sua mãe querida' },
  { text: 'para homenagear alguém especial' },
  { text: 'para seu melhor amigo' },
  { text: 'para alguém inesquecível' },
]

function Typewriter({ phrases, prefix = 'Uma música ' }) {
  const [phIdx, setPhIdx] = useState(0)
  const [shown, setShown] = useState('')
  const [phase, setPhase] = useState('typing')  // 'typing' | 'pause' | 'deleting'

  useEffect(() => {
    const cur = phrases[phIdx % phrases.length].text
    let timeoutMs = 60      // velocidade de digitação por char
    if (phase === 'typing') {
      if (shown.length < cur.length) {
        const t = setTimeout(() => setShown(cur.slice(0, shown.length + 1)), timeoutMs)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => setPhase('deleting'), 1800)   // pausa lendo a frase
        return () => clearTimeout(t)
      }
    }
    if (phase === 'deleting') {
      if (shown.length > 0) {
        const t = setTimeout(() => setShown(cur.slice(0, shown.length - 1)), 30)
        return () => clearTimeout(t)
      } else {
        // próxima frase
        setPhase('typing')
        setPhIdx(i => (i + 1) % phrases.length)
      }
    }
  }, [shown, phase, phIdx, phrases])

  const cur = phrases[phIdx % phrases.length]
  // mostra o emoji só quando a frase está completamente digitada (efeito "chegou")
  const showEmoji = phase !== 'deleting' && shown.length === cur.text.length

  return (
    <p className="hero-typewriter" aria-live="polite" aria-atomic="true">
      <span className="hero-typewriter-prefix">{prefix}</span>
      <span className="hero-typewriter-text">{shown}</span>
      <span className="hero-typewriter-cursor" aria-hidden="true">|</span>
      <span className={`hero-typewriter-emoji${showEmoji ? ' is-shown' : ''}`} aria-hidden="true">{cur.emoji}</span>
    </p>
  )
}

/* ══════════════════════════════════════════════════════════════
   PROGRESS VIEW · tela vendedora enquanto a música é gerada
   ── Inspirada na tela "Sua música está nascendo" ──
   Mostra:
   - Headline + previsão de tempo (ETA)
   - Waveform pulsante grande
   - Barra de progresso terracota
   - Card "Rascunho da letra" com linhas surgindo progressivamente,
     personalizadas com o nome do homenageado e o estilo
   - Carrossel discreto de exemplos de músicas já geradas embaixo
   ══════════════════════════════════════════════════════════════ */

// Constrói o pool de mensagens do "rascunho da letra" personalizadas.
// Sem qualquer menção a IA — vibe artesanal de compositor pensando alto.
// Dividido em 3 fases que se ativam conforme o progresso:
//   1. discovery  (0–30%) — leitura, descoberta, listando palavras
//   2. composing  (30–70%) — refrão, rimas, costura
//   3. finishing  (70–100%) — produção, mixagem, gravação
// A primeira fase também tem uma "âncora" inicial em `at`, depois rola livre.
function getDraftLines(formData) {
  const nm = (formData?.honoreeName || 'essa pessoa').trim()
  const relRaw = (formData?.relationship || '').toLowerCase()
  const possMap = [
    ['esposa', 'minha esposa'], ['esposo', 'meu esposo'],
    ['namorada', 'minha namorada'], ['namorado', 'meu namorado'],
    ['paquera', 'meu(minha) paquera'],
    ['filha', 'minha filha'], ['filho', 'meu filho'],
    ['neta', 'minha neta'], ['neto', 'meu neto'],
    ['sobrinh', 'meu(minha) sobrinho(a)'],
    ['afilhad', 'meu(minha) afilhado(a)'],
    ['mãe', 'minha mãe'], ['pai', 'meu pai'],
    ['irmã', 'minha irmã'], ['irmão', 'meu irmão'],
    ['avó', 'minha avó'], ['avô', 'meu avô'],
    ['amiga', 'minha amiga'], ['amigo', 'meu amigo'],
    ['ex', 'meu(minha) ex'],
  ]
  const poss = (possMap.find(([k]) => relRaw.includes(k))?.[1]) || 'essa pessoa especial'
  const genre = (formData?.genre || 'sertanejo').toLowerCase()
  const mood  = (formData?.mood  || 'romântico').toLowerCase()

  return {
    discovery: [
      `Lendo a história de ${poss} ${nm}…`,
      `Sublinhando as palavras que pesam…`,
      `Anotando: "começo", "marcou", "pra sempre"…`,
      `Listando rimas em "ão": canção, paixão, coração…`,
      `Pensando: como começar a homenagem?`,
      `Buscando o tom certo pra ${poss}…`,
      `Procurando rima pro começo…`,
      `Releitura — quero pegar o detalhe que ninguém viu.`,
      `"${nm}" combina com "coração", "razão", "missão"…`,
      `Marcando o que NÃO pode faltar na letra.`,
    ],
    composing: [
      `"${nm}, eu lembro do começo…"`,
      `Costurando um refrão que gruda…`,
      `Testando rima: "${nm}" + "eterna canção"…`,
      `Achei: "${nm}, minha eterna canção".`,
      `Lapidando o segundo verso…`,
      `Apagando "belo demais" — tá cliché. Troco por "rara".`,
      `Escrevendo a ponte: queria uma virada inesperada.`,
      `Tirando uma palavra do refrão pra dar respiro…`,
      `Pensando no acorde antes do refrão…`,
      `Anotando: o refrão pede ré maior, mais aberto.`,
      `"E se o final lembrar o começo?"`,
      `Achei outra: "${nm}, a melodia que eu queria viver".`,
      `Costurando "saudade" no primeiro verso…`,
      `Riscando duas linhas — tô economizando na ${mood || 'palavra'}…`,
      `Anotando: deixar a voz solta no terceiro verso.`,
      `Refrão tá pronto. Decorando antes de gravar.`,
    ],
    finishing: [
      `Afinando o violão pro clima ${mood}…`,
      `Gravando a voz no tom de ${genre}…`,
      `Subindo a emoção no segundo verso…`,
      `Adicionando um coro suave no refrão…`,
      `Equalizando os agudos pra não cansar…`,
      `Comprimindo levemente — quero ficar acolhedor.`,
      `Mixando, ajustando o tempo…`,
      `Uma respirada de violão antes da última estrofe…`,
      `Última passada de carinho no refrão…`,
      `Selando a virada da prévia…`,
      `Conferindo o silêncio antes do refrão final…`,
      `Quase lá. Salvando o arquivo…`,
      `Pronto. Mandando pro seu WhatsApp 💜`,
    ],
  }
}

/* ── Painel "Rascunho da letra" com efeito typewriter ao vivo ──
   - Compositor pensando em voz alta, dividido em 3 fases por progresso
   - Cada mensagem é digitada char por char (com jitter humano)
   - Quando termina, é "fixada"; outra é sorteada do pool da fase atual
   - O loop NÃO PARA até o progresso chegar a 100% — pode repetir
   - Linhas antigas SOBEM e somem no topo via mask gradient
   - Cursor pisca no fim da linha sendo digitada
   - Auto-scroll mantém a última linha sempre visível */
function LiveLyrics({ formData, progress, embedded = false }) {
  const pool = useMemo(() => getDraftLines(formData), [formData])

  // Decide a fase atual com base no progresso (loop pega frases dela)
  const phaseFor = (p) => p < 30 ? 'discovery' : p < 70 ? 'composing' : 'finishing'

  const [currentText, setCurrentText] = useState('')
  const [typed, setTyped] = useState(0)
  const [completed, setCompleted] = useState([])
  const bodyRef = useRef(null)
  const lastPickedRef = useRef(null)   // evita repetir a MESMA frase 2x seguidas

  // Espelhamos o progresso num ref pra LER lá sem causar re-trigger do
  // typewriter. Antes o `progress` estava no array de deps do effect de
  // digitação — toda vez que o backend/tick atualizava o progresso (a cada
  // 250ms), o cleanup cancelava o setTimeout do próximo char ANTES dele
  // disparar. Resultado: digitação travada em ~1 char/seg. Mantendo via ref,
  // só `typed` e o fim-de-linha controlam o ritmo (~30 chars/seg como manda
  // o jitter 22-57ms).
  const progressRef = useRef(progress)
  useEffect(() => { progressRef.current = progress }, [progress])

  // Sorteia uma frase do pool da fase atual, evitando ser igual à última
  const pickNext = (p) => {
    const list = pool[phaseFor(p)] || []
    if (!list.length) return null
    let candidates = list.filter(s => s !== lastPickedRef.current)
    if (!candidates.length) candidates = list
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    lastPickedRef.current = next
    return next
  }

  // Inicializa a primeira frase ASSIM QUE o componente monta — sem esperar
  // progresso. Antes a gente exigia progress>=2 mas em dev/edge cases isso
  // adia o início do typewriter desnecessariamente.
  useEffect(() => {
    if (currentText) return
    setCurrentText(pickNext(progressRef.current) || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drive do typewriter via requestAnimationFrame + tempo decorrido.
  //
  // Por que NÃO setTimeout pequeno (22-57ms)?
  //   - Navegadores (especialmente iOS Safari e Chromium em abas não-focadas)
  //     CLAMPam setTimeout < 1s pra ~1Hz quando a aba não é a "ativa". Isso
  //     incluí casos sutis: WhatsApp web em outra aba, app trocando contexto,
  //     PWA em standby breve. Resultado: digitação a 1 char/s = parece
  //     travada → bug que o cliente reportou ("não tá mostrando gerando").
  //
  // rAF não é clampado da mesma forma quando a página é visível, e quando ela
  // volta do background a gente USA O TEMPO DECORRIDO pra "pular" pra onde
  // deveria estar — auto-corrige sem ficar pulando bruscamente entre o
  // último frame.
  useEffect(() => {
    if (!currentText) return
    let raf = 0
    let pauseTimer = 0
    const start = performance.now()
    const CHARS_PER_SEC = 28   // ritmo humano confortável (~35ms/char)
    const tick = () => {
      const elapsedMs = performance.now() - start
      const want = Math.min(currentText.length, Math.floor(elapsedMs * CHARS_PER_SEC / 1000))
      setTyped(want)
      if (want < currentText.length) {
        raf = requestAnimationFrame(tick)
      } else {
        // linha completa — pausa breve e sorteia a próxima
        pauseTimer = setTimeout(() => {
          setCompleted(c => [...c, currentText])
          const p = progressRef.current
          const isLastPhraseDone = p >= 100 && /WhatsApp/i.test(currentText)
          if (isLastPhraseDone) return
          if (p >= 100) {
            const finale = (pool.finishing || []).find(s => /WhatsApp/i.test(s))
            setCurrentText(finale || pickNext(p))
          } else {
            setCurrentText(pickNext(p) || '')
          }
          setTyped(0)
        }, 700 + Math.random() * 500)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(pauseTimer)
    }
  }, [currentText, pool])

  // auto-scroll: mantém a última linha sempre visível embaixo
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [completed, typed])

  const showCurrent = !!currentText
  const typedSoFar = showCurrent ? currentText.slice(0, typed) : ''

  return (
    <div className={embedded ? 'gen-lyrics gen-lyrics--embedded' : 'gen-lyrics'}>
      <div className="gen-lyrics-head">
        <span className="gen-lyrics-eyebrow">Rascunho da letra</span>
        <span className="gen-lyrics-pulse" aria-hidden="true" />
      </div>
      <div className="gen-lyrics-body" ref={bodyRef} role="log" aria-live="polite">
        {completed.length === 0 && !showCurrent ? (
          <p className="gen-lyrics-line gen-lyrics-line--placeholder">
            Abrindo o caderno e a caneta…
          </p>
        ) : (
          <>
            {completed.map((t, i) => (
              <p key={i} className="gen-lyrics-line gen-lyrics-line--done">{t}</p>
            ))}
            {showCurrent && (
              <p className="gen-lyrics-line gen-lyrics-line--current">
                {typedSoFar}
                <span className="gen-lyrics-cursor" aria-hidden="true">▌</span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Formata segundos restantes em mm:ss
function fmtEta(secs) {
  if (!Number.isFinite(secs) || secs < 0) secs = 0
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* Ícone de disco de vinil — substitui o emoji 🎵 nas capas dos players.
   Tem groove (sulcos), label central terracota e ponto branco brilhante.
   Pode girar com `spinning` quando o áudio está tocando. */
function VinylDisc({ size = 56, spinning = false, locked = false }) {
  const s = size
  return (
    <span className={`vinyl-disc${spinning ? ' is-spinning' : ''}${locked ? ' is-locked' : ''}`}
      style={{ width: s, height: s }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={s} height={s}>
        <defs>
          <radialGradient id="vinyl-edge" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1c1917" />
            <stop offset="65%" stopColor="#292524" />
            <stop offset="100%" stopColor="#0c0a09" />
          </radialGradient>
          <radialGradient id="vinyl-shine" cx="30%" cy="25%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill="url(#vinyl-edge)" />
        {/* sulcos (grooves) */}
        <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        {/* label central terracota */}
        <circle cx="32" cy="32" r="12" fill="#C96240" />
        <circle cx="32" cy="32" r="12" fill="url(#vinyl-shine)" />
        {/* furinho central */}
        <circle cx="32" cy="32" r="2.2" fill="#1C1917" />
        {/* brilho diagonal */}
        <path d="M 14 14 Q 32 8 50 22" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {locked && (
        <span className="vinyl-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="46%" height="46%" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" stroke="none"/>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
          </svg>
        </span>
      )}
    </span>
  )
}

/* Mini-player customizado · botão play terracota + barra progresso + tempo.
   Substitui o <audio controls> nativo (que é feio e não combina com o DS). */
function MiniPlayer({ src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)

  // pausa o áudio quando o src muda (carrossel troca)
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.pause(); setPlaying(false); setT(0); setDur(0)
  }, [src])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  const seek = (e) => {
    const a = audioRef.current
    if (!a || !dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    a.currentTime = Math.max(0, Math.min(dur, pct * dur))
  }

  const fmt = (s) => {
    if (!Number.isFinite(s)) return '0:00'
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const pct = dur > 0 ? (t / dur) * 100 : 0

  return (
    <div className="mini-player">
      <button type="button" className="mini-player-btn"
        onClick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        )}
      </button>
      <div className="mini-player-bar" onClick={seek} role="slider"
        aria-valuemin={0} aria-valuemax={Math.round(dur || 0)} aria-valuenow={Math.round(t || 0)}>
        <div className="mini-player-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="mini-player-time">{fmt(t)} / {fmt(dur)}</span>
      <audio ref={audioRef} src={src} preload="metadata"
        onTimeUpdate={e => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDur(e.currentTarget.duration || 0)}
        onEnded={() => { setPlaying(false); setT(0) }}
      />
    </div>
  )
}

/* Depoimentos · prova real abaixo do CTA na tela de prévia.
   Reusa as músicas de espera (m1/m2/m3) como áudio dos testimonials. */
const RESULT_TESTIMONIALS = [
  { title: 'Deus me deu você',     duration: '2:34', author: 'Pamela S.',  quote: 'Ficou simplesmente perfeito… ele chorou ouvindo 💖', src: '/assets/musicas/m1.mp3' },
  { title: 'Nosso começo',         duration: '3:44', author: 'Letícia M.', quote: 'Parecia que a música conhecia nossa história inteira…', src: '/assets/musicas/m2.mp3' },
  { title: 'Minha vida com você',  duration: '3:21', author: 'Ricardo M.', quote: 'Ela se emocionou ouvindo. Nunca vou esquecer esse momento.', src: '/assets/musicas/m3.mp3' },
]

/* ══════════════════════════════════════════════════════════════
   PIX PAYMENT MODAL · pagamento PIX manual (sem InfinitePay)
   ── Inspirado na referência enviada · QR + chave + botão copiar.
   ══════════════════════════════════════════════════════════════ */
// Chave Pix do recebedor (e-mail). Conta é da NIKELSON DA SILVA — é o nome que
// aparece no app do banco do cliente quando ele cola o código Pix. O Merchant
// Name no BR Code precisa estar em CAIXA ALTA, sem acentos, ≤25 chars.
const PIX_KEY = 'pix.historiascantadas@gmail.com'
const PIX_KEY_LABEL = 'pix.historiascantadas@gmail.com'  // já é o formato bonito
const PIX_MERCHANT_NAME = 'NIKELSON DA SILVA'  // titular da conta — aparece no banco do cliente
const PIX_MERCHANT_CITY = 'SAO PAULO'

const PLAN_DETAILS = {
  musica:   { name: 'Música personalizada',         amount: 19.90 },
  completa: { name: 'Música personalizada + vídeo', amount: 29.90 },
}
const fmtBRL = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',')

/* CRC16-CCITT-FALSE · necessário no fim do BR Code (campo 63 da spec EMV) */
function pixCrc16(str) {
  let crc = 0xFFFF
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xFF) << 8
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
      crc &= 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/* Gera o BR Code PIX (EMV) — quando o cliente escaneia esse QR no banco,
   chave + valor + recebedor já vêm preenchidos. Bem mais fácil que digitar.
   Spec: https://www.bcb.gov.br/content/estabilidadefinanceira/forumpireunioes/Anexo_I-ManualBRCode.pdf */
function pixBRCode({ key, amount, name = PIX_MERCHANT_NAME, city = PIX_MERCHANT_CITY, txid = '***' }) {
  const f = (id, v) => id + String(v.length).padStart(2, '0') + v
  // Sanitiza nome/city: ASCII uppercase, sem acentos, com limite EMV
  const norm = (s, max) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().slice(0, max)
  const merchantAccountInfo = f('00', 'br.gov.bcb.pix') + f('01', key)
  const additionalData = f('05', txid || '***')
  const amountStr = (amount != null) ? Number(amount).toFixed(2) : null
  let payload =
    f('00', '01') +                               // Payload Format Indicator
    f('26', merchantAccountInfo) +                // Merchant Account Information (PIX)
    f('52', '0000') +                             // MCC
    f('53', '986') +                              // Moeda (BRL)
    (amountStr ? f('54', amountStr) : '') +       // Valor (opcional)
    f('58', 'BR') +                               // País
    f('59', norm(name, 25)) +                     // Nome do recebedor (max 25)
    f('60', norm(city, 15)) +                     // Cidade (max 15)
    f('62', additionalData) +                     // Dados adicionais (TXID)
    '6304'                                        // Sufixo do CRC
  return payload + pixCrc16(payload)
}

// Constrói uma mensagem rica pro cliente abrir no WhatsApp da Bia + dispara
// um ping pro backend, que (1) salva o pedido de ajuda no proof_ai_data e
// (2) avisa o admin no Evolution imediatamente. Resultado: a Bia já vê o
// chat aberto sabendo de quem é, qual pedido, qual o problema da rejeição.
const BIA_PHONE_E164 = '5511920188319'
async function openHelpOnWhatsApp({ orderId, honoreeName, customerName, customerPhone, reasons = [], context = 'rejected' }) {
  const id8 = String(orderId || '').slice(0, 8).toUpperCase()
  // Mensagem repaginada (jun/2026): bem mais curta, escaneavel, focada em
  // acao. Cliente vai mandar o print do comprovante na sequencia, entao a
  // gente NAO precisa enrolar com motivos longos — Bia ve no painel.
  const first = (customerName || '').trim().split(' ')[0]
  const heyName = first ? `Oi Bia! Aqui é o(a) ${first} 💜` : 'Oi Bia! 💜'
  const text = [
    heyName,
    '',
    'Paguei o Pix da minha música mas o sistema não conseguiu liberar automaticamente. Pode dar uma olhadinha?',
    '',
    `🎵 *#${id8}* — música pra ${honoreeName || 'minha pessoa especial'}`,
    customerPhone ? `📱 ${customerPhone}` : '',
    '',
    'Vou mandar o comprovante aqui agora 👇',
  ].filter(Boolean).join('\n')
  const url = `https://wa.me/${BIA_PHONE_E164}?text=${encodeURIComponent(text)}`
  // Ping no backend (fire-and-forget) — admin já recebe o alerta no WhatsApp.
  try {
    if (orderId) {
      fetch(`${API_URL}/api/order/${orderId}/help_request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasons, context }),
        keepalive: true,
      }).catch(() => {})
    }
  } catch (_) {}
  // Abre o WhatsApp numa nova aba (fallback pra location se popup bloqueado)
  const w = window.open(url, '_blank', 'noopener,noreferrer')
  if (!w) window.location.href = url
}

/* ══════════════════════════════════════════════════════════════
   LOOKUP MODAL · Cliente busca pedidos pelo número do WhatsApp.
   Usado pra quem mudou de dispositivo, esvaziou cookies ou usa
   modo anônimo. Identificação 100% pelo telefone (nome só p/ UX).
   Persiste em localStorage ao encontrar, pra próxima visita ser
   reconhecida automaticamente.
   ══════════════════════════════════════════════════════════════ */
function LookupOrdersModal({ open, onClose, onFound }) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPhone(''); setLoading(false); setError('')
    // Decisão do dono: modal NÃO fecha com ESC nem clique fora — só no X.
    // Evita perda acidental de progresso.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Máscara leve: só permite dígitos e formata visualmente
  const formatPhone = (v) => {
    const d = String(v).replace(/\D/g, '').slice(0, 13)
    if (!d) return ''
    // 13 dígitos = 55 + DDD + 9 + 8 (formato internacional completo)
    // 11 = DDD + 9 + 8 (formato nacional)
    // exibe sempre como (DD) 9 XXXX-XXXX, ignorando 55 inicial pra estética
    const local = d.startsWith('55') ? d.slice(2) : d
    if (local.length <= 2) return `(${local}`
    if (local.length <= 7) return `(${local.slice(0, 2)}) ${local.slice(2)}`
    if (local.length <= 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7, 11)}`
  }

  const submit = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      setError('Digita o WhatsApp com DDD (mínimo 10 dígitos)')
      return
    }
    setLoading(true); setError('')
    try {
      const resp = await apiOrderLookup(digits)
      const orders = Array.isArray(resp?.orders) ? resp.orders : []
      const real = orders.filter(o => o.preview_audio_url || o.paid_at)
      if (real.length === 0) {
        setError('Não encontramos músicas com esse número. Que tal criar a primeira?')
        setLoading(false)
        return
      }
      // pega nome do cliente do pedido mais recente
      const name = real.find(o => o.customer_name)?.customer_name || ''
      saveCustomer({ phone: digits, name })
      onFound && onFound({ phone: digits, name }, real)
    } catch (_) {
      setError('Deu um erro ao buscar. Tenta de novo em instantes.')
      setLoading(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="lookup-modal-root" role="dialog" aria-modal="true" aria-labelledby="lookup-modal-title">
      {/* Backdrop apenas decorativo — não fecha o modal. Decisão do dono:
          só o X (.lookup-modal-close) fecha, pra evitar perda acidental. */}
      <div className="lookup-modal-backdrop" aria-hidden="true" />
      <div className="lookup-modal-card">
        <button type="button" className="lookup-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        <span className="lookup-modal-eyebrow">Minhas músicas</span>
        <h2 id="lookup-modal-title" className="lookup-modal-title">Qual o seu WhatsApp?</h2>
        <p className="lookup-modal-sub">A gente busca todas as músicas feitas com esse número.</p>

        <div className="lookup-modal-input-wrap">
          <span className="lookup-modal-prefix" aria-hidden="true">+55</span>
          <input
            id="lookup-phone-input"
            className="lookup-modal-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            placeholder="(11) 99999-8888"
            onChange={e => { setPhone(formatPhone(e.target.value)); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            disabled={loading}
            /* SEM autoFocus: em mobile causa salto da viewport quando o
               teclado abre, atrapalha mais do que ajuda. Cliente toca
               quando estiver pronto. */
          />
          <span className="lookup-modal-input-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </span>
        </div>
        {error && <p className="lookup-modal-error" role="alert">{error}</p>}

        <button type="button" className="lookup-modal-btn" onClick={submit} disabled={loading || phone.replace(/\D/g,'').length < 10}>
          {loading ? (
            <>
              <span className="pix-spinner" style={{width:14, height:14, borderWidth:2}} aria-hidden="true"/>
              Buscando…
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Buscar minhas músicas
            </>
          )}
        </button>

        <p className="lookup-modal-tip">
          Identificamos pelo número — independente de como você digitou (com ou sem 55, com ou sem o 9).
        </p>
      </div>
    </div>,
    document.body,
  )
}

function PixPaymentModal({ open, onClose, planKey = 'musica', orderId, honoreeName, customerName, customerPhone, onPaid, startAt = 'plan' }) {
  const [copied, setCopied] = useState(false)
  // 'plan' = escolha do plano · 'pay' = QR · 'upload' = comprovante · 'sending' · 'success' · 'review' · 'rejected'
  const [step, setStep] = useState('plan')
  // selectedPlan vive DENTRO do modal pra permitir o usuario trocar de plano
  // na tela 0 sem precisar reabrir. O prop planKey vira o default inicial.
  const [selectedPlan, setSelectedPlan] = useState(planKey)
  const [file, setFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const [proofResp, setProofResp] = useState(null)
  const plan = PLAN_DETAILS[selectedPlan] || PLAN_DETAILS.musica

  // Decisão do dono: só o X fecha — sem ESC, sem clique fora.
  // Evita perda acidental durante o pagamento (cliente pode tocar fora pra
  // alternar pro app do banco e voltar — não pode fechar o modal).
  useEffect(() => {
    if (!open) return
    // sempre que abrir, volta pra tela inicial. Default = 'plan' (escolha).
    // Quando aberto pelo atalho "Já paguei", vem como 'upload' e pula a escolha.
    setStep(startAt || 'plan'); setSelectedPlan(planKey); setFile(null); setFilePreview(null); setProofResp(null)
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
  // IMPORTANTE: mandamos `selectedPlan` (estado interno = escolha real do usuario
  // na tela 0) e NAO o prop `planKey` (default vinha como 'musica' do
  // startPayment). Bug reportado: cliente escolhia R$29,90, pagava certo, mas
  // o backend recebia plan='musica' (R$19,90 esperado) e a IA rejeitava por
  // valor divergente.
  const submitProof = async () => {
    if (!file || !orderId) return
    setStep('sending')
    try {
      const fd = new FormData()
      fd.append('proof', file)
      fd.append('plan', selectedPlan)
      const r = await fetch(`${API_URL}/api/order/${orderId}/proof`, { method: 'POST', body: fd })
      const data = await r.json().catch(() => ({}))
      setProofResp(data)
      if (data?.auto_approved) {
        setStep('success')
        // avisa o pai que o pedido foi pago — ele atualiza a view pra unlocked
        try { onPaid && onPaid(orderId, data) } catch (_) {}
      } else if (data?.proof_status === 'awaiting_validation') {
        setStep('review')
      } else {
        setStep('rejected')
      }
    } catch (_) {
      setProofResp({ reason: 'sem conexão' })
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
      try {
        const r = await fetch(`${API_URL}/api/pay/status?orderId=${encodeURIComponent(orderId)}`)
        const j = await r.json()
        if (!active) return
        if (j?.paid) {
          setStep('success')
          try { onPaid && onPaid(orderId, { auto_approved: true, abacate: true }) } catch (_) {}
        }
      } catch (_) {}
    }
    const id = setInterval(tick, 4000)
    return () => { active = false; clearInterval(id) }
  }, [open, step, orderId, onPaid])

  // Polling do status enquanto está em revisão manual.
  // Quando o admin aprovar via WhatsApp, o backend marca paid_at e desbloqueia
  // sem o cliente precisar dar reload. Pára quando o modal fecha ou troca de step.
  useEffect(() => {
    if (!open || step !== 'review' || !orderId) return
    let active = true
    const tick = async () => {
      try {
        const row = await apiOrderStatus(orderId)
        if (!active) return
        if (row?.paid_at || row?.status === 'paid' || row?.status === 'delivered') {
          setStep('success')
          try { onPaid && onPaid(orderId, { auto_approved: true, manual: true }) } catch (_) {}
        }
      } catch (_) {}
    }
    const id = setInterval(tick, 5000)
    tick()
    return () => { active = false; clearInterval(id) }
  }, [open, step, orderId, onPaid])

  // Countdown de 30s antes do botão "Já paguei" ficar clicável.
  // A intuição: dá tempo do cliente abrir o banco e colar — se o botão aparece
  // na hora, vira "clica antes de pagar". 30s é tempo plausível de transação Pix.
  // Persiste em sessionStorage por orderId, então fechar/reabrir o modal não reseta.
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
  // Antes resetava toda vez que o modal abria, então o cliente via 10:00 sempre
  // que voltava do app do banco — destruía a urgência. Agora gravamos o
  // timestamp de "primeira abertura" em localStorage por orderId e calculamos
  // o que sobrou em cada tick. Quando zera, ressuscita silenciosamente (loop
  // sutil — não trava o usuário). Limpo automaticamente após 10min de
  // inatividade na próxima abertura.
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

  // PIX agora vem da AbacatePay (confirmação automática). brCode + QR PNG
  // vêm do backend → cliente paga → webhook marca order como paid → app
  // detecta via polling em /api/pay/status (já existente abaixo).
  const [brCode, setBrCode] = useState('')
  const [qrSrc, setQrSrc] = useState('')
  const [payError, setPayError] = useState('')
  useEffect(() => {
    if (!open || !orderId || !selectedPlan) return
    // re-gera PIX sempre que o cliente troca de plano (musica ↔ completa)
    let cancelled = false
    setBrCode('')
    setQrSrc('')
    setPayError('')
    ;(async () => {
      try {
        const r = await fetch(`${API_URL}/api/pay/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, plan: selectedPlan }),
        })
        const j = await r.json()
        if (cancelled) return
        if (!r.ok || !j?.brCode) {
          setPayError(j?.error || 'Falha ao gerar PIX')
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

  // Copia 100% UNIVERSAL — funciona em iOS Safari, Android Chrome, Samsung
  // Internet, Firefox, Edge, WebViews (Instagram, FB), browsers antigos.
  //
  // Estrategia: execCommand SINCRONO primeiro (dentro do user gesture),
  // navigator.clipboard.writeText em PARALELO como reforco. Qualquer um que
  // funcionar copia. Feedback visual SEMPRE imediato.
  //
  // Por que execCommand primeiro? Em iOS Safari + WebView, o "user gesture"
  // que autoriza clipboard expira apos await assincrono. Se a gente esperasse
  // o moderno por 1500ms, o execCommand depois nao funcionaria. Entao a
  // gente roda o sincrono PRIMEIRO (gesture ainda fresco) e o moderno como
  // backup paralelo.
  const copy = (e) => {
    if (e?.preventDefault) e.preventDefault()
    // 1) feedback visual NA HORA — independente do resultado
    setCopied(true)
    setTimeout(() => setCopied(false), 2400)

    // 2) execCommand SINCRONO (dentro do user gesture original do click)
    //    Funciona em: iOS Safari (todas as versoes), Android, Edge legacy,
    //    Firefox, WebViews antigos, Samsung Internet, Brave, DuckDuckGo.
    let okSync = false
    try {
      const ta = document.createElement('textarea')
      ta.value = brCode
      ta.setAttribute('readonly', '')
      ta.setAttribute('contenteditable', 'true')
      // top:50% pra ficar VISIVEL na viewport (iOS rejeita execCommand em
      // elementos off-screen); opacity:0 esconde visualmente; font-size:16px
      // evita zoom no focus do iOS; pointer-events nao precisa bloquear.
      ta.style.cssText = 'position:fixed;top:50%;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;margin:0'
      document.body.appendChild(ta)
      // iOS Safari precisa de selectionRange explicito, nao basta select()
      ta.focus()
      ta.select()
      const range = document.createRange()
      range.selectNodeContents(ta)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      ta.setSelectionRange(0, brCode.length)
      okSync = document.execCommand('copy')
      sel.removeAllRanges()
      document.body.removeChild(ta)
    } catch (_) {}

    // 3) clipboard moderno em PARALELO (nao bloqueante). Se o sincrono falhou
    //    por algum motivo (browsers ultra-modernos sem execCommand), o
    //    moderno cobre. Se ambos rodarem, copia 2x mesma coisa — ok.
    try {
      const writePromise = navigator.clipboard?.writeText?.(brCode)
      if (writePromise && typeof writePromise.then === 'function') {
        // fire-and-forget: nao esperamos. Timeout interno via Promise.race
        // pra nao deixar pendurada na memoria.
        Promise.race([
          writePromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
        ]).catch(() => {})
      }
    } catch (_) {}
  }

  return createPortal(
    <div className="pix-modal-root" role="dialog" aria-modal="true" aria-labelledby="pix-modal-title">
      {/* Backdrop apenas decorativo — não fecha. Só o X (.pix-modal-close) fecha. */}
      <div className="pix-modal-backdrop" aria-hidden="true" />
      {/* X fora do card: position:fixed nao funciona DENTRO do card porque
          a animation pix-up usa transform, que cria containing block pros
          descendentes position:fixed. Movido pra cima do card. */}
      <button type="button" className="pix-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
      <div className="pix-modal-card">

        {/* Tela 0: PLAN · escolha entre música só (R$19,90) ou música + vídeo (R$29,90) */}
        {step === 'plan' && <>
        <span className="pix-modal-eyebrow">Escolha o plano</span>
        <h2 className="pix-modal-title">
          {honoreeName ? <>Sua música pra <em>{honoreeName}</em></> : 'Sua música'}
        </h2>
        <p className="pix-plan-sub">Os dois saem hoje. Escolha como quer receber.</p>

        <div className="pix-plan-list">
          {/* Featured PRIMEIRO · plano premium mais destacado pra induzir up-sell */}
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

        {/* Tela 1: PAY · QR + chave + botão "Já paguei" */}
        {step === 'pay' && <>
        <button type="button" className="pix-step-back" onClick={() => setStep('plan')}>← Trocar plano</button>
        <span className="pix-modal-eyebrow">Pagamento PIX</span>
        <h2 id="pix-modal-title" className="pix-modal-title">Desbloquear música</h2>

        <div className="pix-modal-amount-card">
          <span className="pix-modal-amount-label">Valor único</span>
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

        {/* Pagamento PIX agora é confirmado AUTOMATICAMENTE via webhook AbacatePay.
            Cliente não precisa enviar comprovante — basta pagar e aguardar (polling
            no useEffect detecta status=paid e fecha o modal). Botão é só visual,
            confirmação real vem do webhook. */}
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

        {/* Tela 2: UPLOAD · selecionar arquivo + enviar */}
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

        {/* Tela 3: SENDING · loading */}
        {step === 'sending' && <div className="pix-state pix-state--sending">
          <div className="pix-spinner" aria-hidden="true" />
          <h3>Conferindo seu comprovante…</h3>
          <p>Geralmente leva uns 10 segundos.</p>
        </div>}

        {/* Tela 4: SUCCESS · aprovado */}
        {step === 'success' && <div className="pix-state pix-state--success">
          <div className="pix-state-icon" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3>Pagamento aprovado!</h3>
          <p>Sua música completa e o vídeo já estão liberados pra baixar.</p>
          <button type="button" className="pix-modal-copy" onClick={onClose}>Ver minha música</button>
        </div>}

        {/* Tela 5: REVIEW · em revisão manual */}
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

        {/* Tela 6: REJECTED · comprovante inválido — mostra TODOS os motivos */}
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
          <button type="button" className="pix-wa-link"
            onClick={() => openHelpOnWhatsApp({
              orderId, honoreeName, customerName, customerPhone,
              reasons: proofResp?.reasons || [],
              context: 'rejected',
            })}>
            {/* Ícone WhatsApp oficial — bolha do balão + telefone */}
            <svg className="pix-wa-link-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.52 3.48A11.84 11.84 0 0 0 12.04 0C5.5 0 .2 5.31.2 11.85c0 2.09.55 4.13 1.6 5.93L0 24l6.39-1.67a11.83 11.83 0 0 0 5.65 1.44h.01c6.54 0 11.84-5.31 11.84-11.85 0-3.17-1.23-6.14-3.47-8.44Zm-8.48 18.22h-.01a9.86 9.86 0 0 1-5.02-1.38l-.36-.21-3.79.99 1.01-3.69-.23-.38a9.83 9.83 0 0 1-1.5-5.18c0-5.43 4.42-9.85 9.86-9.85 2.63 0 5.1 1.03 6.96 2.9a9.79 9.79 0 0 1 2.89 6.96c0 5.44-4.43 9.84-9.81 9.84Zm5.4-7.37c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.64-2.05-.17-.3-.02-.45.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.49 0 1.47 1.08 2.89 1.23 3.09.15.2 2.12 3.24 5.13 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z"/>
            </svg>
            <span>Falar com a Bia no WhatsApp</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pix-wa-link-arrow">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>}
      </div>
    </div>,
    document.body
  )
}

/* ══════════════════════════════════════════════════════════════
   PREVIEW RESULT · "A prévia ficou pronta"
   - Card prévia (player custom + disco girando)
   - Card música completa BLOQUEADA (cadeado + CTA terracota)
   - Inspirada na referência do musicaeafeto + design HC.
   ══════════════════════════════════════════════════════════════ */
/* Pieces do confete · constante (gerada uma vez quando o módulo carrega).
   Math.random() roda fora do componente, então NÃO causa hydration mismatch
   e nem dispara durante render do React. */
const _CONFETTI_COLORS = ['#C96240', '#D48F77', '#1F8A5B', '#FBEDE6', '#813A22', '#B86F1A']
const _CONFETTI_PIECES = (() => {
  const out = []
  for (let i = 0; i < 50; i++) {
    out.push({
      left:    Math.random() * 100,
      delay:   Math.random() * 0.6,
      dur:     2.4 + Math.random() * 1.6,
      rot:     Math.random() * 360,
      drift:   (Math.random() - 0.5) * 120,
      size:    6 + Math.random() * 6,
      color:   _CONFETTI_COLORS[i % _CONFETTI_COLORS.length],
      isStrip: i % 3 === 0,
    })
  }
  return out
})()

/* Confete celebratório · disparado UMA vez quando o usuário cai na prévia.
   Partículas via DOM manipulation pra evitar problemas com React + CSS vars. */
function Confetti() {
  const ref = useRef(null)
  // Guard pra não regenerar em StrictMode (React 19 dev roda effects 2x)
  const generatedRef = useRef(false)
  useEffect(() => {
    if (generatedRef.current) return
    const root = ref.current
    if (!root) return
    generatedRef.current = true
    _CONFETTI_PIECES.forEach((p) => {
      const el = document.createElement('span')
      el.className = 'confetti-piece' + (p.isStrip ? ' is-strip' : '')
      el.style.left = p.left + '%'
      el.style.width = p.isStrip ? '4px' : p.size + 'px'
      el.style.height = p.isStrip ? '14px' : p.size + 'px'
      el.style.background = p.color
      el.style.animationDelay = p.delay + 's'
      el.style.animationDuration = p.dur + 's'
      el.style.setProperty('--rot', p.rot + 'deg')
      el.style.setProperty('--drift', p.drift + 'px')
      root.appendChild(el)
    })
    // remove o container 5s depois (todas as partículas já caíram)
    const t = setTimeout(() => {
      if (root && root.parentNode) root.parentNode.removeChild(root)
    }, 5000)
    return () => clearTimeout(t)
  }, [])
  return <div className="confetti" aria-hidden="true" ref={ref} />
}

/* Botão Compartilhar · usa Web Share API.
   - Em mobile (iOS/Android): tenta anexar o arquivo (mp3/mp4) como FILE no
     share sheet, que aí permite mandar pelo WhatsApp/Telegram/Instagram.
   - Em desktop sem suporte a files: tenta compartilhar só a URL.
   - Fallback final: copia o link pra área de transferência.
   - Feedback visual: muda o texto temporariamente quando acontece algo.
   - Props: url + kind ('audio'/'video') + honoreeName + label (texto botao)
   - BUG fix (jun/2026): antes o setStatus('sharing') ficava preso quando
     navigator.share cancelava sem throw OU quando nenhum metodo dava certo
     mas tambem nao threw. Refatorado pra sempre limpar status num finally. */
function ShareButton({ url, kind = 'audio', honoreeName, label = 'Enviar no WhatsApp', title = 'Lembrança Cantada', variant = 'primary' }) {
  const [status, setStatus] = useState('idle')   // idle | sharing | copied | error
  const flash = (s) => { setStatus(s); setTimeout(() => setStatus('idle'), 2400) }

  const handleShare = async () => {
    if (!url) return
    // Mensagem em PRIMEIRA pessoa — cliente ja paga, ja eh "minha musica"
    // pra mandar pra pessoa amada. "fizeram pra Kathia" virava terceira
    // pessoa estranha (parece de comercial). Agora sai do telefone do
    // cliente direto pra pessoa: "Olha a musica que eu fiz para voce".
    const text = `Olha a música que eu fiz para você ❤️`
    setStatus('sharing')
    const safeName = (honoreeName || 'musica').toLowerCase().replace(/[^a-z0-9]/g, '-')
    const ext = kind === 'video' ? 'mp4' : 'mp3'
    const mimeFallback = kind === 'video' ? 'video/mp4' : 'audio/mpeg'
    const fileName = `historiascantadas-${safeName}.${ext}`
    let shared = false
    let copied = false

    try {
      // 1) Tenta com FILE (melhor experiência mobile — anexa direto no WhatsApp)
      try {
        const res = await fetch(url)
        if (res.ok) {
          const blob = await res.blob()
          const file = new File([blob], fileName, { type: blob.type || mimeFallback })
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title, text })
            shared = true
          }
        }
      } catch (_) { /* segue pro próximo fallback */ }

      // 2) Tenta share só com a URL
      if (!shared && navigator.share) {
        try {
          await navigator.share({ title, text, url })
          shared = true
        } catch (_) { /* user cancelou ou falhou — segue pro fallback */ }
      }

      // 3) Fallback: copia o link pra área de transferência
      if (!shared) {
        try {
          await navigator.clipboard.writeText(url)
          copied = true
        } catch (_) {}
      }
    } finally {
      // SEMPRE limpa o status — bug do "Preparando..." preso resolvido aqui.
      if (copied) flash('copied')
      else if (shared) setStatus('idle')
      else flash('error')
    }
  }

  const displayLabel = status === 'copied'
    ? 'Link copiado!'
    : status === 'error'
      ? 'Não consegui compartilhar'
      : status === 'sharing'
        ? 'Preparando…'
        : label

  return (
    <button type="button" className={`unlocked-share unlocked-share--${variant}`} onClick={handleShare}
      disabled={status === 'sharing' || !url} aria-label={label}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      {displayLabel}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════
   MY ORDERS · Tela "Minhas músicas" pra cliente recorrente.
   Recebe lista de orders já carregada do backend (sem fetch interno
   pra não acoplar) + handlers de navegação. Cada card mostra estado
   visual + ações condicionais (ouvir, baixar, finalizar pagamento).
   ══════════════════════════════════════════════════════════════ */
function MyOrdersView({ customer, orders, onBack, onNew, onOpenOrder, onPayPending }) {
  // Formata data BR: 03/06/2026 às 13:45
  const fmtDate = (iso) => {
    if (!iso) return ''
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso))
    } catch (_) { return '' }
  }
  // Status visual: emoji + label + classe
  const statusOf = (o) => {
    if (o.paid_at) return { label: 'Paga', cls: 'paid', icon: '✓' }
    if (o.preview_audio_url) return { label: 'Prévia pronta', cls: 'preview', icon: '♫' }
    if (o.status === 'generating' || o.status === 'producing') return { label: 'Gerando…', cls: 'pending', icon: '⏳' }
    if (o.status === 'failed') return { label: 'Falhou', cls: 'failed', icon: '!' }
    return { label: o.status || 'Em andamento', cls: 'pending', icon: '⏳' }
  }
  return (
    <div className="my-orders-page">
      <header className="my-orders-header">
        <button type="button" className="my-orders-back" onClick={onBack} aria-label="Voltar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="my-orders-title-wrap">
          <span className="my-orders-eyebrow">Lembrança Cantada</span>
          <h1 className="my-orders-title">Minhas músicas</h1>
          {customer?.name && <p className="my-orders-sub">Oi, {customer.name.split(' ')[0]} 💜</p>}
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="my-orders-empty">
          <div className="my-orders-empty-icon" aria-hidden="true">🎵</div>
          <p className="my-orders-empty-text">Você ainda não tem músicas geradas — que tal começar uma?</p>
          <button className="btn-primary" onClick={onNew}>Criar minha primeira música</button>
        </div>
      ) : (
        <>
          <div className="my-orders-list">
            {orders.map((o) => {
              const st = statusOf(o)
              // PRÉVIA quando NÃO pago: tocar SO o preview_audio_url (curto, 50s).
              // Antes caia em original_audio_url se preview_audio_url vazio →
              // bug: cliente nao-pago ouvia a musica completa. Agora, sem
              // pago, mostra so previa (ou nada se nao houver).
              const audioUrl = o.paid_at
                ? (o.original_audio_url || o.preview_audio_url)
                : o.preview_audio_url
              const safeName = (o.honoree_name || 'musica').toLowerCase().replace(/[^a-z0-9]/g, '-')
              return (
                <article key={o.id} className={`my-order-card my-order-card--${st.cls}`}>
                  <header className="my-order-head">
                    <div>
                      <strong className="my-order-name">Para {o.honoree_name || 'alguém especial'}</strong>
                      <span className="my-order-date">{fmtDate(o.created_at)}</span>
                    </div>
                    <span className={`my-order-status my-order-status--${st.cls}`}>
                      <span aria-hidden="true">{st.icon}</span> {st.label}
                    </span>
                  </header>
                  {audioUrl && (
                    <div className="my-order-player">
                      <MiniPlayer src={audioUrl} label={o.paid_at ? 'Música completa' : 'Prévia (0:50)'} />
                    </div>
                  )}
                  <div className="my-order-actions">
                    {o.paid_at && o.original_audio_url && (
                      <a className="my-order-btn my-order-btn--primary"
                        href={o.original_audio_url}
                        download={`historiascantadas-${safeName}.mp3`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Baixar música
                      </a>
                    )}
                    {o.paid_at && o.video_brinde_url && (
                      <a className="my-order-btn"
                        href={o.video_brinde_url}
                        download={`historiascantadas-${safeName}.mp4`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                        </svg>
                        Baixar vídeo
                      </a>
                    )}
                    {!o.paid_at && o.preview_audio_url && (
                      <button type="button" className="my-order-btn my-order-btn--primary"
                        onClick={() => onPayPending && onPayPending(o)}>
                        Finalizar pagamento →
                      </button>
                    )}
                    {/* Share no WhatsApp pra clientes pagos · musica + video */}
                    {o.paid_at && o.original_audio_url && (
                      <ShareButton
                        url={o.original_audio_url}
                        kind="audio"
                        honoreeName={o.honoree_name}
                        title={`Para ${o.honoree_name || 'você'}`}
                        label="Enviar música no WhatsApp"
                        variant="ghost"
                      />
                    )}
                    {o.paid_at && o.video_brinde_url && (
                      <ShareButton
                        url={o.video_brinde_url}
                        kind="video"
                        honoreeName={o.honoree_name}
                        title={`Para ${o.honoree_name || 'você'}`}
                        label="Enviar vídeo no WhatsApp"
                        variant="ghost"
                      />
                    )}
                  </div>
                </article>
              )
            })}
          </div>
          <div className="my-orders-new">
            <button className="btn-primary" onClick={onNew}>
              + Criar outra música
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function PreviewResultView({ resultData, onBuy, onSendProof, paymentSeen, onWhatsApp, onNew, payLoading }) {
  const fullDuration = resultData?.fullDurationSec || 189 // 3:09
  const previewLimit = resultData?.previewLimitSec || 50  // 0:50

  // referência ao player principal pra controlar o "spinning" do disco
  const [playing, setPlaying] = useState(false)
  // Ref do card "Bloqueada — libere agora" pra fazer auto-scroll quando o
  // usuário termina de ouvir a prévia (ponto natural de conversão).
  const lockedCardRef = useRef(null)
  const handlePreviewEnd = () => {
    if (resultData?.unlocked) return  // já comprou, sem scroll
    // Pequeno delay pra evitar conflito com a animação de pause do player
    setTimeout(() => {
      const el = lockedCardRef.current
      if (!el) return
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (_) {
        // fallback pra browsers antigos
        el.scrollIntoView()
      }
      // Highlight visual breve no card pra puxar o olho
      el.classList.add('locked-card--just-scrolled')
      setTimeout(() => el.classList.remove('locked-card--just-scrolled'), 2400)
    }, 350)
  }

  return (
    <div className="result-root">
      <Confetti />
      <div className="container result-shell">

        {resultData?.orderId && (
          <span className="result-order">Pedido #{String(resultData.orderId).slice(0, 8).toUpperCase()}</span>
        )}
        <h1 className="result-headline">
          {resultData?.unlocked ? (
            <>Sua música pra <em>{(resultData?.honoreeName || resultData?.title || '').replace(/^Para /, '') || 'você'}</em> está aqui</>
          ) : (
            <>A prévia para <em>{(resultData?.honoreeName || resultData?.title || '').replace(/^Para /, '') || 'você'}</em> ficou pronta</>
          )}
        </h1>

        {/* ── Card da PRÉVIA ── (ou MÚSICA COMPLETA quando já pago) */}
        <article className="preview-card">
          <header className="preview-card-top">
            <span className="preview-card-eyebrow">
              {resultData?.unlocked ? 'Sua música' : 'Prévia da sua música'}
            </span>
            {!resultData?.unlocked && <span className="preview-card-pill">grátis</span>}
          </header>
          <div className="preview-card-body">
            {/* Disco girando sempre — vibe de toca-discos rodando. */}
            <VinylDisc size={96} spinning />
            <div className="preview-card-meta">
              <strong className="preview-card-title">{resultData?.title || 'Sua música'}</strong>
              <span className="preview-card-sub">{resultData?.tags || 'Sertanejo · Romântico'}</span>
              {/* Após o pagamento, tocamos a música COMPLETA (original_url) sem clamp. */}
              {resultData?.unlocked && (resultData?.original_url || resultData?.preview_url)
                ? <BigPlayer src={resultData.original_url || resultData.preview_url}
                    onPlayingChange={setPlaying}
                    label="Música completa" />
                : resultData?.preview_url
                  ? <BigPlayer src={resultData.preview_url}
                      onPlayingChange={setPlaying}
                      onPreviewEnd={handlePreviewEnd}
                      maxSec={previewLimit}
                      label="Ouça os primeiros segundos" />
                  : (
                    <p className="preview-card-error">
                      Tivemos uma instabilidade ao gerar a prévia. Fale com a Bia no WhatsApp.
                    </p>
                  )
              }
            </div>
          </div>
        </article>

        {/* ── Card MÚSICA COMPLETA · bloqueada OU desbloqueada conforme pagamento ── */}
        {resultData?.unlocked ? (
          /* DESBLOQUEADA · pagamento confirmado, mostra botões de download */
          <article className="locked-card is-unlocked">
            <header className="locked-card-top">
              <span className="locked-card-eyebrow">Liberada</span>
            </header>
            <div className="locked-card-body">
              <div className="unlocked-headline">
                <strong className="locked-card-title">Está pronta!</strong>
                <p className="locked-card-success">
                  Baixe quando quiser — o link é seu pra sempre.
                </p>
              </div>
            </div>
            <div className="unlocked-downloads">
              {(resultData?.original_url || resultData?.preview_url) && (
                <a className="unlocked-btn" href={resultData.original_url || resultData.preview_url}
                  download={`historiascantadas-${(resultData.honoreeName || 'musica').toLowerCase()}.mp3`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Baixar música
                </a>
              )}
              {resultData?.video_url && (
                <a className="unlocked-btn" href={resultData.video_url}
                  download={`historiascantadas-${(resultData.honoreeName || 'video').toLowerCase()}.mp4`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Baixar vídeo
                </a>
              )}
            </div>
            <div className="unlocked-shares">
              <ShareButton
                url={resultData?.original_url || resultData?.preview_url}
                kind="audio"
                honoreeName={resultData?.honoreeName}
                title={resultData?.title || 'Lembrança Cantada'}
                label="Enviar música no WhatsApp"
              />
              {resultData?.video_url && (
                <ShareButton
                  url={resultData.video_url}
                  kind="video"
                  honoreeName={resultData?.honoreeName}
                  title={resultData?.title || 'Lembrança Cantada'}
                  label="Enviar vídeo no WhatsApp"
                  variant="secondary"
                />
              )}
            </div>
          </article>
        ) : (
          /* BLOQUEADA · estado padrão antes do pagamento */
          null
        )}

        {/* ── BRINDE · 2ª versão da música (só se sunoapi.org gerou duas) ──
            Aparece como SURPRESA pós-pagamento, secundário ao card principal.
            Não mostramos antes de pagar (era um download premium). */}
        {resultData?.unlocked && resultData?.bonus_url && (
          <article className="bonus-card" aria-label="Versão alternativa de presente">
            <header className="bonus-card-head">
              <span className="bonus-card-eyebrow">
                <span className="bonus-card-gift" aria-hidden="true">🎁</span>
                SURPRESA
              </span>
              <strong className="bonus-card-title">
                Nosso compositor estava inspirado e fez outra versão pra você
              </strong>
            </header>
            <div className="bonus-card-player">
              <MiniPlayer src={resultData.bonus_url} label={`Versão 2 · ${resultData?.title || 'Sua música'}`} />
            </div>
            <div className="bonus-card-actions">
              <a className="bonus-card-download" href={resultData.bonus_url}
                download={`historiascantadas-${(resultData.honoreeName || 'musica').toLowerCase()}-v2.mp3`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Baixar versão 2
              </a>
              <ShareButton
                url={resultData.bonus_url}
                kind="audio"
                honoreeName={resultData?.honoreeName}
                title={`Versão 2 · ${resultData?.title || 'Sua música'}`}
                label="Enviar versão 2 no WhatsApp"
                variant="ghost"
              />
            </div>
          </article>
        )}

        {/* CTA "Faça outra pra alguém especial" — aparece SÓ pós-pagamento,
            depois dos downloads e do brinde. Convida pra retornar como cliente. */}
        {resultData?.unlocked && (
          <section className="new-song-cta" aria-labelledby="new-song-cta-title">
            <div className="new-song-cta-bg" aria-hidden="true">
              <span className="new-song-cta-heart">💜</span>
            </div>
            <div className="new-song-cta-content">
              <span className="new-song-cta-eyebrow">Gostou de presentear?</span>
              <h3 id="new-song-cta-title" className="new-song-cta-title">
                Faz pra mais alguém especial
              </h3>
              <p className="new-song-cta-sub">
                Cada música leva uns minutinhos — e fica pra sempre.
              </p>
              <button type="button" className="new-song-cta-btn" onClick={onNew}>
                Criar outra música
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </section>
        )}

        {!resultData?.unlocked && (
          /* BLOQUEADA · estado padrão antes do pagamento */
          <article className="locked-card" ref={lockedCardRef}>
            <header className="locked-card-top">
              <span className="locked-card-eyebrow">Música completa</span>
              <span className="locked-card-duration">{fmtEta(fullDuration)}</span>
            </header>
            <div className="locked-card-body">
              <VinylDisc size={88} locked />
              <div className="locked-card-meta">
                <strong className="locked-card-title">Bloqueada — libere agora</strong>
                <ul className="locked-card-list">
                  <li><span aria-hidden="true">♫</span> Música completa em mp3</li>
                  <li><span aria-hidden="true">▶</span> Vídeo com a letra na tela</li>
                  <li><span aria-hidden="true">⬇</span> Download imediato após o pagamento</li>
                </ul>
              </div>
            </div>
            <button type="button" className="locked-card-cta locked-card-cta--pulse"
              disabled={payLoading || !resultData?.orderId}
              onClick={() => onBuy && onBuy(resultData?.orderId)}>
              <span className="locked-card-cta-text">{payLoading ? 'Abrindo pagamento…' : 'Desbloquear música completa'}</span>
              <span className="locked-card-cta-shine" aria-hidden="true" />
            </button>
            <p className="locked-card-foot">
              A partir de R$ 19,90 · Pix · liberação imediata
            </p>
            {/* Atalho secundário: aparece SÓ depois que o cliente abriu o modal
                pelo menos uma vez (sinal de "estou indo pagar agora"). Reabre
                o modal direto na tela de upload do comprovante — pra quem fez
                o Pix em outro app e voltou. */}
            {paymentSeen && (
              <button type="button" className="locked-card-proof"
                onClick={() => onSendProof && onSendProof(resultData?.orderId)}>
                <span className="locked-card-proof-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </span>
                <span className="locked-card-proof-text">Já paguei · enviar comprovante</span>
                <svg className="locked-card-proof-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )}
          </article>
        )}

        {/* ── PROVA REAL · depoimentos de clientes ── */}
        <section className="result-proof">
          <div className="result-proof-head">
            <span className="result-proof-eyebrow">Prova real</span>
            <h2 className="result-proof-title">
              Ouça o que nossos clientes sentiram <span aria-hidden="true">💖</span>
            </h2>
          </div>
          <div className="result-proof-list">
            {RESULT_TESTIMONIALS.map(t => (
              <article key={t.title} className="testimonial-row">
                <div className="testimonial-head">
                  <strong className="testimonial-title">{t.title}</strong>
                  <span className="testimonial-duration">{t.duration}</span>
                </div>
                <div className="testimonial-author">Pedido por <strong>{t.author}</strong></div>
                <p className="testimonial-quote">“{t.quote}”</p>
                <MiniPlayer src={t.src} />
              </article>
            ))}
          </div>
        </section>

        {/* ── Mensagem final personalizada com nome em destaque ── */}
        <section className="result-final">
          <span className="result-final-spark" aria-hidden="true">✦</span>
          <h2 className="result-final-title">
            Você está a um passo de eternizar essa história para
            {' '}<em>{(resultData?.honoreeName || '').toUpperCase() || 'ELA'}</em>
          </h2>
          <p className="result-final-sub">
            Ouça sua prévia e desbloqueie as versões completas da música personalizada.
          </p>
        </section>
      </div>
    </div>
  )
}

/* Player grande pra prévia · com clamp opcional (maxSec) que corta a reprodução.
   Avisa o pai quando playing muda pra girar o disco de vinil.
   onPreviewEnd dispara UMA VEZ quando a prévia termina (no clamp ou no fim do
   áudio) — usado pra fazer auto-scroll até o card de desbloquear. */
function BigPlayer({ src, maxSec, label, onPlayingChange, onPreviewEnd }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const endedFiredRef = useRef(false)

  useEffect(() => { onPlayingChange && onPlayingChange(playing) }, [playing, onPlayingChange])

  // Clamp: se ultrapassar o maxSec da prévia, pausa e volta pro 0.
  useEffect(() => {
    if (!maxSec) return
    if (t >= maxSec) {
      const a = audioRef.current
      if (a) { a.pause(); a.currentTime = 0 }
      setPlaying(false); setT(0)
      // Dispara onPreviewEnd uma única vez por reprodução completa
      if (!endedFiredRef.current) {
        endedFiredRef.current = true
        try { onPreviewEnd && onPreviewEnd() } catch (_) {}
      }
    }
  }, [t, maxSec, onPreviewEnd])
  // Reset do "fired" quando o usuario inicia uma nova reproducao
  useEffect(() => { if (playing) endedFiredRef.current = false }, [playing])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().then(() => setPlaying(true)).catch(() => {}) }
  }
  const seek = (e) => {
    const a = audioRef.current
    if (!a || !dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const target = Math.max(0, Math.min((maxSec || dur), pct * (maxSec || dur)))
    a.currentTime = target
  }
  const fmt = (s) => {
    if (!Number.isFinite(s)) return '0:00'
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }
  const cap = maxSec || dur
  const pct = cap > 0 ? Math.min(100, (t / cap) * 100) : 0

  return (
    <div className="big-player">
      {label && <span className="big-player-label">{label}</span>}
      <div className="big-player-row">
        <button type="button" className="big-player-btn"
          onClick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
          {playing
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>}
        </button>
        <div className="big-player-bar" onClick={seek}
          role="slider" aria-valuemin={0} aria-valuemax={Math.round(cap)} aria-valuenow={Math.round(t)}>
          <div className="big-player-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="big-player-meta">
        <span>{fmt(t)}</span>
        <span>{maxSec ? `prévia até ${fmt(maxSec)}` : `de ${fmt(dur)}`}</span>
      </div>
      <audio ref={audioRef} src={src} preload="metadata"
        onTimeUpdate={e => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDur(e.currentTarget.duration || 0)}
        onEnded={() => {
          setPlaying(false); setT(0)
          // Dispara onPreviewEnd uma única vez (caso o audio termine
          // naturalmente antes do clamp, ex: prévia menor que maxSec)
          if (!endedFiredRef.current) {
            endedFiredRef.current = true
            try { onPreviewEnd && onPreviewEnd() } catch (_) {}
          }
        }}
      />
    </div>
  )
}

function ProgressView({ progress, statusMsg, formData, exampleSongs }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress || 0)))

  // Carrossel: um exemplo por vez, troca a cada 6s
  const [exIdx, setExIdx] = useState(0)
  useEffect(() => {
    if (!exampleSongs?.length) return
    const id = setInterval(() => setExIdx(i => (i + 1) % exampleSongs.length), 6000)
    return () => clearInterval(id)
  }, [exampleSongs])

  const cur = exampleSongs?.[exIdx]
  // Status dinâmico por fase do progresso — cada faixa mostra o que
  // está acontecendo "agora" no estúdio. Sem mencionar IA.
  // Se o backend mandou um statusMsg, ele tem prioridade (mas filtramos "IA").
  const phaseStatus = (() => {
    if (pct < 8)  return 'Lendo a sua história'
    if (pct < 18) return 'Sublinhando palavras-chave'
    if (pct < 30) return 'Procurando as primeiras rimas'
    if (pct < 45) return 'Costurando o refrão'
    if (pct < 60) return 'Afinando o violão e a voz'
    if (pct < 75) return 'Gravando a melodia no estúdio'
    if (pct < 88) return 'Mixando os detalhes'
    if (pct < 97) return 'Última passada de carinho'
    return 'Mandando pro seu WhatsApp'
  })()
  const safeStatus = (statusMsg && !/intelig[eê]ncia artificial/i.test(statusMsg))
    ? statusMsg
    : phaseStatus + '…'

  return (
    <div className="gen-root">
      <div className="container gen-container">
        <header className="gen-header">
          <span className="gen-eyebrow">Compondo agora</span>
          <h1 className="gen-title">Sua música está nascendo</h1>
        </header>

        {/* Card único · carrega + status + waveform + rascunho da letra */}
        <div className="gen-card gen-card--combined">
          <div className="gen-card-top">
            <span className="gen-eta-label">Carregando</span>
            <span className="gen-eta">{pct}%</span>
          </div>
          <div className="gen-wave" aria-hidden="true">
            {Array.from({ length: 22 }, (_, i) => (
              <span key={i} className="gen-wave-bar" style={{ animationDelay: `${(i % 7) * 80}ms` }} />
            ))}
          </div>
          <div className="gen-progress"
            role="progressbar" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(progress)}>
            <div className="gen-progress-fill" style={{ width: `${progress}%` }}>
              <span className="gen-progress-shimmer" aria-hidden="true" />
              <span className="gen-progress-tip" aria-hidden="true" />
            </div>
          </div>
          <p className="gen-status">{safeStatus}</p>

          {/* Separador tracejado terracota — vibe de caderno do compositor */}
          <div className="gen-card-sep" aria-hidden="true" />

          {/* Rascunho da letra in-line · sem mais um card destacado */}
          <LiveLyrics formData={formData} progress={progress} embedded />
        </div>

        {cur && (
          <div className="gen-examples">
            <div className="gen-examples-eyebrow">Últimas músicas dos nossos clientes</div>
            <p className="gen-examples-sub">Ouça enquanto a sua nasce — todas foram criadas aqui no Lembrança Cantada.</p>
            <article className="gen-example-card">
              <span className="gen-example-art"><VinylDisc size={44} /></span>
              <div className="gen-example-meta">
                <strong className="gen-example-title">{cur.title}</strong>
                <span className="gen-example-sub">{cur.meta}</span>
              </div>
              <MiniPlayer src={cur.src} />
            </article>
            <div className="gen-examples-dots" aria-hidden="true">
              {exampleSongs.map((_, i) => (
                <button key={i} type="button"
                  aria-label={`Ir pro exemplo ${i + 1}`}
                  className={`gen-example-dot${i === exIdx ? ' active' : ''}`}
                  onClick={() => setExIdx(i)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   APP
══════════════════════════════════════════════════════════════ */
export default function App() {
  // Dev: testar a tela de progresso via ?devProgress=N (ex: 45)
  //      testar a tela de prévia/locked via ?devResult=1
  const _devProgress = (() => {
    try { return new URLSearchParams(window.location.search).get('devProgress') } catch (_) { return null }
  })()
  const _devResult = (() => {
    try {
      const v = new URLSearchParams(window.location.search).get('devResult')
      return v === '1' || v === '2'   // 1 = bloqueada, 2 = desbloqueada
    } catch (_) { return false }
  })()
  const _devError = (() => {
    try { return new URLSearchParams(window.location.search).get('devError') === '1' } catch (_) { return false }
  })()
  const _devCustomer = (() => {
    try { return new URLSearchParams(window.location.search).get('devCustomer') === '1' } catch (_) { return false }
  })()
  const _devOrders = (() => {
    try { return new URLSearchParams(window.location.search).get('devOrders') === '1' } catch (_) { return false }
  })()
  const [view, setView] = useState(
    _devError ? 'error'
    : _devOrders ? 'my-orders'
    : _devProgress != null ? 'progress'
    : (_devResult ? 'result' : 'landing')
  )
  const [ctaVisible, setCtaVisible] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastData, setToastData] = useState({ initials: 'RO', name: 'Rafael Oliveira', time: '1 min' })
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(_devProgress != null ? Number(_devProgress) || 0 : 0)
  const [statusMsg, setStatusMsg] = useState('')
  // ?devResult=1 → bloqueada (padrão); ?devResult=2 → já desbloqueada (download)
  const _devResultUnlocked = (() => {
    try { return new URLSearchParams(window.location.search).get('devResult') === '2' } catch (_) { return false }
  })()
  const [resultData, setResultData] = useState(_devResult ? {
    title: 'Para Mariana',
    honoreeName: 'Mariana',
    customerName: 'Charles Plesley',
    phone: '5511999998888',
    tags: 'Sertanejo · Romântico',
    preview_url: '/assets/musicas/m1.mp3',
    original_url: '/assets/musicas/m2.mp3',
    // 2ª versão como BRINDE (sunoapi.org gera 2 por chamada)
    bonus_url: _devResultUnlocked ? '/assets/musicas/m3.mp3' : null,
    video_url: _devResultUnlocked ? '/assets/musicas/m3.mp3' : null,
    orderId: 'dev-mock-1730a4b8',
    fullDurationSec: 189,
    previewLimitSec: 50,
    unlocked: _devResultUnlocked,
  } : null)
  const [errorMsg, setErrorMsg] = useState('')
  // ── Meta-safe contact gate (cliente precisa contactar Bia primeiro) ──
  const [showWhatsAppBanner, setShowWhatsAppBanner] = useState(false)
  const [clientContacted, setClientContacted] = useState(false)
  const [currentOrderId, setCurrentOrderId] = useState(_devError ? 'dev-mock-1730a4b8' : null)

  // Cliente recorrente: lê localStorage e busca os pedidos em background.
  // Mostra banner sutil se achou músicas, sem bloquear o fluxo normal.
  const [customer, setCustomer] = useState(() => {
    if (_devCustomer || _devOrders) return { phone: '5511999998888', name: 'Charles Plesley', savedAt: Date.now() }
    return loadCustomer()
  })
  const [customerOrders, setCustomerOrders] = useState(() => {
    if (_devCustomer || _devOrders) return [
      { id: 'mock-1', honoree_name: 'Mariana', status: 'delivered', paid_at: '2026-05-15T14:30:00Z', created_at: '2026-05-15T14:00:00Z',
        original_audio_url: '/assets/musicas/m2.mp3', preview_audio_url: '/assets/musicas/m1.mp3', video_brinde_url: null },
      { id: 'mock-2', honoree_name: 'Bia (mãe)', status: 'preview_sent', paid_at: null, created_at: '2026-05-28T10:15:00Z',
        original_audio_url: null, preview_audio_url: '/assets/musicas/m3.mp3' },
      { id: 'mock-3', honoree_name: 'Pedro', status: 'delivered', paid_at: '2026-06-01T19:45:00Z', created_at: '2026-06-01T19:00:00Z',
        original_audio_url: '/assets/musicas/m1.mp3', preview_audio_url: '/assets/musicas/m1.mp3', video_brinde_url: '/assets/musicas/m2.mp3' },
    ]
    return []
  })
  const [showCustomerBanner, setShowCustomerBanner] = useState(() => _devCustomer || _devOrders)
  // Modal de lookup público: cliente em outro dispositivo / sem cookies pode
  // digitar o WhatsApp e ver o histórico.
  const [showLookup, setShowLookup] = useState(false)

  // ═══ Resume de pedido após reload ═══
  // Se o cliente atualizou a página enquanto a geração estava em andamento (ou
  // já terminou), restauramos a view correta consultando o backend. Sem isso,
  // ele cairia na landing perdendo a referência ao pedido. Inngest é durável
  // (continua gerando), então só precisamos sincronizar a UI.
  useEffect(() => {
    // Dev flags têm prioridade — não atrapalha quem está testando algo específico
    if (_devError || _devOrders || _devResult || _devProgress != null) return
    // Boot inicial: view sempre começa 'landing' (a menos que dev flag), então
    // este useEffect só roda 1x. As deps vazias forçam isso.
    const co = loadCurrentOrder()
    if (!co?.id) return
    let alive = true
    ;(async () => {
      try {
        const row = await apiOrderStatus(co.id)
        if (!alive) return
        if (!row) { clearCurrentOrder(); return }

        // Falhou: vai pra error pra cliente tentar de novo ou falar com a Bia
        if (row.status === 'failed') {
          setCurrentOrderId(co.id)
          setErrorMsg(row.error_message || '')
          // popula formData mínimo pra mensagem WA ter contexto
          setFormData(prev => ({
            ...prev,
            honoreeName: row.honoree_name || co.honoreeName || prev.honoreeName,
            clientName: row.customer_name || co.customerName || prev.clientName,
            phone: row.phone || co.phone || prev.phone,
          }))
          setView('error')
          return
        }

        // Ainda gerando — sem prévia nem original.
        // Robustez: mesmo se status=preview_sent mas a URL está vazia (caso edge
        // onde o backend salvou status mas perdeu a URL), volta pra progress
        // — não mostra "Tivemos uma instabilidade" pra cliente.
        if (!row.preview_audio_url && !row.original_audio_url) {
          setCurrentOrderId(co.id)
          setFormData(prev => ({
            ...prev,
            honoreeName: row.honoree_name || co.honoreeName || prev.honoreeName,
            clientName: row.customer_name || co.customerName || prev.clientName,
            phone: row.phone || co.phone || prev.phone,
          }))
          // ~70% pra dar feedback visual de que está avançado (Inngest costuma
          // estar perto do fim quando o cliente volta após reload)
          setProgress(70)
          setView('progress')
          return
        }

        // Prévia ou completa pronta — vai pra result
        const fau = Array.isArray(row.full_audio_urls) ? row.full_audio_urls.filter(Boolean) : []
        setResultData({
          title: `Para ${row.honoree_name || co.honoreeName || 'você'}`,
          honoreeName: row.honoree_name || co.honoreeName || '',
          customerName: row.customer_name || co.customerName || '',
          phone: row.phone || co.phone || '',
          preview_url: row.preview_audio_url || null,
          original_url: row.original_audio_url || fau[0] || null,
          bonus_url: fau.find(u => u && u !== (row.original_audio_url || fau[0])) || null,
          video_url: row.video_upsell_url || row.video_brinde_url || null,
          orderId: co.id,
          unlocked: !!row.paid_at,
          previewLimitSec: 50,
        })
        setCurrentOrderId(co.id)
        setView('result')
        // Se já pago, limpa o current_order — não precisa mais resumir
        if (row.paid_at) clearCurrentOrder()
      } catch (_) {
        // Erro de rede — deixa quieto, cliente fica na landing
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handler do click no link "Minhas músicas" do header.
  // Tem 3 caminhos:
  //   1) já reconhecido + tem orders → vai direto pra view
  //   2) reconhecido mas orders ainda vazias → também abre direto (tela mostra vazio bonito)
  //   3) nenhum customer → abre modal pedindo o WhatsApp
  const openMyOrders = () => {
    if (customer?.phone) { setView('my-orders'); window.scrollTo({ top: 0 }) }
    else setShowLookup(true)
  }
  useEffect(() => {
    if (_devCustomer || _devOrders) return  // mocks já populados
    if (!customer?.phone) return
    let alive = true
    apiOrderLookup(customer.phone).then((resp) => {
      if (!alive) return
      // apiOrderLookup existente retorna { ok, orders } — extrai o array
      const orders = Array.isArray(resp?.orders) ? resp.orders : []
      // só conta pedidos com prévia ou pagos — pendência genérica não vira "histórico"
      const real = orders.filter(o => o.preview_audio_url || o.paid_at)
      setCustomerOrders(real)
      if (real.length > 0) setShowCustomerBanner(true)

      // RECOVERY POR TELEFONE: se o cliente tem uma prévia recente NAO PAGA
      // (criada nas ultimas 48h), pula automaticamente pra tela de resultado.
      // Cobre o cenario do usuario que pagou, deu erro na validacao, fechou o
      // site, voltou em outro navegador/aba/incognito — o site ja abre na
      // tela do "Desbloquear" SEM ele precisar lembrar onde parou.
      // Guarda: so age se NAO ha rascunho local (hc_current_order) e nao
      // estamos em rota de dev/result/error. Auto-jump so se houver
      // EXATAMENTE 1 pendencia (mais de 1 = ambiguidade, mostra so banner).
      try {
        const has_dev = _devError || _devOrders || _devResult || _devProgress != null
        const has_local_resume = !!(loadCurrentOrder() && loadCurrentOrder().id)
        if (has_dev || has_local_resume) return
        const unpaid = real.filter(o => o.preview_audio_url && !o.paid_at)
        const recent = unpaid.filter(o => {
          const ageMs = Date.now() - new Date(o.created_at).getTime()
          return ageMs < 48 * 60 * 60 * 1000
        })
        if (recent.length !== 1) return  // 0 ou ambiguo -> nao auto-pula
        const row = recent[0]
        const fau = Array.isArray(row.full_audio_urls) ? row.full_audio_urls.filter(Boolean) : []
        const honoree = row.honoree_name || 'você'
        setResultData({
          title: `Para ${honoree}`,
          honoreeName: honoree,
          customerName: row.customer_name || customer?.name || '',
          phone: row.phone || customer?.phone || '',
          orderId: row.id,
          preview_url: row.preview_audio_url || null,
          original_url: row.original_audio_url || fau[0] || null,
          video_url: row.video_brinde_url || null,
          unlocked: false,
          fullDurationSec: 189,
          previewLimitSec: 50,
        })
        setCurrentOrderId(row.id)
        setView('result')
        setShowCustomerBanner(false)
        try { console.info('[HC] auto-resume por telefone -> pedido', row.id.slice(0,8)) } catch (_) {}
      } catch (e) { console.warn('[HC] auto-resume falhou:', e?.message) }
    })
    return () => { alive = false }
  }, [customer?.phone])
  const [openFaq, setOpenFaq] = useState(0)
  const [previewIdx, setPreviewIdx] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const previewAudioRef = useRef(null)
  const previewVideoRef = useRef(null)
  const heroVideoRef = useRef(null)
  const [payReturn, setPayReturn] = useState(null)   // retorno do InfinitePay: {status,orderId}
  const [payLoading, setPayLoading] = useState(false)
  const [theme, setTheme] = useState(() => {
    try { return document.documentElement.getAttribute('data-theme') || 'light' } catch (_) { return 'light' }
  })
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { document.documentElement.setAttribute('data-theme', next); localStorage.setItem('hc_theme', next) } catch (_) {}
  }

  // ── Retorno do InfinitePay: ?pago=1&order=...&transaction_nsu=...&slug=... ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('pago') !== '1') return
    const orderId = params.get('order') || params.get('order_nsu')
    const tx = params.get('transaction_nsu')
    const slug = params.get('slug')
    window.history.replaceState({}, '', window.location.pathname)  // limpa a URL
    if (!orderId) { setPayReturn({ status: 'failed', orderId: null }); return }
    // entrega tudo DENTRO DO CHAT (valida + música completa + vídeo + foto)
    deliverInChat(orderId, tx, slug)
  }, [])

  const retryPayVerify = () => {
    if (!payReturn || !payReturn.orderId) return
    setPayReturn({ ...payReturn, status: 'verifying' })
    apiPayVerify(payReturn.orderId, payReturn.tx, payReturn.slug).then(r => {
      if (r && r.paid) trackPurchase()
      setPayReturn(p => ({ ...p, status: (r && r.paid) ? 'paid' : 'failed' }))
    })
  }

  // Modal PIX (sem InfinitePay) — abre com QR + chave PIX + botão copiar
  const [pixModal, setPixModal] = useState(null)   // { orderId, plan, honoreeName, startAt } | null
  // Marca se o cliente já viu o modal pelo menos uma vez nessa sessão. Quando
  // true, mostramos um CTA secundário "Já paguei · enviar comprovante" no card
  // bloqueado pra quem voltou do app do banco.
  const [paymentSeen, setPaymentSeen] = useState(() => {
    try { return sessionStorage.getItem('hc_pix_seen') === '1' } catch (_) { return false }
  })

  // Inicia o pagamento — agora abre o modal PIX manual (em vez de redirecionar).
  // `paymentSeen` NÃO é marcado aqui: queremos que o CTA secundário do card
  // ("Já paguei · enviar comprovante") apareça SÓ depois que o cliente FECHAR
  // o modal pela primeira vez — sinal forte de "fui pagar e voltei".
  const startPayment = (orderId, plan, startAt) => {
    if (!orderId) { alert('Pedido não encontrado, refaça a música 💜'); return }
    const val = PLAN_VALUES[plan] || PLAN_VALUES.musica
    try { localStorage.setItem('hc_pay_value', String(val)) } catch (_) {}
    try { track('InitiateCheckout', { value: val, currency: 'BRL', content_name: plan }) } catch (_) {}
    setPixModal({
      orderId,
      plan: plan || 'musica',
      honoreeName: resultData?.honoreeName,
      // o backend já tem isso de quando o quiz foi enviado — passa pra modal usar
      // na mensagem do "Falar com a Bia no WhatsApp"
      customerName: resultData?.customerName || resultData?.clientName || formData?.clientName,
      customerPhone: resultData?.phone || formData?.phone,
      startAt: startAt || 'plan',   // default agora abre na escolha do plano
    })
  }
  // Quando o cliente fecha o modal, marcamos como "viu" — daí aparece o CTA
  // secundário no card pra ele voltar e mandar o comprovante.
  const closePixModal = () => {
    setPixModal(null)
    try { sessionStorage.setItem('hc_pix_seen', '1') } catch (_) {}
    setPaymentSeen(true)
  }
  // Atalho: cliente clicou em "Já paguei" no card da página → reabre direto na
  // tela de upload do comprovante.
  const openProofUpload = (orderId) => startPayment(orderId, 'musica', 'upload')
  const BIA_PHONE = '5511920188319'
  const INSTAGRAM = 'https://instagram.com/historiascantadasbr'
  const WHATSAPP = `https://wa.me/${'5511920188319'}`
  const lastScrollY = useRef(0)
  const headerRef = useRef(null)
  const ticking = useRef(false)

  /* ── Form wizard state ── */
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState((_devProgress != null || _devError) ? {
    honoreeName: 'Mariana',
    relationship: 'Esposa',
    occasion: 'Aniversário',
    feeling: 'Romântico',
    story: 'Ela me conheceu num café da manhã em 2018 e desde então a vida ficou mais leve. Adora cantar no chuveiro, dançar na cozinha e tem um sorriso que ilumina qualquer dia ruim.',
    genre: 'MPB',
    mood: 'Romântico',
    voice: 'Feminino',
    clientName: _devError ? 'Charles Plesley' : '',
    phone: _devError ? '5511999998888' : '',
  } : (() => {
    // Cliente recorrente: pré-preenche nome + telefone se tem no localStorage.
    // Economiza ~30s de fricção em pedidos repetidos. As demais telas
    // (honoreeName, story, etc.) continuam vazias porque mudam por pedido.
    const c = loadCustomer()
    return {
      honoreeName: '',
      relationship: '',
      occasion: '',
      story: '',
      genre: '',
      mood: '',
      voice: '',
      clientName: c?.name || '',
      phone: c?.phone || '',
    }
  })())

  const updateForm = (key, val) => setFormData(prev => ({ ...prev, [key]: val }))

  /* ── Voice-to-Text (Web Speech API — real-time) ── */
  const [isRecording, setIsRecording] = useState(false)
  const [interimText, setInterimText] = useState('')
  const recognitionRef = useRef(null)
  const storyBeforeRecRef = useRef('')
  const isRecordingRef = useRef(false)
  const interimRef = useRef('')

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Seu navegador não suporta reconhecimento de voz. Use o Chrome ou Edge.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'pt-BR'
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    // Salvar texto atual antes de começar
    storyBeforeRecRef.current = formData.story || ''

    recognition.onresult = (event) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += transcript + ' '
        } else {
          interim += transcript
        }
      }

      if (finalText) {
        // Texto confirmado — adiciona permanentemente
        storyBeforeRecRef.current = (storyBeforeRecRef.current + ' ' + finalText).trim()
        setFormData(prev => ({ ...prev, story: storyBeforeRecRef.current }))
        setInterimText('')
        interimRef.current = ''
      } else {
        // Texto provisório (ainda falando)
        setInterimText(interim)
        interimRef.current = interim
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      if (event.error === 'not-allowed') {
        alert('Permita o acesso ao microfone para gravar.')
      }
      setIsRecording(false)
      isRecordingRef.current = false
      setInterimText('')
      interimRef.current = ''
    }

    recognition.onend = () => {
      // Cleanup: se parou sozinho (timeout do browser)
      setIsRecording(false)
      isRecordingRef.current = false
      setInterimText('')
      interimRef.current = ''
    }

    recognition.start()
    setIsRecording(true)
    isRecordingRef.current = true
  }

  const stopVoiceInput = () => {
    // Adicionar qualquer interim restante antes de parar
    if (interimRef.current) {
      const finalText = (storyBeforeRecRef.current + ' ' + interimRef.current).trim()
      setFormData(prev => ({ ...prev, story: finalText }))
    }
    recognitionRef.current?.stop()
    setIsRecording(false)
    isRecordingRef.current = false
    setInterimText('')
    interimRef.current = ''
  }

  const toggleVoiceInput = () => {
    if (isRecording) stopVoiceInput()
    else startVoiceInput()
  }

  // Texto exibido no textarea (real + interim em andamento)
  const displayStory = isRecording && interimText
    ? (formData.story ? formData.story + ' ' + interimText : interimText)
    : formData.story

  /* ── Scroll effects ── */
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - lastScrollY.current
        if (headerRef.current) {
          if (delta > 10 && y > 100) headerRef.current.classList.add('hidden')
          else if (delta < -10) headerRef.current.classList.remove('hidden')
        }
        setCtaVisible(y > 600)
        lastScrollY.current = y
        ticking.current = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ── Social proof toast ── */
  useEffect(() => {
    if (view !== 'landing') return
    const people = [
      { initials: 'RO', name: 'Rafael Oliveira', time: '1 min', photo: 'https://randomuser.me/api/portraits/men/32.jpg' },     // jovem
      { initials: 'DM', name: 'Dona Maria', time: '2 min', photo: 'https://randomuser.me/api/portraits/women/75.jpg' },        // idosa
      { initials: 'AP', name: 'Ana Paula', time: '3 min', photo: 'https://randomuser.me/api/portraits/women/63.jpg' },
      { initials: 'SJ', name: 'Seu João', time: '4 min', photo: 'https://randomuser.me/api/portraits/men/77.jpg' },            // idoso
      { initials: 'JM', name: 'Juliana Mendes', time: '6 min', photo: 'https://randomuser.me/api/portraits/women/29.jpg' },    // jovem
      { initials: 'CS', name: 'Carlos Silva', time: '7 min', photo: 'https://randomuser.me/api/portraits/men/46.jpg' },
      { initials: 'CF', name: 'Cleuza Ferreira', time: '9 min', photo: 'https://randomuser.me/api/portraits/women/68.jpg' },   // idosa
      { initials: 'LA', name: 'Lucas Almeida', time: '11 min', photo: 'https://randomuser.me/api/portraits/men/22.jpg' },      // jovem
      { initials: 'SB', name: 'Sebastião Brito', time: '13 min', photo: 'https://randomuser.me/api/portraits/men/60.jpg' },    // idoso
      { initials: 'BS', name: 'Beatriz Santos', time: '15 min', photo: 'https://randomuser.me/api/portraits/women/44.jpg' },
    ]
    for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [people[i], people[j]] = [people[j], people[i]] }  // ordem aleatória
    let idx = 0
    const show = () => {
      setToastData(people[idx % people.length])
      setToastVisible(true)
      setTimeout(() => setToastVisible(false), 4000)
      idx++
    }
    const t1 = setTimeout(show, 8000)
    const t2 = setInterval(show, 25000)
    return () => { clearTimeout(t1); clearInterval(t2) }
  }, [view])

  /* ── Step navigation ── */
  const canGoNext = () => {
    if (step === 1) return formData.honoreeName.trim().length > 0
    if (step === 2) return formData.genre.length > 0
    if (step === 3) return true // name and phone are optional but recommended
    return true
  }

  const nextStep = () => {
    if (!canGoNext()) return
    if (step < 3) {
      setStep(step + 1)
      document.getElementById('formCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      handleSubmit()
    }
  }

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1)
      document.getElementById('formCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  /* ── Form submit ── */
  const phoneMask = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 2) return d
    if (d.length <= 3) return `${d.slice(0,2)} ${d.slice(2)}`
    if (d.length <= 7) return `${d.slice(0,2)} ${d.slice(2,3)} ${d.slice(3)}`
    return `${d.slice(0,2)} ${d.slice(2,3)} ${d.slice(3,7)}-${d.slice(7)}`
  }

  const handleSubmit = useCallback(async (dataOverride) => {
    const data = (dataOverride && typeof dataOverride.honoreeName === 'string') ? dataOverride : formData
    const { honoreeName, relationship, occasion, story, genre, mood, voice, clientName, phone } = data
    if (!honoreeName.trim()) return alert('Informe para quem é a música!')
    if (!clientName || !clientName.trim().includes(' ')) return alert('Informe seu nome e sobrenome!')
    const cleanPhone = phone?.replace(/\D/g, '') || ''
    if (cleanPhone.length < 10) return alert('Informe um número de WhatsApp válido com DDD!')

    const parts = [`Música para ${honoreeName}`]
    if (relationship) parts.push(`(${relationship})`)
    if (occasion) parts.push(`para ${occasion}`)
    if (story) parts.push(`. História: ${story}`)
    const prompt = parts.join(' ')

    const tagParts = [genre || 'Pop brasileiro']
    if (mood) tagParts.push(mood)
    if (voice === 'Masculino') tagParts.push('male vocals')
    else if (voice === 'Feminino') tagParts.push('female vocals')
    const tags = tagParts.join(', ')

    // Começa em 1% imediatamente — sem ficar em zero parado, sem pulo brusco.
    // O tick visual abaixo (250ms) faz a barra avançar de forma contínua.
    setLoading(true); setView('progress'); setProgress(1); setStatusMsg('📤 Enviando para o estúdio Lembrança Cantada...')
    // Declarado no escopo do try/catch externo pra ser limpo em caso de erro
    let tickId = null
    // Reset banner state — começa escondido
    setShowWhatsAppBanner(false)
    setClientContacted(false)
    setCurrentOrderId(null)
    // Mostrar banner do WhatsApp aos 5s da geração (Meta-safe: cliente precisa nos contactar)
    if (phone) {
      setTimeout(() => setShowWhatsAppBanner(true), 5000)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })

    let orderId = null
    try {
      console.log('[HC] 📦 Criando order no Supabase...')
      const created = await apiCreateOrder({
        phone: phone?.replace(/\D/g, '') || '',
        honoree_name: honoreeName,
        customer_name: clientName || null,
        occasion: occasion || null,
        story: story || null,
        style_raw: `${genre} | ${mood} | ${voice}`,
        genre: genre || null,
        mood: mood || null,
        voice: voice || null,
        relationship: relationship || null,
      })
      if (created?.orderId) orderId = created.orderId
      setCurrentOrderId(orderId)  // expõe pro banner do WhatsApp
      // Persiste pra sobreviver a reload — quando o cliente atualizar a página,
      // o boot do App detecta esse pedido e volta direto pra view='progress'.
      if (orderId) saveCurrentOrder({
        id: orderId,
        honoreeName,
        plan: 'musica',
        customerName: clientName,
        phone: phone?.replace(/\D/g, '') || '',
      })
      console.log('[HC] ✅ Order criada:', orderId)
    } catch (err) { console.error('[HC] ❌ Supabase order:', err.message) }

    try {
      const cleanPhone = phone?.replace(/\D/g, '') || undefined
      const vocalGender = voice === 'Masculino' ? 'male' : voice === 'Feminino' ? 'female' : undefined

      // 1. Dispara geração (resposta instantânea)
      console.log('[HC] 🚀 Chamando API generate_and_notify...')
      const resp = await fetch(`${API_URL}/api/generate_and_notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story, tags, title: `Para ${honoreeName}`, model: 'chirp-fenix',
          make_instrumental: false, phone: cleanPhone, vocal_gender: vocalGender,
          honoreeName, relationship, occasion, genre, mood, voice, orderId,
        })
      })

      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        console.error('[HC] ❌ API erro:', resp.status, d)
        throw new Error(d.error || `Erro ${resp.status}`)
      }
      const apiResult = await resp.json()
      console.log('[HC] ✅ API respondeu:', apiResult)

      // 2. Polling no Supabase até status = completed (max 6 min)
      const statusMsgs = {
        generating: ['📤 Enviando para o estúdio...', '🎼 Compondo melodia e harmonias...', '🎤 Gravando vocais no estúdio...', '🎸 Adicionando instrumentos...', '🎧 Mixando e masterizando...', '✨ Finalizando sua obra-prima...'],
      }
      let lastStatus = 'generating'
      let previewAudioUrl = null
      let originalAudioUrl = null
      let msgIdx = 0

      // ═══ Tick visual contínuo (250ms) — desacoplado do polling ═══
      // Em vez de pular de 0 → 7.5 → 12 etc a cada poll de 5s, a barra avança
      // SUAVE a cada 250ms usando curva exponencial easeOut:
      //   progress = 95 * (1 - exp(-elapsed / TAU))
      //   com TAU=55:  ~10% em 5s, ~33% em 20s, ~63% em 60s, ~86% em 120s, ~95% em 180s
      // Dá sensação real de movimento desde o primeiro segundo.
      const startMs = Date.now()
      const TAU = 55  // controla a velocidade da curva — menor = mais rápido
      tickId = setInterval(() => {
        const elapsedS = (Date.now() - startMs) / 1000
        const target = 95 * (1 - Math.exp(-elapsedS / TAU))
        // Math.max preserva qualquer salto pra >target que o backend possa setar
        setProgress(prev => Math.max(prev, Math.min(95, target)))
      }, 250)

      for (let i = 0; i < 72; i++) { // max 6 min (72 * 5s)
        await new Promise(r => setTimeout(r, 5000))

        // Mensagens alternadas
        const msgs = statusMsgs[lastStatus] || statusMsgs.generating
        setStatusMsg(msgs[msgIdx % msgs.length])
        msgIdx++

        if (!orderId) { console.log('[HC] ⏳ Sem orderId, pulando poll...'); continue }
        try {
          const row = await apiOrderStatus(orderId)
          if (!row) continue
          lastStatus = row.status
          // Atualizar UI quando cliente contactar a Bia
          if (row.client_contacted_at && !clientContacted) {
            setClientContacted(true)
            console.log('[HC] ✅ CLIENT_CONTACTED detectado!')
          }
          console.log(`[HC] 📊 Poll #${i+1}: status=${row.status}, preview=${row.preview_audio_url || 'null'}, original=${row.original_audio_url || 'null'}, contactado=${!!row.client_contacted_at}`)

          if (row.status === 'preview_sent') {
            previewAudioUrl = row.preview_audio_url || null
            originalAudioUrl = row.original_audio_url || null
            console.log('[HC] ✅ PREVIEW_SENT! preview:', previewAudioUrl, 'original:', originalAudioUrl)
            break
          }
          // NOVO: cookie expirou → backend tá retentando automaticamente em ~10min
          // Não é erro, é fila. Persistir form data e ir pra view especial.
          if (row.status === 'awaiting_retry') {
            console.log('[HC] ⏳ AWAITING_RETRY — sistema vai retentar automaticamente em ~10min')
            // Persistir form data e orderId no localStorage (defesa extra)
            try {
              localStorage.setItem('hc_pending_order', JSON.stringify({
                orderId,
                formData,
                phone,
                timestamp: Date.now(),
              }))
            } catch(_) {}
            setView('queued')
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return // sai do useCallback sem ir pra error/result
          }
          if (row.status === 'failed') {
            throw new Error('Erro ao gerar música. Tente novamente.')
          }
        } catch (pollErr) {
          if (pollErr.message.includes('Erro ao gerar')) throw pollErr
          console.error('[HC] ⚠️ Poll error:', pollErr.message)
        }
      }

      // Para o tick visual e cravam 100% pra dar fechamento limpo
      clearInterval(tickId)
      setProgress(100); setStatusMsg('✅ Prévia pronta!')

      // Buscar dados finais da order
      let orderData = {}
      if (orderId) {
        try {
          const row = await apiOrderStatus(orderId)
          if (row) orderData = row
          console.log('[HC] 📋 Order final:', JSON.stringify(orderData))
        } catch (e) { console.error('[HC] ❌ Fetch order final:', e.message) }
      }

      setTimeout(() => {
        const finalPreview = previewAudioUrl || orderData.preview_audio_url || null
        const finalOriginal = originalAudioUrl || orderData.original_audio_url || null
        const rd = {
          title: `Para ${honoreeName}`,
          honoreeName,
          tags: tags,
          preview_url: finalPreview,
          original_url: finalOriginal,
          preview_error: !finalPreview ? (orderData.error_message || null) : null,
          lyrics: orderData.final_lyrics || null,
          whatsapp: !!phone,
          orderId,
          // pra a mensagem rica do "Falar com a Bia no WhatsApp"
          customerName: orderData.customer_name || formData.clientName || null,
          phone: orderData.phone || phone || null,
        }
        console.log('[HC] 🎵 Result data:', JSON.stringify(rd))
        setResultData(rd)
        setView('result')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 800)

    } catch (err) {
      if (orderId) { await apiOrderError(orderId, err.message) }
      setErrorMsg(err.message); setView('error')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      // Sempre limpa o tick visual, mesmo se houver erro/exception
      if (tickId) clearInterval(tickId)
      setLoading(false)
    }
  }, [formData])

  const resetToLanding = () => {
    setView('landing'); setStep(1); setProgress(0);
    // Mantém nome/telefone se temos cliente reconhecido — UX recorrente
    const c = loadCustomer()
    setFormData({
      honoreeName: '', relationship: '', occasion: '', story: '',
      genre: '', mood: '', voice: '',
      clientName: c?.name || '', phone: c?.phone || '',
    });
    // Limpa o pedido em andamento — cliente está começando outro fluxo
    clearCurrentOrder()
    setResultData(null)
    setCurrentOrderId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const [chatModal, setChatModal] = useState(false)
  const [quizModal, setQuizModal] = useState(false)
  const [offerEnd] = useState(getOfferEnd)
  // CTA "Criar música": abre o QUIZ (fluxo primário) ou, se desligado, o chat da Bia.
  const scrollToForm = () => {
    if (USE_QUIZ) { track('OpenQuiz', null, true); setQuizModal(true); return }
    track('OpenChat', null, true); setChatModal(true)
  }
  // "prefiro conversar" no quiz -> abre o chat da Bia (fallback)
  const openChatFromQuiz = () => { setQuizModal(false); track('OpenChat', null, true); setChatModal(true) }
  // quiz concluído -> reusa EXATAMENTE o fluxo de geração existente (handleSubmit)
  const handleQuizComplete = (data) => { setQuizModal(false); handleSubmit(data) }

  /* ═══════════════════════════════════════════════════════════
     CHAT DA BIA — atendimento estilo WhatsApp com opções em LISTA.
     Guiado: o lead clica nas opções (relação, estilo, clima, voz),
     então não tem como "travar" com resposta confusa. Nome/história
     são texto livre. No fim → mesmo handleSubmit do site (geração).
  ═══════════════════════════════════════════════════════════ */
  const [chatMessages, setChatMessages] = useState([])
  const [chatStep, setChatStep] = useState(-1)
  const [chatInput, setChatInput] = useState('')
  const [botTyping, setBotTyping] = useState(false)
  const [chatData, setChatData] = useState({})
  const chatBodyRef = useRef(null)
  const chatStartedRef = useRef(false)
  const storyFollowRef = useRef(0)
  const draftRef = useRef(null)   // id do pedido-rascunho (persistência incremental)
  const stepTsRef = useRef(0)     // timestamp de entrada na etapa atual (mede tempo por etapa)
  const lastStepRef = useRef(null) // última etapa do chat alcançada (pra registrar abandono)
  const [chatView, setChatView] = useState('menu')   // 'menu' | 'create' | 'lookup'
  const [savedOrder, setSavedOrder] = useState(null)  // pedido salvo no navegador (resume)
  const [otherFor, setOtherFor] = useState(null)      // passo de opção aguardando texto livre ("Outro")
  const [videoModal, setVideoModal] = useState(null)  // {src, poster} do vídeo de exemplo aberto
  const audioCtxRef = useRef(null)
  // som de notificação da Bia (di-ding) quando a prévia fica pronta
  const playDing = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ac = audioCtxRef.current
      if (ac.state === 'suspended') ac.resume()
      const now = ac.currentTime
      ;[[880, 0], [1318, 0.14]].forEach(([f, t]) => {
        const o = ac.createOscillator(), g = ac.createGain()
        o.type = 'sine'; o.frequency.value = f
        o.connect(g); g.connect(ac.destination)
        g.gain.setValueAtTime(0.0001, now + t)
        g.gain.exponentialRampToValueAtTime(0.22, now + t + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.28)
        o.start(now + t); o.stop(now + t + 0.32)
      })
    } catch (_) {}
  }
  const _sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
  const lastSeenRef = useRef(null)
  if (!lastSeenRef.current) { const d = new Date(Date.now() - 240000); lastSeenRef.current = 'visto por último hoje às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
  const biaStatus = botTyping ? 'digitando…' : (chatStep > -1 ? 'online' : lastSeenRef.current)

  // Limpa "Meu filho Guilherme" -> "Guilherme" (remove palavras de parentesco/ligação)
  const cleanName = (s) => {
    const stop = new Set(['meu','minha','filho','filha','esposa','esposo','marido','mulher','namorada','namorado','noiva','noivo','pai','mae','irmao','irma','amigo','amiga','pra','para','e','o','a','eh','da','do','de','sr','sra','dona','seu','sua','chama','nome'])
    const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    let words = s.trim().split(/\s+/).filter(w => w && !stop.has(norm(w)))
    if (!words.length) words = s.trim().split(/\s+/)
    const out = words.slice(0, 3).join(' ').trim()
    return out ? out.charAt(0).toUpperCase() + out.slice(1) : s.trim()
  }

  const chatFlow = [
    { key: 'honoreeName', type: 'text', placeholder: 'Digite o nome...', clean: cleanName,
      validate: (v) => {
        const s = (v || '').trim()
        if (s.length < 2) return 'Me diz o nome certinho, por favor 😊'
        if (!/^[A-Za-zÀ-ÿ'’.\-\s]+$/.test(s)) return 'O nome deve ter só letras 😊'
        if (!/[aeiouàáâãéêíóôõúAEIOUÀÁÂÃÉÊÍÓÔÕÚ]/.test(s)) return 'Hmm, esse nome parece estranho 🤔 Pode conferir?'
        if (s.split(/\s+/).some(w => w.length > 15)) return 'Hmm, esse nome parece estranho 🤔 Pode conferir?'
        return true
      },
      bia: () => ['Oii! Eu sou a *Bia* 💜', 'Vou te ajudar a criar uma música personalizada que vai emocionar de verdade 🎶', 'Me conta: pra quem é a música? (só o *nome* da pessoa 😊)'] },
    { key: 'relationship', type: 'options', allowOther: true, grid: true, options: ['Esposo(a)', 'Namorado(a)', 'Filho(a)', 'Mãe', 'Pai', 'Irmão(ã)', 'Avó/Avô', 'Tio(a)', 'Madrinha/Padrinho', 'Amigo(a)', 'Outro'],
      bia: (d) => `Que escolha linda! E qual a sua relação com *${d.honoreeName}*? 🥰` },
    { key: 'occasion', type: 'options', optional: true, options: ['Aniversário', 'Dia das Mães', 'Dia dos Pais', 'Casamento', 'Surpresa', 'Pular ➡️'],
      bia: () => 'Tem alguma *ocasião* especial? (pode pular, se quiser) 🎉' },
    { key: 'story', type: 'text', audio: true, placeholder: 'Escreva ou toque no microfone pra contar por áudio...',
      bia: (d) => ['Agora a parte mais importante 💜', `Me conta a história de vocês com *${d.honoreeName}* — como começou, os momentos que marcaram... Pode escrever ou *mandar um áudio* (toque no microfone).`] },
    { key: 'storyAdmire', type: 'text', audio: true, appendStory: true, placeholder: 'O que te faz amar essa pessoa...',
      bia: (d) => `E o que você mais *admira* no(a) *${d.honoreeName}*? Um jeitinho, uma qualidade, algo que só vocês sabem 🥰` },
    { key: 'storyMoment', type: 'text', audio: true, optional: true, appendStory: true, placeholder: 'Um momento marcante de vocês...',
      bia: () => ['Tô amando! 🥹', 'Tem um *momento especial* de vocês que não pode faltar na música? ✨ (se quiser, é só *pular*)'] },
    { key: 'genre', type: 'options', grid: true, options: GENRES.map(g => g.label),
      bia: () => 'Que história linda! 🥰 Qual *estilo* musical combina mais?' },
    { key: 'mood', type: 'options', options: MOODS,
      bia: () => 'E qual *clima* você quer passar na música? 🎵' },
    { key: 'voice', type: 'options', options: ['Masculino', 'Feminino'],
      bia: () => 'Quer a voz *masculina* ou *feminina* cantando? 🎤' },
    { key: 'clientName', type: 'text', placeholder: 'Seu nome e sobrenome',
      validate: (v) => {
        const s = (v || '').trim()
        const words = s.split(/\s+/).filter(Boolean)
        if (!/^[A-Za-zÀ-ÿ'’.\-\s]+$/.test(s)) return 'O nome deve ter só letras 😊'
        if (words.filter(w => w.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 2).length < 2) return 'Preciso do seu *nome e sobrenome* completos 😊'
        if (!/[aeiouàáâãéêíóôõúyAEIOU]/.test(s)) return 'Hmm, esse nome parece estranho 🤔 Pode conferir?'
        if (words.some(w => w.length > 15)) return 'Hmm, esse nome parece estranho 🤔 Pode conferir?'
        return true
      },
      bia: () => 'Estamos quase lá! Como é o *seu nome completo*? 😊' },
    { key: 'phone', type: 'phone', placeholder: '(DDD) número', validate: (v) => v.replace(/\D/g, '').length >= 10 || 'Hmm, me passa um número válido com DDD 📲',
      bia: () => 'Por último: qual seu *WhatsApp (com DDD)*? É só pra eu guardar seu contato e você não perder a sua música 📲' },
  ]

  const formatBia = (text) => String(text).split(/(\*[^*]+\*)/g).map((p, i) =>
    (p.startsWith('*') && p.endsWith('*') && p.length > 2)
      ? <strong key={i}>{p.slice(1, -1)}</strong>
      : <span key={i}>{p}</span>)

  const botSay = async (msgs, nextStep) => {
    const arr = Array.isArray(msgs) ? msgs : [msgs]
    for (const m of arr) {
      setBotTyping(true)
      await _sleep(650 + Math.min(1300, m.length * 16))
      setBotTyping(false)
      setChatMessages(prev => [...prev, { from: 'bia', text: m, t: nowHM() }])
      await _sleep(150)
    }
    if (nextStep !== undefined) setChatStep(nextStep)
  }

  const startChat = () => {
    if (chatStartedRef.current) return
    chatStartedRef.current = true
    storyFollowRef.current = 0
    track('ChatStart', null, true)
    const saved = loadOrderLocal()
    setSavedOrder(saved && saved.id ? saved : null)
    setChatView('menu')
    setChatStep(-1)
    const hello = (saved && saved.id)
      ? ['Oii! Eu sou a *Bia* 💜', `Que bom te ver de novo! 🥰 Vi que você tem uma música pra *${saved.honoreeName || 'alguém especial'}* 🎶`, 'O que você quer fazer?']
      : ['Oii! Eu sou a *Bia* 💜', 'Vou te ajudar a criar uma música que vai emocionar de verdade 🎶', 'O que você quer fazer?']
    botSay(hello)
  }

  const goToMenu = () => {
    chatStartedRef.current = true
    setSavedOrder(loadOrderLocal())
    setChatView('menu'); setChatStep(-1)
    botSay('O que você quer fazer? 💜')
  }
  // ── Menu inicial: criar nova, consultar pedido, ou continuar o salvo ──
  const beginCreate = () => {
    setChatMessages(prev => [...prev, { from: 'user', text: '✨ Criar uma música', t: nowHM() }])
    setChatData({}); storyFollowRef.current = 0; draftRef.current = null; setOtherFor(null)
    setChatView('create')
    botSay('Que delícia! 🥰 Me conta: pra quem é a música? (só o *nome* da pessoa 😊)', 0)
  }
  const beginLookup = () => {
    setChatMessages(prev => [...prev, { from: 'user', text: '🔎 Consultar meu pedido', t: nowHM() }])
    setChatView('lookup')
    botSay('Claro! Me passa o *WhatsApp (com DDD)* que você usou no pedido que eu já acho pra você 📲')
  }
  const submitLookup = async (rawPhone) => {
    const phone = (rawPhone || '').replace(/\D/g, '')
    if (phone.length < 10) { botSay('Hmm, me passa um número válido com DDD 📲'); return }
    setChatMessages(prev => [...prev, { from: 'user', text: rawPhone, t: nowHM() }])
    setChatInput('')
    setBotTyping(true)
    const r = await apiOrderLookup(phone)
    setBotTyping(false)
    const orders = (r && r.orders) || []
    if (!orders.length) {
      await biaSay('Não achei nenhum pedido com esse número 😕 Confere o DDD, ou bora *criar uma música nova*?')
      setChatView('menu'); setChatStep(-1)
      return
    }
    await renderOrderInChat(orders[0])
  }
  const resumeOrder = async () => {
    const saved = savedOrder || loadOrderLocal()
    if (!saved || !saved.id) { beginCreate(); return }
    setChatMessages(prev => [...prev, { from: 'user', text: `📦 Continuar — ${saved.honoreeName || 'meu pedido'}`, t: nowHM() }])
    setBotTyping(true)
    const row = await apiOrderStatus(saved.id)
    setBotTyping(false)
    if (!row) { await biaSay('Não consegui achar esse pedido agora 😕 Bora criar uma nova?'); setChatView('menu'); return }
    await renderOrderInChat({ id: saved.id, ...row, _plan: saved.plan, _planName: saved.planName, _planPrice: saved.planPrice })
  }
  // Mostra no chat o estado atual de um pedido (prévia / música paga / em produção)
  const renderOrderInChat = async (o) => {
    setChatView('done'); setChatStep(STAGE_BUSY)
    const nome = o.honoree_name || o.honoreeName || 'você'
    const paid = !!o.paid_at
    const full = o.original_audio_url || o.preview_audio_url
    const video = o.video_upsell_url || o.video_brinde_url
    if (paid && full) {
      await biaSay(`Achei! 🎉 A sua *música completa* pra *${nome}* tá aqui 🎶`)
      pushBubble({ kind: 'audio', src: full, label: 'Música completa' })
      pushBubble({ kind: 'download', src: full, label: 'Baixar MP3', file: 'musica.mp3' })
      if (video) {
        await biaSay('E o seu *vídeo* 🎬')
        pushBubble({ kind: 'video', src: video })
        pushBubble({ kind: 'download', src: video, label: 'Baixar vídeo', file: 'video.mp4' })
      }
      pushBubble({ kind: 'menu' })
    } else if (o.preview_audio_url) {
      await biaSay(`Achei a sua música pra *${nome}*! 🥰 Aqui a *prévia*:`)
      pushBubble({ kind: 'audio', src: o.preview_audio_url, label: `Prévia · ${nome}` })
      await biaSay('Pra liberar a *versão completa* (sem aviso) + o *vídeo*, é só finalizar o pagamento 👇')
      const plan = o._plan || 'musica'
      pushBubble({ kind: 'pay', orderId: o.id, plan, planName: o._planName || 'Música', planPrice: o._planPrice || '19,90' })
    } else {
      await biaSay(`Sua música pra *${nome}* ainda tá no forno 🔥 Fica tranquilo(a) que em uns minutinhos ela aparece! Pode voltar aqui e *consultar* de novo 💜`)
      pushBubble({ kind: 'menu' })
    }
  }

  // A Bia lê a história e responde de forma viva (GPT no backend, com fallback canned)
  const handleStoryGpt = async (data) => {
    const storyIdx = chatFlow.findIndex(s => s.key === 'story')
    const nextIdx = storyIdx + 1   // storyAdmire — segue o script: agradece e pede mais detalhes
    setBotTyping(true)
    const { reply } = await apiChatAck({ honoreeName: data.honoreeName, relationship: data.relationship, story: data.story })
    await botSay(reply ? [reply, chatFlow[nextIdx].bia(data)] : chatFlow[nextIdx].bia(data), nextIdx)
  }

  // mapeia chaves do chat -> colunas do banco (persistência incremental)
  const DB_FIELD = { honoreeName: 'honoree_name', relationship: 'relationship', occasion: 'occasion', story: 'story', genre: 'genre', mood: 'mood', voice: 'voice_preference', clientName: 'customer_name', phone: 'phone' }
  // cria o pedido-rascunho UMA vez (quando a história chega) e mantém atualizado no Supabase
  const ensureDraftOrder = async (d) => {
    if (draftRef.current) { apiOrderUpdate(draftRef.current, { story: d.story }); return draftRef.current }
    try {
      const created = await apiCreateOrder({ phone: '', honoree_name: d.honoreeName, customer_name: d.clientName || null, occasion: d.occasion || null, story: d.story || null, relationship: d.relationship || null })
      const oid = created && created.orderId
      if (oid) { draftRef.current = oid; setCurrentOrderId(oid); const so = { id: oid, honoreeName: d.honoreeName }; saveOrderLocal(so); setSavedOrder(so) }
      return oid
    } catch (_) { return null }
  }

  const answerChat = (rawValue, displayText) => {
    const step = chatFlow[chatStep]
    if (!step || botTyping) return
    // modo "Outro": o texto digitado vira a resposta da opção
    if (otherFor) {
      const v = (rawValue || '').trim()
      if (!v) return
      const key = otherFor
      setOtherFor(null)
      setChatMessages(prev => [...prev, { from: 'user', text: v, t: nowHM() }])
      setChatInput('')
      const newData = { ...chatData, [key]: v }
      setChatData(newData)
      if (draftRef.current && DB_FIELD[key]) apiOrderUpdate(draftRef.current, { [DB_FIELD[key]]: v })
      const next = chatStep + 1
      if (next < chatFlow.length) botSay(chatFlow[next].bia(newData), next)
      return
    }
    // intercepta "Outro" em opções com texto livre
    if (step.type === 'options' && step.allowOther && /^outro/i.test(rawValue)) {
      setChatMessages(prev => [...prev, { from: 'user', text: 'Outro', t: nowHM() }])
      setOtherFor(step.key)
      botSay(`Sem problema! Me conta: qual a sua relação com *${chatData.honoreeName || 'essa pessoa'}*? (pode escrever 💜)`, chatStep)
      return
    }
    const isSkip = step.optional && /pular/i.test(rawValue)
    if (!isSkip && step.validate) {
      const v = step.validate(rawValue)
      if (v !== true) {
        setChatMessages(prev => [...prev, { from: 'user', text: displayText || rawValue, t: nowHM() }])
        setChatInput('')
        botSay(typeof v === 'string' ? v : 'Hmm, pode repetir? 😊', chatStep)
        return
      }
    }
    const value = isSkip ? '' : (step.clean ? step.clean(rawValue) : rawValue)
    setChatMessages(prev => [...prev, { from: 'user', text: displayText || rawValue, t: nowHM() }])
    setChatInput('')
    // funil: qual etapa + quanto tempo o cliente levou nela (mede onde ele "trava")
    const _dt = stepTsRef.current ? Math.round((Date.now() - stepTsRef.current) / 1000) : 0
    track('ChatStep', { step: step.key, n: chatStep + 1, dt_s: _dt }, true)
    lastStepRef.current = { step: step.key, n: chatStep + 1 }
    if (step.key === 'clientName') track('Lead')                    // contato/lead capturado
    // ── HISTÓRIA: a Bia "entende" via GPT (acumula + agradece específico) ──
    if (step.key === 'story') {
      const fullStory = (chatData.story ? chatData.story + ' ' : '') + value
      const merged = { ...chatData, story: fullStory }
      setChatData(merged)
      ensureDraftOrder(merged)   // cria o pedido no Supabase já aqui (persistência incremental)
      handleStoryGpt(merged)
      return
    }
    // ── DETALHES extras (admira, momento): acumulam na história e seguem o fluxo ──
    if (step.appendStory) {
      const fullStory = (chatData.story ? chatData.story + ' ' : '') + (value || '')
      const merged = { ...chatData, story: fullStory }
      setChatData(merged)
      if (draftRef.current) apiOrderUpdate(draftRef.current, { story: fullStory })
      const next = chatStep + 1
      if (next < chatFlow.length) botSay(chatFlow[next].bia(merged), next)
      return
    }
    // ── TELEFONE (último passo): checa rate limit antes de seguir pro plano ──
    if (step.key === 'phone') {
      const newData = { ...chatData, phone: value }
      setChatData(newData)
      if (draftRef.current) apiOrderUpdate(draftRef.current, { phone: value })
      checkRateAndContinue(newData)
      return
    }
    const newData = { ...chatData, [step.key]: value }
    setChatData(newData)
    if (draftRef.current && DB_FIELD[step.key]) apiOrderUpdate(draftRef.current, { [DB_FIELD[step.key]]: value })
    const next = chatStep + 1
    if (next < chatFlow.length) {
      botSay(chatFlow[next].bia(newData), next)
    } else {
      setChatStep(chatFlow.length)
      const resumo = `Prontinho! Deixa eu confirmar o resumo 💜\n\n🎵 Pra: *${newData.honoreeName}* (${newData.relationship || '—'})\n🎶 Estilo: *${newData.genre || '—'}* · Clima: *${newData.mood || '—'}*\n🎤 Voz: *${newData.voice || '—'}*`
      botSay([resumo, 'Agora escolhe o *plano* que você quer 👇 (a prévia é grátis — você só paga depois de ouvir e gostar)'], chatFlow.length)
    }
  }

  // Escolha do plano no resumo (3 opções)
  const pickPlan = (p) => {
    if (botTyping) return
    setChatMessages(prev => [...prev, { from: 'user', text: `${p.name} — R$ ${p.price}`, t: nowHM() }])
    track('AddToCart', { content_name: p.name, value: priceToNum(p.price), currency: 'BRL' })
    setChatData(prev => ({ ...prev, plan: p.planKey, planName: p.name, planPrice: p.price }))
    setChatStep(chatFlow.length + 1)
    botSay(['Ótima escolha! ✨ Já já te mando a prévia aqui no chat 🎶', 'É só confirmar aqui embaixo que eu mando pro estúdio agora!'], chatFlow.length + 1)
  }

  const STAGE_BUSY = -2
  // a Bia "fala" (1 mensagem com efeito de digitando)
  const biaSay = async (text) => {
    setBotTyping(true)
    await _sleep(550 + Math.min(1100, (text || '').length * 13))
    setBotTyping(false)
    setChatMessages(prev => [...prev, { from: 'bia', text, t: nowHM() }])
    await _sleep(120)
  }
  const pushBubble = (msg) => setChatMessages(prev => [...prev, { from: 'bia', t: nowHM(), ...msg }])

  // Checa o rate limit (1 prévia não-paga por número/24h). Se bloqueado, mostra a prévia pendente + pagar.
  const checkRateAndContinue = async (d) => {
    setBotTyping(true)
    const r = await apiCanPreview((d.phone || '').replace(/\D/g, ''), draftRef.current)
    setBotTyping(false)
    if (r && r.blocked && r.order) {
      setChatView('done'); setChatStep(STAGE_BUSY)
      await biaSay(`Opa! 💜 Vi que você já pediu uma prévia pra *${r.order.honoree_name || 'alguém especial'}* nas últimas 24h.`)
      await biaSay('Pra criar uma *música nova*, é só liberar essa primeiro 👇 Aí você pode pedir quantas quiser! ✨')
      if (r.order.preview_audio_url) pushBubble({ kind: 'audio', src: r.order.preview_audio_url, label: `Prévia · ${r.order.honoree_name || ''}` })
      pushBubble({ kind: 'pay', orderId: r.order.id, plan: 'musica', planName: 'Música', planPrice: '19,90' })
      return
    }
    setChatStep(chatFlow.length)
    const resumo = `Prontinho! Deixa eu confirmar o resumo 💜\n\n🎵 Pra: *${d.honoreeName}* (${d.relationship || '—'})\n🎶 Estilo: *${d.genre || '—'}* · Clima: *${d.mood || '—'}*\n🎤 Voz: *${d.voice || '—'}*`
    botSay([resumo, 'Agora escolhe o *plano* que você quer 👇 (a prévia é grátis — você só paga depois de ouvir e gostar)'], chatFlow.length)
  }

  // CRIA a música e mostra a PRÉVIA dentro do chat (reusa a geração que já funciona)
  const createInChat = async () => {
    const d = { ...formData, ...chatData }
    track('CompleteRegistration', { content_name: d.planName || 'Música', value: priceToNum(d.planPrice), currency: 'BRL' })
    track('CreateMusic', { plan: d.plan || 'musica' }, true)
    setChatStep(STAGE_BUSY)
    // destrava o áudio agora (gesto do clique) pra o som de notificação tocar quando a prévia chegar
    try { const C = window.AudioContext || window.webkitAudioContext; if (C) { if (!audioCtxRef.current) audioCtxRef.current = new C(); audioCtxRef.current.resume() } } catch (_) {}
    await biaSay('Maravilha! 🎵 Já tô mandando a sua música pro estúdio… em uns minutinhos a prévia chega aqui pra você ouvir 💜')
    const cleanPhone = (d.phone || '').replace(/\D/g, '')
    let orderId = draftRef.current || null
    try {
      if (orderId) {
        // REUSA o rascunho criado durante a conversa — só completa os campos finais
        await apiOrderUpdate(orderId, {
          phone: cleanPhone, customer_name: d.clientName || null, genre: d.genre || null, mood: d.mood || null,
          voice_preference: d.voice || null, style_raw: `${d.genre} | ${d.mood} | ${d.voice}`,
        })
      } else {
        const created = await apiCreateOrder({
          phone: cleanPhone, honoree_name: d.honoreeName, customer_name: d.clientName || null,
          occasion: d.occasion || null, story: d.story || null,
          style_raw: `${d.genre} | ${d.mood} | ${d.voice}`, genre: d.genre || null, mood: d.mood || null,
          voice: d.voice || null, relationship: d.relationship || null,
        })
        orderId = created?.orderId
      }
      if (orderId) {
        setCurrentOrderId(orderId)
        const so = { id: orderId, honoreeName: d.honoreeName, plan: d.plan, planName: d.planName, planPrice: d.planPrice }
        saveOrderLocal(so); setSavedOrder(so)
      }
    } catch (_) {}
    try {
      const tags = [d.genre || 'Pop brasileiro', d.mood, d.voice === 'Masculino' ? 'male vocals' : d.voice === 'Feminino' ? 'female vocals' : ''].filter(Boolean).join(', ')
      await fetch(`${API_URL}/api/generate_and_notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story: d.story, tags, title: `Para ${d.honoreeName}`, model: 'chirp-fenix', make_instrumental: false, phone: cleanPhone, vocal_gender: d.voice === 'Masculino' ? 'male' : d.voice === 'Feminino' ? 'female' : undefined, honoreeName: d.honoreeName, relationship: d.relationship, occasion: d.occasion, genre: d.genre, mood: d.mood, voice: d.voice, orderId }),
      })
    } catch (_) {}
    // ── ENTRETENIMENTO enquanto gera (deterministico, roda em paralelo ao polling) ──
    let done = false
    const entertain = async () => {
      await _sleep(1400); if (done) return
      await biaSay('Enquanto a sua fica pronta (uns minutinhos ⏳), se liga em algumas que a gente já fez 🎶'); if (done) return
      pushBubble({ kind: 'examples' }); if (done) return
      await _sleep(24000); if (done) return
      await biaSay('E ó que massa: cada música ainda vira um *vídeo* 🎬 dá um play pra ver como fica 👇'); if (done) return
      pushBubble({ kind: 'exampleVideo' }); if (done) return
      await _sleep(38000); if (done) return
      await biaSay('Tá quase saindo do forno… 🔥 já já chega a sua 💜'); if (done) return
      await _sleep(40000); if (done) return
      await biaSay('Mais um pouquinho — qualidade leva uns minutinhos 🎧✨')
    }
    entertain()
    let preview = null, failed = false, queued = false
    if (orderId) {
      for (let i = 0; i < 72; i++) {
        await _sleep(5000)
        const row = await apiOrderStatus(orderId)
        if (!row) continue
        if (row.status === 'preview_sent') { preview = row.preview_audio_url || row.original_audio_url; break }
        if (row.status === 'failed') { failed = true; break }
        if (row.status === 'awaiting_retry') { queued = true; break }
      }
    } else { failed = true }
    done = true
    if (preview) {
      playDing()  // 🔔 som de notificação da Bia
      await biaSay(`Ó, ficou lindo! 🥹 Aqui a prévia da música pra *${d.honoreeName}*:`)
      pushBubble({ kind: 'audio', src: preview, label: `Prévia · ${d.honoreeName}`, ding: true })
      await biaSay('Curtiu? Pra liberar a *versão completa* pra você baixar e mandar, é só finalizar o pagamento aqui 👇')
      pushBubble({ kind: 'pay', orderId, plan: d.plan || 'musica', planName: d.planName || 'Música', planPrice: d.planPrice || '19,90' })
    } else if (queued) {
      await biaSay('Tá tendo bastante procura agora 🎶 Sua música entrou na fila e fica pronta em alguns minutinhos — fica aqui no chat que ela aparece pra você ouvir! 💜')
    } else {
      await biaSay('Ai, deu uma instabilidade na hora de criar 😣 Pode tentar de novo aqui daqui a pouco? Em instantes já volta ao normal 💜')
    }
  }

  const submitChat = () => { createInChat() }

  // PÓS-PAGAMENTO: valida e entrega música completa + vídeo dentro do chat
  const deliverInChat = async (orderId, tx, slug) => {
    chatStartedRef.current = true
    setChatModal(true)
    setChatStep(STAGE_BUSY)
    setChatMessages([])
    await biaSay('Deixa eu confirmar seu pagamento… 🔒')
    const r = await apiPayVerify(orderId, tx, slug)
    if (!(r && r.paid)) {
      await biaSay('Ainda não consegui confirmar o pagamento 😅 Se você acabou de pagar, pode levar uns segundinhos.')
      pushBubble({ kind: 'retryPay', orderId, tx, slug })
      return
    }
    trackPurchase()
    let ctx = {}
    try { ctx = JSON.parse(localStorage.getItem('hc_order_ctx') || '{}') } catch (_) {}
    await biaSay('✅ *Pagamento confirmado!* Muito obrigada 💜')
    await biaSay(`Aqui está a sua *música completa*${ctx.honoreeName ? ` pra *${ctx.honoreeName}*` : ''} 🎶`)
    const row = await apiOrderStatus(orderId)
    const full = (row && (row.original_audio_url || row.preview_audio_url)) || null
    if (full) {
      pushBubble({ kind: 'audio', src: full, label: 'Música completa' })
      pushBubble({ kind: 'download', src: full, label: 'Baixar MP3', file: 'musica.mp3' })
    }
    if (ctx.plan === 'completa') {
      // PREMIUM: o vídeo é PERSONALIZADO (com a foto) e vem DEPOIS do upload
      await biaSay('Você escolheu o *vídeo personalizado com foto* 😍 Me manda a *foto* que você quer na capa que eu já monto o seu vídeo 🎬')
      pushBubble({ kind: 'photo', orderId })
    } else {
      const video = row && row.video_brinde_url
      // Vídeo só vem se o cliente comprou o plano completo (R$ 29,90).
      // Pro plano básico (R$ 19,90) é só a música — não mostra nada de vídeo.
      const hasVideoPlan = (d.plan || '').toLowerCase() === 'completa'
      if (video) {
        await biaSay('E o seu *vídeo karaokê* pra cantar e postar nas redes 🎬')
        pushBubble({ kind: 'video', src: video })
        pushBubble({ kind: 'download', src: video, label: 'Baixar vídeo', file: 'video.mp4' })
        await thanksAndMenu()
      } else if (hasVideoPlan) {
        await biaSay('O seu *vídeo karaokê* já tá sendo finalizado — aparece aqui pra você em instantes 🎬')
        ;(async () => {
          for (let i = 0; i < 45; i++) {
            await _sleep(9000)
            const rv = await apiOrderStatus(orderId)
            if (rv && rv.video_brinde_url) {
              playDing()
              await biaSay('Ó, ficou pronto! 🎬 Aqui o seu *vídeo karaokê*:')
              pushBubble({ kind: 'video', src: rv.video_brinde_url })
              pushBubble({ kind: 'download', src: rv.video_brinde_url, label: 'Baixar vídeo', file: 'video.mp4' })
              await thanksAndMenu()
              break
            }
          }
        })()
      } else {
        // Plano básico (R$ 19,90) — só música, sem vídeo. Encerra com agradecimento.
        await thanksAndMenu()
      }
    }
  }

  // agradecimento final + botão pra criar outra música / consultar
  const thanksAndMenu = async () => {
    track('OrderComplete', null, true)
    await biaSay('Prontinho, tá tudo seu! 💜 Muito obrigada por confiar na gente — espero que emocione demais quem você ama 🥹')
    pushBubble({ kind: 'menu' })
  }

  // Upload da foto (plano premium) -> backend valida/gera o vídeo personalizado
  const uploadChatPhoto = async (orderId, file) => {
    if (!file) return
    setChatMessages(prev => [...prev, { from: 'user', text: 'Foto enviada 📷', t: nowHM() }])
    setBotTyping(true)
    try {
      const fd = new FormData()
      fd.append('photo', file)
      const r = await fetch(`${API_URL}/api/order/${orderId}/photo`, { method: 'POST', body: fd })
      setBotTyping(false)
      if (!r.ok) { await biaSay('Não consegui receber a foto agora 😕 Tenta de novo, por favor 💜'); pushBubble({ kind: 'photo', orderId }); return }
      track('PhotoUploaded', null, true)
      await biaSay('Recebi sua foto! 😍 Tô montando o seu *vídeo personalizado* — fica aí que em uns minutinhos ele aparece aqui 🎬')
      // poll pelo vídeo personalizado (gravado em video_brinde_url) e mostra quando ficar pronto
      for (let i = 0; i < 50; i++) {
        await _sleep(9000)
        const rv = await apiOrderStatus(orderId)
        if (rv && rv.video_brinde_url) {
          playDing()
          await biaSay('Ó, ficou INCRÍVEL! 🥹 Aqui o seu *vídeo personalizado*:')
          pushBubble({ kind: 'video', src: rv.video_brinde_url })
          pushBubble({ kind: 'download', src: rv.video_brinde_url, label: 'Baixar vídeo', file: 'video.mp4' })
          track('PremiumVideoDelivered', null, true)
          await thanksAndMenu()
          return
        }
      }
      await biaSay('Tá levando um pouquinho mais que o normal 😅 Pode voltar aqui em *Consultar meu pedido* daqui a pouco que ele aparece pra você 💜')
    } catch (_) { setBotTyping(false); await biaSay('Não consegui enviar a foto agora 😕 Tenta de novo 💜'); pushBubble({ kind: 'photo', orderId }) }
  }

  /* ── Áudio na conversa (gravar → transcrever → vira texto) ── */
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const mediaRecRef = useRef(null)
  const chunksRef = useRef([])
  const recTimerRef = useRef(null)
  const recCancelRef = useRef(false)

  const startRecording = async () => {
    if (recording || transcribing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecRef.current = mr
      chunksRef.current = []
      recCancelRef.current = false
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        clearInterval(recTimerRef.current)
        setRecording(false)
        if (recCancelRef.current) { setRecSecs(0); return }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        setRecSecs(0)
        if (blob.size < 1200) return  // áudio vazio
        setTranscribing(true)
        try {
          const text = await apiTranscribe(blob)
          if (text) setChatInput(prev => (prev ? prev + ' ' : '') + text)
          else alert('Não consegui entender o áudio. Pode tentar de novo ou escrever 💜')
        } catch (_) { alert('Não consegui transcrever o áudio agora. Pode escrever a história? 💜') }
        finally { setTranscribing(false) }
      }
      mr.start()
      setRecording(true); setRecSecs(0)
      recTimerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    } catch (_) {
      alert('Preciso da permissão do microfone pra gravar. Você também pode escrever a história 💜')
    }
  }
  const stopRecording = () => { recCancelRef.current = false; try { mediaRecRef.current?.stop() } catch (_) {} }
  const cancelRecording = () => { recCancelRef.current = true; try { mediaRecRef.current?.stop() } catch (_) {} }

  // auto-scroll do chat
  useEffect(() => {
    if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
  }, [chatMessages, botTyping])

  // ⏱️ marca o tempo de entrada em cada etapa (pra medir onde o cliente demora/trava)
  useEffect(() => {
    if (chatStep >= 0) stepTsRef.current = Date.now()
    if (chatStep === chatFlow.length) track('ViewPlans', null, true)         // chegou na escolha do plano
    if (chatStep === chatFlow.length + 1) track('ConfirmStep', null, true)   // tela de confirmar
  }, [chatStep, chatView])

  // 📉 ABANDONO: se o cliente sai/fecha no meio do chat, registra ONDE ele parou (drop-off)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      const inFlow = chatView === 'create' && chatStep >= 0 && chatStep < chatFlow.length
      if (inFlow && lastStepRef.current) {
        const dt = stepTsRef.current ? Math.round((Date.now() - stepTsRef.current) / 1000) : 0
        track('ChatAbandon', { step: chatFlow[chatStep]?.key, n: chatStep + 1, dt_s: dt }, true)
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide) }
  }, [chatView, chatStep])

  // 👁️ SEÇÕES vistas + PROFUNDIDADE de scroll (engajamento na landing)
  useEffect(() => {
    if (view !== 'landing') return
    const seen = new Set()
    const secs = document.querySelectorAll('section[id], section[class*="hero"], section[class*="preview"], section[class*="pricing"], section[class*="faq"]')
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const name = e.target.id || (e.target.className || '').toString().split(' ')[0]
          if (name && !seen.has(name)) { seen.add(name); track('ViewSection', { section: name }, true) }
        }
      })
    }, { threshold: 0.4 })
    secs.forEach((s) => io.observe(s))
    const depths = [25, 50, 75, 100]; const hit = new Set()
    const onScroll = () => {
      const sc = window.scrollY + window.innerHeight
      const h = document.documentElement.scrollHeight
      const pct = Math.round((sc / h) * 100)
      depths.forEach((d) => { if (pct >= d && !hit.has(d)) { hit.add(d); track('ScrollDepth', { percent: d }, true) } })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll) }
  }, [view])

  // Bia começa a falar quando o chat (modal) abre
  useEffect(() => {
    if (chatModal) { const t = setTimeout(() => startChat(), 350); return () => clearTimeout(t) }
  }, [chatModal])

  // trava o scroll do fundo quando o quiz (modal) está aberto
  useEffect(() => {
    if (!quizModal) return
    const sy = window.scrollY
    const b = document.body
    const prev = { position: b.style.position, top: b.style.top, width: b.style.width, overflow: b.style.overflow }
    b.style.position = 'fixed'; b.style.top = `-${sy}px`; b.style.width = '100%'; b.style.overflow = 'hidden'
    return () => {
      b.style.position = prev.position; b.style.top = prev.top; b.style.width = prev.width; b.style.overflow = prev.overflow
      window.scrollTo(0, sy)
    }
  }, [quizModal])

  // trava o scroll do fundo quando o modal do chat está aberto (sem rubber-band no iOS)
  useEffect(() => {
    if (!chatModal) return
    const sy = window.scrollY
    const b = document.body
    const prev = { position: b.style.position, top: b.style.top, width: b.style.width, overflow: b.style.overflow }
    b.style.position = 'fixed'; b.style.top = `-${sy}px`; b.style.width = '100%'; b.style.overflow = 'hidden'
    return () => {
      b.style.position = prev.position; b.style.top = prev.top; b.style.width = prev.width; b.style.overflow = prev.overflow
      window.scrollTo(0, sy)
    }
  }, [chatModal])

  // amarra o chat à altura REAL visível (visualViewport) — corrige teclado iOS/Android
  useEffect(() => {
    if (!chatModal) return
    const root = document.documentElement
    const vv = window.visualViewport
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight
      const top = vv ? vv.offsetTop : 0
      root.style.setProperty('--chat-vh', h + 'px')
      root.style.setProperty('--chat-top', top + 'px')
      // mantém a última mensagem visível quando o teclado abre/fecha
      if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
    }
    apply()
    if (vv) { vv.addEventListener('resize', apply); vv.addEventListener('scroll', apply) }
    window.addEventListener('resize', apply); window.addEventListener('orientationchange', apply)
    return () => {
      if (vv) { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply) }
      window.removeEventListener('resize', apply); window.removeEventListener('orientationchange', apply)
      root.style.removeProperty('--chat-vh'); root.style.removeProperty('--chat-top')
    }
  }, [chatModal])

  const benefits = [
    { icon: '💖', title: 'Emoção de verdade', text: 'Ouvir o próprio nome e a própria história numa canção mexe com qualquer um. É o presente que faz chorar de alegria — daqueles que a pessoa nunca esquece.' },
    { icon: '✨', title: 'Única no mundo', text: 'Sua música é composta do zero a partir da história que você contar. Não existe outra igual — é uma obra feita só pra essa pessoa, pra guardar pra sempre.' },
    { icon: '⚡', title: 'Pronta rapidinho', text: 'Sem esperar dias. Você conta a história, escolhe o estilo e a voz, e em poucos minutos já ouve a prévia da sua canção.' }
  ]
  const examples = [
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
  // ── Carrossel de prévias (vídeo + músicas reais) ──
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
  // auto-avança a cada 8s (pausa enquanto estiver tocando)
  useEffect(() => {
    if (view !== 'landing' || previewPlaying) return
    const id = setInterval(() => setPreviewIdx(i => (i + 1) % examples.length), 8000)
    return () => clearInterval(id)
  }, [view, previewPlaying, examples.length])

  const testimonials = [
    { initials: 'MC', name: 'Mariana Costa', loc: 'Rio de Janeiro, RJ', photo: 'https://randomuser.me/api/portraits/women/68.jpg', quote: '"Queria dar um presente único de aniversário. O estúdio criou uma música linda com nossos momentos juntos. Foi de longe o melhor presente que já dei!"' },
    { initials: 'RL', name: 'Rafael Lima', loc: 'São Paulo, SP', photo: 'https://randomuser.me/api/portraits/men/32.jpg', quote: '"Fiz pra minha mãe no Dia das Mães. Ela chorou de emoção quando ouviu o nome dela na letra. Valeu cada centavo, recomendo muito!"' },
    { initials: 'FS', name: 'Fernando Santos', loc: 'Belo Horizonte, MG', photo: 'https://randomuser.me/api/portraits/men/45.jpg', quote: '"A qualidade é impressionante. A música ficou profissional e super emocionante. Minha namorada amou!"' }
  ]
  const features = ['Música completa, sua e exclusiva', '2 versões da mesma letra pra você escolher', 'Vídeo de brinde pra postar nas redes 🎁', 'Entrega rápida e segura no WhatsApp', 'Arquivo em MP3 pra guardar pra sempre']

  /* ── Como funciona (4 passos) ── */
  const howSteps = [
    { n: 1, title: 'Conte a sua história', text: 'Você nos diz pra quem é, a relação e os momentos especiais. Pode ser por texto ou por áudio — do seu jeito.' },
    { n: 2, title: 'Personalize cada detalhe', text: 'Escolha o estilo musical, o clima e a voz (masculina ou feminina). A música fica com a sua cara.' },
    { n: 3, title: 'Receba a prévia na hora', text: 'Em poucos minutos você ouve um trecho da música pronta, sem compromisso e sem pagar nada antes.' },
    { n: 4, title: 'Emocione quem você ama', text: 'Liberou a versão completa, é seu pra guardar e mandar — fica pra sempre 💜' },
  ]

  /* ── Recursos (bento grid) ── */
  const featureBento = [
    { key: 'unica', title: 'Única no mundo', text: 'Cada canção é composta do zero a partir da sua história. Não existe outra igual.', span: 'sm' },
    { key: 'pers', title: '100% personalizada', text: 'Nome, momentos, piadas internas, estilo e voz — tudo escolhido por você.', span: 'sm' },
    { key: 'voz', title: 'Voz à sua escolha', text: 'Masculina, feminina ou deixa o estúdio decidir o que combina mais.', span: 'tall', media: 'phone' },
    { key: 'video', title: 'Vídeo karaokê (plano premium)', text: 'No plano completo, sua música vira um vídeo com a letra aparecendo na tela — perfeito pra postar e marcar a pessoa.', span: 'wide', media: 'video' },
  ]

  /* ── Planos ── */
  const plans = [
    { name: 'Música personalizada', planKey: 'musica', badge: null, featured: false, price: '19,90', desc: 'Sua história transformada em música, só sua 🎵', delivery: 'Pronta rapidinho', tagline: 'A canção perfeita pra emocionar quem você ama.', items: ['Música completa e exclusiva, feita da sua história', 'Voz e estilo à sua escolha', 'Arquivo em MP3 pra guardar pra sempre', 'Prévia e versão completa aqui no chat'] },
    { name: 'Música + Vídeo Personalizado', planKey: 'completa', badge: 'MAIS COMPLETO', featured: true, price: '29,90', desc: 'A música + vídeo personalizado com a letra pra cantar no estilo karaokê 🎤', delivery: 'Pronta rapidinho', tagline: 'A música + um vídeo karaokê personalizado pra cantar e compartilhar.', items: ['Tudo do plano Música personalizada', '🎬 Vídeo personalizado no estilo karaokê (letra pra cantar junto) 🎤', 'Perfeito pra emocionar e postar nas redes', 'Prioridade na produção'] },
  ]

  /* ── FAQ ── */
  const faqs = [
    { q: 'Como funciona a Lembrança Cantada?', a: 'Você conta a história, escolhe estilo e voz, e o nosso estúdio transforma tudo numa música personalizada. Em minutos você recebe uma prévia gratuita pra ouvir antes de decidir.' },
    { q: 'Quanto tempo demora pra ficar pronta?', a: 'Na maioria das vezes a prévia fica pronta em poucos minutos. A versão completa é liberada logo após a confirmação do pagamento.' },
    { q: 'Consigo ouvir antes de pagar?', a: 'Sim! Você recebe uma prévia gratuita da música. Só paga se gostar — sem compromisso nenhum.' },
    { q: 'Posso escolher a voz e o estilo?', a: 'Com certeza. Você escolhe o gênero musical, o clima e se a voz é masculina ou feminina. Tudo do seu jeito.' },
    { q: 'Como eu recebo a música?', a: 'A prévia e a versão completa ficam disponíveis aqui mesmo no site pra você baixar em MP3. Se escolher o plano com vídeo karaokê (R$ 29,90), o vídeo também aparece pronto pra baixar.' },
    { q: 'E se eu quiser alterar algo na música?', a: 'Dá pra ajustar! Alterações na música têm um pequeno custo adicional e a gente refaz pra ficar do jeitinho que você quer.' },
    { q: 'Como faço o pagamento?', a: 'O pagamento é por PIX, rápido e seguro. Depois é só enviar o comprovante no WhatsApp que a gente libera tudo na hora.' },
    { q: 'Posso mandar a história por áudio?', a: 'Pode sim! É só gravar um áudio contando a história que a gente transcreve e usa tudo na composição da música.' },
  ]

  const exploreLinks = ['Música para namorada', 'Música para namorado', 'Música para mãe', 'Música para pai', 'Música de aniversário', 'Música de casamento', 'Música para amiga', 'Música para filho(a)']

  // links com {label, href, external} — external abre em nova aba
  const footerCols = [
    { title: 'Produto', links: [
      { label: 'Como funciona', href: '#how' },
      { label: 'Exemplos',      href: '#examples' },
      { label: 'Preços',        href: '#pricing' },
      { label: 'Perguntas frequentes', href: '#faq' },
    ]},
    { title: 'Ocasiões', links: [
      { label: 'Aniversário', href: '#examples' },
      { label: 'Dia das Mães', href: '#examples' },
      { label: 'Casamento',   href: '#examples' },
      { label: 'Namoro',      href: '#examples' },
    ]},
    { title: 'Empresa', links: [
      { label: 'Sobre nós', href: '#how' },
      { label: 'Contato',   href: `https://wa.me/${'5511920188319'}`, external: true },
      { label: 'Instagram', href: 'https://instagram.com/historiascantadasbr', external: true },
      { label: 'WhatsApp',  href: `https://wa.me/${'5511920188319'}`, external: true },
    ]},
    { title: 'Legal', links: [
      { label: 'Termos de uso', href: '/termos.html', external: true },
      { label: 'Privacidade',   href: '/privacidade.html', external: true },
    ]},
  ]

  /* ── RENDER FORM STEPS ── */
  const renderFormStep = () => {
    switch (step) {
      /* ── STEP 1: Para quem + história ── */
      case 1:
        return (
          <>
            <div className="form-group">
              <label className="form-label">Para quem é a música? <span>(obrigatório)</span></label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input className="input-text has-icon" value={formData.honoreeName} onChange={e => updateForm('honoreeName', e.target.value)} placeholder="Ex: Maria, Antonio, Robertin..." />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Relacionamento</label>
              <div className="pill-group">
                {RELATIONSHIPS.map(p => <button key={p} type="button" className={`pill${formData.relationship === p ? ' selected' : ''}`} onClick={() => updateForm('relationship', formData.relationship === p ? '' : p)}>{p}</button>)}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Ocasião <span>(opcional)</span></label>
              <input className="input-text" value={formData.occasion} onChange={e => updateForm('occasion', e.target.value)} placeholder="Ex: Aniversário de namoro, Dia das Mães..." />
            </div>
            <div className="form-group">
              <label className="form-label">Conte a história <span>(quanto mais detalhes, melhor!)</span></label>
              <textarea
                className={`input-textarea${isRecording ? ' recording-active' : ''}`}
                value={displayStory}
                onChange={e => { if (!isRecording) updateForm('story', e.target.value) }}
                placeholder="Conte momentos marcantes, apelidos, brincadeiras... Quanto mais detalhes, mais especial a música fica!"
                readOnly={isRecording}
              />

              {/* Botão de voz */}
              <button
                type="button"
                onClick={toggleVoiceInput}
                className={`voice-btn${isRecording ? ' voice-btn-recording' : ''}`}
              >
                {isRecording ? (
                  <>
                    <div className="voice-waves">
                      <span className="wave-bar"></span>
                      <span className="wave-bar"></span>
                      <span className="wave-bar"></span>
                      <span className="wave-bar"></span>
                      <span className="wave-bar"></span>
                    </div>
                    <span>Ouvindo... toque para parar</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                    <span>Falar sua história</span>
                  </>
                )}
              </button>

              {isRecording && interimText && (
                <div className="voice-live-indicator">
                  <span className="voice-live-dot"></span>
                  Ouvindo sua voz...
                </div>
              )}
            </div>
          </>
        )

      /* ── STEP 2: Estilo + clima + voz ── */
      case 2:
        return (
          <>
            <div className="form-group">
              <label className="form-label">Estilo Musical <span>(obrigatório)</span></label>
              <div className="genre-grid">
                {GENRES.map(g => (
                  <button key={g.label} type="button" className={`genre-card${formData.genre === g.label ? ' selected' : ''}`} onClick={() => updateForm('genre', formData.genre === g.label ? '' : g.label)}>
                    <span className="genre-icon">{g.icon}</span>
                    <span className="genre-label">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Clima da Música</label>
              <div className="pill-group">
                {MOODS.map(m => <button key={m} type="button" className={`pill${formData.mood === m ? ' selected' : ''}`} onClick={() => updateForm('mood', formData.mood === m ? '' : m)}>{m}</button>)}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Voz de Preferência</label>
              <p className="form-hint">Escolha a voz que você prefere para cantar a música.</p>
              <div className="voice-grid">
                {VOICES.map(v => (
                  <button key={v.label} type="button" className={`voice-card${formData.voice === v.label ? ' selected' : ''}`} onClick={() => updateForm('voice', formData.voice === v.label ? '' : v.label)}>
                    <span className="voice-icon">{v.icon}</span>
                    <span className="voice-label">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )

      /* ── STEP 3: Dados pessoais ── */
      case 3:
        return (
          <>
            <div className="form-step-title">Quase lá! 🎉</div>
            <p className="form-step-subtitle">Informe seus dados para receber a música pronta.</p>
            <div className="form-group">
              <label className="form-label">Seu nome e sobrenome <span>(obrigatório)</span></label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input className="input-text has-icon" value={formData.clientName} onChange={e => updateForm('clientName', e.target.value)} placeholder="Ex: Maria Silva" required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Seu WhatsApp <span>(obrigatório)</span></label>
              <div className="input-wrapper">
                <span className="input-icon">📱</span>
                <input className="input-text has-icon" value={formData.phone} onChange={e => updateForm('phone', phoneMask(e.target.value))} type="tel" placeholder="11 9 9999-9999" maxLength={16} required />
              </div>
            </div>

            {/* Summary */}
            <div className="form-summary">
              <div className="form-summary-title">📋 Resumo do pedido</div>
              <div className="form-summary-row"><strong>Para:</strong> {formData.honoreeName} {formData.relationship && `(${formData.relationship})`}</div>
              {formData.occasion && <div className="form-summary-row"><strong>Ocasião:</strong> {formData.occasion}</div>}
              <div className="form-summary-row"><strong>Estilo:</strong> {formData.genre} {formData.mood && `• ${formData.mood}`}</div>
              {formData.voice && <div className="form-summary-row"><strong>Voz:</strong> {formData.voice}</div>}
            </div>
          </>
        )
      default: return null
    }
  }

  return (
    <>
      {/* ANNOUNCEMENT BAR */}
      {view === 'landing' && (
        <div className="topbar topbar-offer">
          <span className="topbar-proof"><IconGift s={14} /> +5.000 músicas já emocionaram</span>
          <span className="topbar-mid">
            <IconZap s={14} /> <span className="topbar-label">Oferta de lançamento:</span> <strong>R$&nbsp;19,90</strong>
            <Countdown end={offerEnd} compact />
          </span>
          <button className="topbar-cta" onClick={scrollToForm}>Criar <span className="topbar-label">minha </span>música <IconArrowRight s={14} /></button>
        </div>
      )}

      {/* Banner cliente recorrente — só aparece se a gente já tem o cliente
          salvo no localStorage E ele tem ≥1 música real (prévia ou paga).
          Aparece em qualquer view exceto durante o quiz (pra não distrair). */}
      {showCustomerBanner && customer && customerOrders.length > 0 && view !== 'quiz' && view !== 'progress' && (
        <div className="returning-banner" role="status">
          <div className="returning-banner-inner">
            <span className="returning-banner-greet">
              <span aria-hidden="true">💜</span>
              <span>Oi{customer.name ? `, ${customer.name.split(' ')[0]}` : ''}! Você já tem <strong>{customerOrders.length} música{customerOrders.length > 1 ? 's' : ''}</strong> com a gente.</span>
            </span>
            <div className="returning-banner-actions">
              <button type="button" className="returning-banner-btn returning-banner-btn--primary"
                onClick={() => { setView('my-orders'); window.scrollTo({ top: 0 }) }}>
                Ver minhas músicas →
              </button>
              <button type="button" className="returning-banner-dismiss" aria-label="Dispensar"
                onClick={() => setShowCustomerBanner(false)}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header ref={headerRef} className="header">
        <div className="header-inner">
          <a href="#" className="header-logo"><IconMusic s={20} /> Histórias<span className="accent">Cantadas</span></a>
          {view === 'landing' && (
            <nav className="header-nav">
              <a href="#como-funciona">Como Funciona</a>
              <a href="#testimonials">Avaliações</a>
              <button type="button" className="header-nav-link" onClick={openMyOrders}>
                Minhas músicas
              </button>
            </nav>
          )}
          <div className="header-right">
            {/* "Minhas músicas" em MOBILE: agora vira texto (era so um icone
                de nota musical que ficava ambiguo). header-nav some no mobile
                via @media, entao precisamos desse botao compacto pra cliente
                recorrente alcancar o lookup das musicas dele. */}
            {view === 'landing' && (
              <button type="button" className="header-my-orders" onClick={openMyOrders}>
                Minhas Músicas
              </button>
            )}
            {/* Theme toggle REMOVIDO (jun/2026) — decisao do dono. Tema
                segue o sistema (auto via prefers-color-scheme). */}
            {view === 'landing' && <button className="header-cta" onClick={scrollToForm}>Começar Minha Música</button>}
          </div>
        </div>
      </header>

      {/* ── LANDING ── */}
      {view === 'landing' && (
        <main>
          {/* ═══ HERO ═══ */}
          <section className="hero">
            <img className="hero-bg-photo" src="/assets/hero/casal.jpg" alt="" aria-hidden="true" />
            <div className="hero-blur" />
            <span className="heart heart-1"><IconHeart s={26} /></span>
            <span className="heart heart-2"><IconHeart s={34} /></span>
            <span className="heart heart-3"><IconHeart s={20} /></span>
            <div className="container hero-grid">
              <div className="hero-copy">
                <span className="hero-eyebrow">
                  <IconStar s={12} /> +12.000 músicas criadas com emoção
                </span>
                <h1 className="hero-title">Transforme sua história em uma <span className="gradient-text">música inesquecível</span></h1>
                <Typewriter phrases={HERO_TYPED_PHRASES} />
                <div className="hero-video-wrap">
                  <video ref={heroVideoRef} className="hero-video" src="/assets/hero/hero-video.mp4#t=0.1" autoPlay muted loop playsInline preload="metadata"
                    onClick={() => { const v = heroVideoRef.current; if (v) { v.muted = !v.muted; if (!v.muted) { v.currentTime = 0; v.play() } } }} />
                </div>
                <div className="hero-cta-group">
                  <button className="btn-primary auto-width" onClick={scrollToForm}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
                    Criar minha prévia grátis
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* VISUAL HERO (desktop only) — substituiu o chat-teaser.
                  Mostra um "song card" mockup + waveform pra reforcar o
                  produto (musica personalizada) sem foto stock aleatoria.
                  Tudo SVG + tokens da marca. Escondido <860px via CSS. */}
              <div className="hero-visual" aria-hidden="true">
                <div className="hero-song-card">
                  <div className="hero-song-cover">
                    <VinylDisc size={88} spinning />
                  </div>
                  <div className="hero-song-meta">
                    <span className="hero-song-eyebrow">Prévia pronta · grátis</span>
                    <strong className="hero-song-title">Para você</strong>
                    <span className="hero-song-sub">Sertanejo · Romântico</span>
                  </div>
                  <div className="hero-song-wave" aria-hidden="true">
                    {Array.from({ length: 28 }, (_, i) => (
                      <span key={i} className="hero-wave-bar" style={{ animationDelay: `${(i % 9) * 70}ms` }} />
                    ))}
                  </div>
                  <div className="hero-song-controls">
                    <button type="button" className="hero-song-play" aria-label="Tocar prévia">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <polygon points="6 3 20 12 6 21 6 3"/>
                      </svg>
                    </button>
                    <span className="hero-song-time">0:00 / 0:45</span>
                  </div>
                </div>

                {/* Floating stats cards ao redor — prova social sutil */}
                <div className="hero-float hero-float--rating">
                  <span className="hero-float-stars" aria-hidden="true">
                    {[0,1,2,3,4].map(i => (
                      <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 9.5 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.5 9 9 12 2"/></svg>
                    ))}
                  </span>
                  <span className="hero-float-text">4,9 · 2k+ avaliações</span>
                </div>
                <div className="hero-float hero-float--delivery">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="hero-float-text">Pronta em minutos</span>
                </div>
              </div>

              {/* CHAT (modal via PORTAL — fora do contexto preso da hero, corrige o "preto") */}
              {chatModal && createPortal(
                <div className="chat-modal-root">
                  <div className="chat-backdrop" onClick={() => setChatModal(false)} />
                  <div className="chat-card as-modal" id="formCard">
                  <div className="chat-header">
                    <button className="chat-back" onClick={() => setChatModal(false)} aria-label="Fechar"><IconArrowLeft s={22} /></button>
                    <div className="chat-avatar">
                      <span className="chat-avatar-fallback"><IconMic s={20} /></span>
                      <img src="/assets/Bia.jpeg" alt="Bia" onError={e => e.currentTarget.classList.add('hide')} />
                      {biaStatus === 'online' && <span className="chat-online-dot" />}
                    </div>
                    <div className="chat-head-info">
                      <div className="chat-name">Bia</div>
                      <div className={`chat-status${botTyping ? ' typing' : ''}`}>{biaStatus}</div>
                    </div>
                    <div className="chat-head-actions">
                      <span aria-hidden="true"><IconVideo s={20} /></span>
                      <span aria-hidden="true"><IconPhone s={18} /></span>
                      <span aria-hidden="true"><IconMore s={20} /></span>
                    </div>
                  </div>

                  <div className="chat-body" ref={chatBodyRef}>
                    <div className="chat-encryption"><IconLock s={12} /> As mensagens são protegidas. Lembrança Cantada.</div>
                    {chatMessages.map((m, i) => {
                      if (m.kind === 'audio') return (
                        <div key={i} className="chat-bubble bia chat-media">
                          <div className="chat-media-top"><span className="chat-media-ic"><IconMusic s={15} /></span>{m.label}</div>
                          <audio controls preload="none" src={m.src} onPlay={() => track('AudioPlay', { label: m.label || 'audio' }, true)} />
                          <span className="chat-meta">{m.t}</span>
                        </div>
                      )
                      if (m.kind === 'video') return (
                        <div key={i} className="chat-bubble bia chat-media">
                          <video className="chat-media-video" controls playsInline preload="metadata" src={`${m.src}#t=0.1`} />
                          <span className="chat-meta">{m.t}</span>
                        </div>
                      )
                      if (m.kind === 'pay') return (
                        <div key={i} className="chat-bubble bia chat-action">
                          <button className="chat-action-btn pay" disabled={payLoading} onClick={() => { try { localStorage.setItem('hc_order_ctx', JSON.stringify({ orderId: m.orderId, honoreeName: chatData.honoreeName, plan: m.plan, planName: m.planName, planPrice: m.planPrice })) } catch (_) {}; startPayment(m.orderId, m.plan) }}>
                            {payLoading ? <span className="spinner" /> : <><IconLock s={15} /> Pagar R$ {m.planPrice} e liberar tudo</>}
                          </button>
                          <span className="chat-meta">{m.t}</span>
                        </div>
                      )
                      if (m.kind === 'retryPay') return (
                        <div key={i} className="chat-bubble bia chat-action">
                          <button className="chat-action-btn" onClick={() => deliverInChat(m.orderId, m.tx, m.slug)}>Tentar validar de novo</button>
                        </div>
                      )
                      if (m.kind === 'download') return (
                        <div key={i} className="chat-bubble bia chat-action">
                          <a className="chat-action-btn dl" href={`${API_URL}/api/download?url=${encodeURIComponent(m.src)}&name=${encodeURIComponent(m.file || 'arquivo')}`} download={m.file} target="_blank" rel="noopener noreferrer"><IconArrowRight s={15} /> {m.label}</a>
                        </div>
                      )
                      if (m.kind === 'photo') return (
                        <div key={i} className="chat-bubble bia chat-action">
                          <label className="chat-action-btn"><IconGift s={15} /> Enviar foto
                            <input type="file" accept="image/*" hidden onChange={e => uploadChatPhoto(m.orderId, e.target.files && e.target.files[0])} />
                          </label>
                        </div>
                      )
                      if (m.kind === 'menu') return (
                        <div key={i} className="chat-bubble bia chat-action">
                          <button className="chat-action-btn dl" onClick={goToMenu}>✨ Criar outra música / consultar</button>
                        </div>
                      )
                      if (m.kind === 'examples') return (
                        <div key={i} className="chat-bubble bia chat-media chat-examples">
                          <div className="chat-media-top"><span className="chat-media-ic"><IconMusic s={15} /></span>Músicas que já fizemos 🎶</div>
                          {WAIT_SONGS.map((sg, k) => (
                            <div key={k} className="chat-example-song">
                              <div className="chat-example-info"><strong>{sg.title}</strong><span>{sg.meta}</span></div>
                              <audio controls preload="none" src={sg.src} onPlay={() => track('WaitSongPlay', { song: sg.title }, true)} />
                            </div>
                          ))}
                          <span className="chat-meta">{m.t}</span>
                        </div>
                      )
                      if (m.kind === 'exampleVideo') return (
                        <div key={i} className="chat-bubble bia chat-action chat-video-teaser">
                          <button className="chat-video-btn" onClick={() => { track('WaitVideoOpen', null, true); setVideoModal(WAIT_VIDEO) }}>
                            <img src={WAIT_VIDEO.poster} alt="" />
                            <span className="chat-video-play"><IconPlay s={22} /></span>
                            <span className="chat-video-label">🎬 Ver um vídeo de exemplo</span>
                          </button>
                          <span className="chat-meta">{m.t}</span>
                        </div>
                      )
                      return (
                        <div key={i} className={`chat-bubble ${m.from}`}>
                          <span className="chat-bubble-text">{formatBia(m.text)}</span>
                          <span className="chat-meta">{m.t}{m.from === 'user' && <IconCheckCheck s={15} />}</span>
                        </div>
                      )
                    })}
                    {botTyping && (<div className="chat-bubble bia typing"><span /><span /><span /></div>)}
                  </div>

                  <div className="chat-input-area">
                    {chatView === 'menu' && chatStep === -1 && !botTyping && (
                      <div className="chat-options" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                        {savedOrder && savedOrder.id && (
                          <button className="chat-opt" onClick={resumeOrder}>📦 Continuar — {savedOrder.honoreeName || 'meu pedido'}</button>
                        )}
                        <button className="chat-opt" onClick={beginCreate}>✨ Criar uma música</button>
                        <button className="chat-opt" onClick={beginLookup}>🔎 Consultar meu pedido</button>
                      </div>
                    )}
                    {chatView === 'lookup' && !botTyping && (
                      <form className="chat-textbar" onSubmit={e => { e.preventDefault(); if (chatInput.trim()) submitLookup(chatInput.trim()) }}>
                        <input className="chat-text" value={chatInput} onChange={e => setChatInput(phoneMask(e.target.value))} placeholder="(DDD) número" inputMode="numeric" />
                        <button type="submit" className="chat-send" disabled={!chatInput.trim()} aria-label="Consultar"><IconSend s={19} /></button>
                      </form>
                    )}
                    {chatStep >= 0 && chatStep < chatFlow.length && chatFlow[chatStep].type === 'options' && !otherFor && !botTyping && (
                      <div className={`chat-options${chatFlow[chatStep].grid ? ' grid' : ''}`}>
                        {chatFlow[chatStep].options.map(opt => {
                          const g = chatFlow[chatStep].key === 'genre' ? GENRES.find(x => x.label === opt) : null
                          return <button key={opt} className="chat-opt" onClick={() => answerChat(opt, opt)}>{g ? g.icon + ' ' : ''}{opt}</button>
                        })}
                      </div>
                    )}
                    {otherFor && !botTyping && (
                      <form className="chat-textbar" onSubmit={e => { e.preventDefault(); if (chatInput.trim()) answerChat(chatInput.trim(), chatInput.trim()) }}>
                        <input className="chat-text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ex: madrinha, avó, cunhado..." autoFocus />
                        <button type="submit" className="chat-send" disabled={!chatInput.trim()} aria-label="Enviar"><IconSend s={19} /></button>
                      </form>
                    )}
                    {chatStep >= 0 && chatStep < chatFlow.length && (chatFlow[chatStep].type === 'text' || chatFlow[chatStep].type === 'phone') && !botTyping && (
                      recording ? (
                        <div className="chat-recbar">
                          <button className="chat-rec-cancel" onClick={cancelRecording} aria-label="Cancelar gravação"><IconArrowLeft s={20} /></button>
                          <span className="chat-rec-dot" />
                          <span className="chat-rec-time">{String(Math.floor(recSecs / 60)).padStart(2, '0')}:{String(recSecs % 60).padStart(2, '0')}</span>
                          <span className="chat-rec-hint">Gravando… toque pra enviar</span>
                          <button className="chat-send" onClick={stopRecording} aria-label="Enviar áudio"><IconSend s={19} /></button>
                        </div>
                      ) : transcribing ? (
                        <div className="chat-recbar"><span className="spinner" /><span className="chat-rec-hint">Transcrevendo seu áudio…</span></div>
                      ) : (
                        <>
                          {chatFlow[chatStep].optional && (
                            <div className="chat-options" style={{ marginBottom: 6 }}>
                              <button type="button" className="chat-opt" onClick={() => answerChat('pular', 'Pular ➡️')}>Pular ➡️</button>
                            </div>
                          )}
                          <form className="chat-textbar" onSubmit={e => { e.preventDefault(); if (chatInput.trim()) answerChat(chatInput.trim(), chatInput.trim()) }}>
                            <input className="chat-text" value={chatInput} onChange={e => setChatInput(chatFlow[chatStep].type === 'phone' ? phoneMask(e.target.value) : e.target.value)} placeholder={chatFlow[chatStep].placeholder} />
                            {(chatFlow[chatStep].audio && !chatInput.trim())
                              ? <button type="button" className="chat-send chat-mic" onClick={startRecording} aria-label="Gravar áudio"><IconMic s={20} /></button>
                              : <button type="submit" className="chat-send" disabled={!chatInput.trim()} aria-label="Enviar"><IconSend s={19} /></button>}
                          </form>
                        </>
                      )
                    )}
                    {chatStep === chatFlow.length && !botTyping && (
                      <div className="chat-plans">
                        {plans.map(p => (
                          <button key={p.planKey} className={`chat-plan${p.featured ? ' featured' : ''}`} onClick={() => pickPlan(p)}>
                            {p.badge && <span className="chat-plan-badge">{p.badge}</span>}
                            <span className="chat-plan-info">
                              <span className="chat-plan-name">{p.name}</span>
                              {p.desc && <span className="chat-plan-desc">{p.desc}</span>}
                            </span>
                            <span className="chat-plan-price">R$ {p.price}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {chatStep === chatFlow.length + 1 && !botTyping && (
                      <button className="btn-primary" onClick={submitChat} disabled={loading}>
                        {loading ? <span className="spinner" /> : <><IconMusic s={17} /> Criar minha música agora</>}
                      </button>
                    )}
                  </div>
                  </div>
                </div>,
                document.body
              )}
              {quizModal && createPortal(
                <div className="quiz-modal-root">
                  {/* Backdrop decorativo — não fecha (só o X fecha). */}
                  <div className="quiz-backdrop" aria-hidden="true" />
                  <div className="quiz-modal-card">
                    <button className="quiz-close" onClick={() => setQuizModal(false)} aria-label="Fechar">✕</button>
                    <Quiz
                      onComplete={handleQuizComplete}
                      onChat={openChatFromQuiz}
                      phoneMask={phoneMask}
                      apiTranscribe={apiTranscribe}
                      apiCreateOrder={apiCreateOrder}
                      apiOrderUpdate={apiOrderUpdate}
                      track={track}
                      loading={loading}
                    />
                  </div>
                </div>,
                document.body
              )}
              {videoModal && createPortal(
                <div className="video-modal-root" onClick={() => setVideoModal(null)}>
                  <div className="video-modal-card" onClick={e => e.stopPropagation()}>
                    <button className="video-modal-close" onClick={() => setVideoModal(null)} aria-label="Fechar">✕</button>
                    <video src={videoModal.src} poster={videoModal.poster} controls autoPlay playsInline className="video-modal-video" />
                  </div>
                </div>,
                document.body
              )}
            </div>
          </section>

          {/* ═══ COMO FUNCIONA — 4 passos ═══ */}
          <section className="howitworks" id="como-funciona">
            <div className="container">
              <div className="section-header">
                <Pill tone="accent">COMO FUNCIONA</Pill>
                <h2 className="section-title">Crie uma música inesquecível em <span className="accent-text">4 passos simples</span></h2>
                <p className="section-subtitle">Do jeito mais fácil possível: você conta, a gente compõe e emociona quem você ama.</p>
              </div>
              <div className="how-grid">
                {howSteps.map(s => (
                  <div key={s.n} className="how-card">
                    <div className="how-num">{s.n}</div>
                    <div className="how-img"><img src={`/assets/passos/passo-${s.n}.jpg`} alt={s.title} loading="lazy" /></div>
                    <div className="how-title">{s.title}</div>
                    <div className="how-text">{s.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══ PRÉVIA / OUÇA ANTES (carrossel) ═══ */}
          <section className="preview-showcase" id="examples">
            <div className="container preview-grid">
              <div className="preview-visual">
                <button className="carousel-arrow left" onClick={prevPreview} aria-label="Anterior">‹</button>
                {examples[previewIdx].kind === 'video' ? (
                  <video key={examples[previewIdx].src} ref={previewVideoRef} className="preview-video" src={examples[previewIdx].src} poster={examples[previewIdx].poster} controls playsInline preload="none"
                    onPlay={() => setPreviewPlaying(true)} onPause={() => setPreviewPlaying(false)} onEnded={() => setPreviewPlaying(false)} />
                ) : (
                  <button className="song-cover" onClick={togglePreviewPlay} aria-label={previewPlaying ? 'Pausar' : 'Tocar'}>
                    <div className="song-cover-art"><IconMusic s={38} /></div>
                    <div className="song-cover-title">{examples[previewIdx].title}</div>
                    <div className="song-cover-meta">{examples[previewIdx].meta}</div>
                    <Waveform />
                    <span className={`song-play${previewPlaying ? ' playing' : ''}`}>{previewPlaying ? <IconPause s={24} /> : <IconPlay s={24} />}</span>
                  </button>
                )}
                <button className="carousel-arrow right" onClick={nextPreview} aria-label="Próximo">›</button>
                <audio ref={previewAudioRef} src={examples[previewIdx].kind === 'audio' ? examples[previewIdx].src : undefined} preload="none"
                  onPlay={() => setPreviewPlaying(true)} onPause={() => setPreviewPlaying(false)} onEnded={() => setPreviewPlaying(false)} />
              </div>
              <div className="preview-copy">
                <Pill tone="accent">PRÉVIA GRATUITA</Pill>
                <h2 className="section-title">Ouça trechos reais</h2>
                <p className="section-subtitle" style={{ margin: '0 0 20px' }}>Músicas de clientes de verdade. Aperte o play e veja como fica emocionante — a sua vai ser assim, do seu jeito.</p>
                <button className="example-mini" onClick={togglePreviewPlay}>
                  <span className="play-btn">{previewPlaying ? <IconPause s={16} /> : <IconPlay s={15} />}</span>
                  <div className="player-info">
                    <div className="player-title">{examples[previewIdx].title}</div>
                    <div className="player-meta">{examples[previewIdx].meta}</div>
                  </div>
                </button>
                <div className="carousel-dots">
                  {examples.map((_, i) => (
                    <button key={i} className={`dot${i === previewIdx ? ' active' : ''}`} onClick={() => selectPreview(i)} aria-label={`Exemplo ${i + 1}`} />
                  ))}
                </div>
                <button className="btn-primary auto-width" onClick={scrollToForm}>Criar a minha agora <IconArrowRight s={17} /></button>
              </div>
            </div>
          </section>

          {/* ═══ RECURSOS — bento grid ═══ */}
          <section className="features-bento">
            <div className="container">
              <div className="section-header">
                <Pill tone="accent">RECURSOS</Pill>
                <h2 className="section-title">Uma música <span className="accent-text">memorável</span> e só sua</h2>
                <p className="section-subtitle">Tudo pensado pra você emocionar de verdade quem você ama.</p>
              </div>
              <div className="bento-grid">
                {featureBento.map(f => (
                  <div key={f.key} className={`bento-card bento-${f.span}`}>
                    <div className="bento-text-wrap">
                      <div className="bento-title">{f.title}</div>
                      <div className="bento-text">{f.text}</div>
                    </div>
                    {f.media === 'video' && <video className="bento-video" src="/assets/previa/previa-web.mp4" poster="/assets/previa/previa-poster.jpg" controls playsInline preload="none" />}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══ BANNER DEMO ═══ */}
          <section className="demo-banner">
            <div className="container demo-inner">
              <img className="demo-photo" src="/assets/hero/casal.jpg" alt="" aria-hidden="true" />
              <div className="demo-copy">
                <h2 className="demo-title">Ouça exemplos de verdade</h2>
                <p className="demo-sub">Veja (e ouça) como uma música personalizada da Lembrança Cantada emociona.</p>
                <a href="#examples" className="btn-light"><IconPlay s={15} /> Ouvir exemplos</a>
              </div>
            </div>
          </section>

          {/* ═══ DEPOIMENTOS ═══ */}
          <section className="testimonials" id="testimonials">
            <div className="container">
              <div className="section-header">
                <Pill tone="accent">DEPOIMENTOS</Pill>
                <h2 className="section-title">O que nossos <span className="accent-text">clientes</span> dizem</h2>
                <p className="section-subtitle">Histórias reais de quem transformou sentimentos em música.</p>
              </div>
              <div className="testimonials-grid">
                {testimonials.map(t => (
                  <div key={t.name} className="testimonial-card">
                    <div className="testimonial-stars">★★★★★</div>
                    <div className="testimonial-quote">{t.quote}</div>
                    <div className="testimonial-author">
                      <div className="testimonial-avatar">{t.photo ? <img src={t.photo} alt={t.name} loading="lazy" /> : t.initials}</div>
                      <div>
                        <div className="testimonial-name">{t.name}</div>
                        <div className="testimonial-location">{t.loc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══ OFERTA / ANCORAGEM DE VALOR ═══ */}
          <section className="offer-section">
            <div className="container offer-grid">
              <div className="offer-card">
                <Pill tone="accent">COMPARA COMIGO</Pill>
                <div className="compare-rows">
                  <div className="compare-row">
                    <div className="compare-ic" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22V12"/><path d="M12 12c0-3 2-5 5-5s5 2 5 5-2 5-5 5h-5"/><path d="M12 12c0-3-2-5-5-5s-5 2-5 5 2 5 5 5h5"/><circle cx="12" cy="22" r="0.5"/>
                      </svg>
                    </div>
                    <div className="compare-text">
                      <div className="compare-name">Buquê + chocolate</div>
                      <div className="compare-sub">dura 3 dias</div>
                    </div>
                    <div className="compare-price old">R$ 180</div>
                  </div>
                  <div className="compare-row">
                    <div className="compare-ic" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 11h18"/><path d="M5 11V9a7 7 0 0 1 14 0v2"/><path d="M3 11v2a7 7 0 0 0 14 0v-2"/><path d="M12 18v3"/><path d="M8 21h8"/>
                      </svg>
                    </div>
                    <div className="compare-text">
                      <div className="compare-name">Jantar especial</div>
                      <div className="compare-sub">acaba em 2h</div>
                    </div>
                    <div className="compare-price old">R$ 250</div>
                  </div>
                  <div className="compare-row win">
                    <span className="compare-badge"><Badge tone="accent">A NOSSA</Badge></span>
                    <div className="compare-ic compare-ic-win" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                      </svg>
                    </div>
                    <div className="compare-text">
                      <div className="compare-name">Música personalizada</div>
                      <div className="compare-sub">dura pra sempre</div>
                    </div>
                    <div className="compare-price">a partir de <strong>R$ 19,90</strong></div>
                  </div>
                </div>
                <p className="offer-anchor-note">O presente que custa menos e é o único que <strong>dura pra vida toda</strong>.</p>
              </div>

              <div className="offer-cta-col">
                <div className="offer-eyebrow">por apenas</div>
                <div className="offer-price"><span className="offer-cur">R$</span><span className="offer-int">19</span><span className="offer-cents">,90</span></div>
                <div className="offer-parcel">à vista no Pix</div>
                <Countdown end={offerEnd} />
                <button className="btn-primary offer-cta" onClick={scrollToForm}><IconGift s={18} /> Criar a minha música agora <IconArrowRight s={17} /></button>
                <div className="offer-note"><IconLock s={13} /> Prévia grátis · você ouve aqui no chat · só paga se gostar</div>
              </div>
            </div>
          </section>

          {/* ═══ PLANOS ═══ */}
          <section className="plans" id="pricing">
            <div className="container">
              <div className="section-header">
                <Pill tone="accent">PLANOS E PREÇOS</Pill>
                <h2 className="section-title">Escolha o plano <span className="accent-text">ideal</span> pra você</h2>
                <p className="section-subtitle">Pagamento único, sem mensalidade. Crie a sua música agora e surpreenda quem você ama.</p>
              </div>
              <div className="plans-grid">
                {plans.map(p => (
                  <div key={p.name} className={`plan-card${p.featured ? ' featured' : ''}`}>
                    {p.badge && <div className="plan-badge">{p.badge}</div>}
                    <div className="plan-name">{p.name}</div>
                    <div className="plan-tagline">{p.tagline}</div>
                    <div className="plan-price"><span className="plan-currency">R$</span>{p.price}</div>
                    <div className="plan-delivery"><IconZap s={14} /> {p.delivery}</div>
                    <div className="plan-items">
                      {p.items.map(it => <div key={it} className="plan-item"><span className="check">✓</span> {it}</div>)}
                    </div>
                    <button className="btn-primary" onClick={scrollToForm}>Criar minha música →</button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══ FAQ ═══ */}
          <section className="faq" id="faq">
            <div className="container faq-grid">
              <div className="faq-aside">
                <Pill tone="accent">PERGUNTAS FREQUENTES</Pill>
                <h2 className="section-title" style={{ textAlign: 'left' }}>Tire suas <span className="accent-text">dúvidas</span></h2>
                <p className="faq-aside-text">Não encontrou sua pergunta? Fala com a gente, respondemos rapidinho. 💜</p>
                <a href={`https://wa.me/${BIA_PHONE}`} target="_blank" rel="noopener noreferrer" className="faq-contact">
                  <span className="faq-contact-ic"><WhatsAppIcon /></span>
                  <div><div className="faq-contact-t">WhatsApp</div><div className="faq-contact-s">Resposta na hora</div></div>
                </a>
                <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="faq-contact">
                  <span className="faq-contact-ic"><InstaIcon /></span>
                  <div><div className="faq-contact-t">Instagram</div><div className="faq-contact-s">@historiascantadasbr</div></div>
                </a>
                <button className="btn-primary" onClick={scrollToForm}>Criar minha música →</button>
              </div>
              <div className="faq-list">
                {/* Accordion do DS (src/components/ui/Accordion) — substitui o
                    custom +/− carret. Open/close interno, animacao + tokens
                    da marca consistentes com o resto do app. */}
                <Accordion items={faqs} />
              </div>
            </div>
          </section>

          {/* ═══ EXPLORE MAIS ═══ */}
          <section className="explore">
            <div className="container">
              <div className="explore-title">Explore mais ideias de música</div>
              <div className="explore-links">
                {exploreLinks.map(l => <button key={l} className="explore-link" onClick={scrollToForm}>{l}</button>)}
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ── PROGRESS · tela vendedora com letra nascendo + carrossel ── */}
      {view === 'progress' && (
        <div className="progress-page">
          <ProgressView
            progress={progress}
            statusMsg={statusMsg}
            formData={formData}
            exampleSongs={WAIT_SONGS}
          />

          {/* ── Banner Meta-safe: cliente precisa contactar Bia primeiro ── */}
          {showWhatsAppBanner && formData.phone && currentOrderId && !clientContacted && (
            <div style={{
              marginTop: '32px',
              padding: '24px',
              background: 'linear-gradient(135deg, #1f2937 0%, #4c1d95 100%)',
              border: '2px solid #a78bfa',
              borderRadius: '16px',
              maxWidth: '500px',
              marginLeft: 'auto',
              marginRight: 'auto',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(167, 139, 250, 0.3)',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>💜</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '12px' }}>
                Falta só 1 passo!
              </div>
              <div style={{ fontSize: '15px', color: '#e9d5ff', marginBottom: '20px', lineHeight: '1.5' }}>
                Pra eu te enviar a prévia <strong>segura no WhatsApp</strong>,
                manda essa mensagem rapidinha pra gente 👇
              </div>
              <a
                href={`https://wa.me/${BIA_PHONE}?text=${encodeURIComponent(`Oi! Pedido #${currentOrderId.slice(0,8)} - To aguardando a previa da minha musica`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  background: '#25d366',
                  color: '#fff',
                  fontSize: '17px',
                  fontWeight: 'bold',
                  padding: '14px 32px',
                  borderRadius: '50px',
                  textDecoration: 'none',
                  boxShadow: '0 4px 16px rgba(37, 211, 102, 0.4)',
                  transition: 'transform 0.2s',
                }}
                onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
              >
                📱 Enviar mensagem no WhatsApp
              </a>
              <div style={{ fontSize: '12px', color: '#c4b5fd', marginTop: '14px', fontStyle: 'italic' }}>
                Clica → WhatsApp abre com a mensagem pronta → você só aperta enviar ✨
              </div>
            </div>
          )}

          {/* ── Confirmação que recebemos a mensagem ── */}
          {clientContacted && (
            <div style={{
              marginTop: '32px',
              padding: '24px',
              background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
              border: '2px solid #34d399',
              borderRadius: '16px',
              maxWidth: '500px',
              marginLeft: 'auto',
              marginRight: 'auto',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(52, 211, 153, 0.3)',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>
                Recebi sua mensagem!
              </div>
              <div style={{ fontSize: '15px', color: '#d1fae5', lineHeight: '1.5' }}>
                Vou te enviar a prévia no WhatsApp <strong>{formData.phone}</strong> assim que estiver pronta 🎵
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RESULT · tela vendedora da prévia + música completa bloqueada ── */}
      {view === 'result' && resultData && (
        <div className="result-page">
          <PreviewResultView
            resultData={resultData}
            payLoading={payLoading}
            paymentSeen={paymentSeen}
            onSendProof={openProofUpload}
            onBuy={(orderId) => startPayment(orderId, 'musica')}
            onWhatsApp={() => {
              const text = resultData.orderId
                ? `Oi! Pedido #${String(resultData.orderId).slice(0,8)} - dúvida sobre a minha música`
                : 'Oi! Quero falar com a Bia'
              window.open(`https://wa.me/${BIA_PHONE}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
            }}
            onNew={resetToLanding}
          />
          <div style={{ display: 'none' }}>
            {/* placeholder pra manter compat com qualquer query ao DOM antigo */}
          </div>
        </div>
      )}

      {/* ── PIX MODAL · LIFTED PRA ROOT pra funcionar em qualquer view ─
          Antes vivia dentro do bloco view==='result', entao o botao
          "Finalizar pagamento" do my-orders chamava setPixModal mas o
          componente nunca renderizava (view !== 'result'). Agora fica
          aqui no root, acessivel de any view. */}
      <PixPaymentModal
        open={!!pixModal}
        onClose={closePixModal}
        planKey={pixModal?.plan || 'musica'}
        orderId={pixModal?.orderId}
        honoreeName={pixModal?.honoreeName}
        customerName={pixModal?.customerName}
        customerPhone={pixModal?.customerPhone}
        startAt={pixModal?.startAt || 'plan'}
        onPaid={async (oid) => {
          // backend já marcou paid_at — busca os links atualizados e libera a UI.
          // Dispara Purchase no Meta Pixel + Google Analytics nesse mesmo gancho
          // (cobre tanto auto-aprovação por IA quanto aprovação manual via polling).
          try { trackPurchase() } catch (_) {}
          try {
            const row = await apiOrderStatus(oid)
            if (row) {
              // full_audio_urls vem como array — a sunoapi.org sempre gera 2
              // versões. A primeira fica como original_url (música principal),
              // a 2ª aparece como BRINDE no card desbloqueado.
              const fau = Array.isArray(row.full_audio_urls) ? row.full_audio_urls.filter(Boolean) : []
              setResultData(prev => ({ ...(prev || {}),
                title: prev?.title || `Para ${row.honoree_name || 'você'}`,
                honoreeName: prev?.honoreeName || row.honoree_name,
                orderId: prev?.orderId || oid,
                unlocked: true,
                original_url: row.original_audio_url || fau[0] || prev?.original_url,
                preview_url: row.preview_audio_url || prev?.preview_url,
                bonus_url: fau.find(u => u && u !== (row.original_audio_url || fau[0])) || null,
                video_url: row.video_upsell_url || row.video_brinde_url || prev?.video_url,
              }))
              // Atualiza tambem o customerOrders pra refletir status pago no my-orders
              setCustomerOrders(prev => (Array.isArray(prev) ? prev : []).map(o =>
                o.id === oid ? { ...o, paid_at: new Date().toISOString(), original_audio_url: row.original_audio_url, video_brinde_url: row.video_brinde_url, full_audio_urls: row.full_audio_urls } : o
              ))
              // Persiste o cliente pra próxima visita (reconhecimento recorrente)
              if (row.phone || row.customer_name) {
                saveCustomer({ phone: row.phone, name: row.customer_name })
                setCustomer(loadCustomer())
              }
            }
          } catch (_) {}
        }}
      />

      {/* ── RETORNO DO PAGAMENTO (InfinitePay) ── */}
      {payReturn && (
        <div className="pay-overlay">
          <div className="pay-card">
            {payReturn.status === 'verifying' && (
              <>
                <div className="spinner-lg" />
                <div className="pay-title">Validando seu pagamento…</div>
                <div className="pay-sub">Só um instante, tô confirmando com o InfinitePay 💜</div>
              </>
            )}
            {payReturn.status === 'paid' && (
              <>
                <div className="pay-emoji success"><IconCheckCheck s={44} /></div>
                <div className="pay-title">Pagamento confirmado!</div>
                <div className="pay-sub">Sua <strong>música completa</strong> já está liberada — pode ouvir, baixar e mandar pra quem você ama 🎶💜</div>
                <a className="btn-primary" href={WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>💬 Abrir o WhatsApp</a>
                <button className="btn-outline" onClick={() => { setPayReturn(null); resetToLanding() }}>Voltar ao início</button>
              </>
            )}
            {payReturn.status === 'failed' && (
              <>
                <div className="pay-emoji"><IconClock s={44} /></div>
                <div className="pay-title">Ainda confirmando o pagamento…</div>
                <div className="pay-sub">Se você acabou de pagar, pode levar uns segundinhos pra cair. Tenta validar de novo ou fala com a gente 💜</div>
                {payReturn.orderId && payReturn.tx && (
                  <button className="btn-primary" onClick={retryPayVerify}>Tentar validar de novo</button>
                )}
                <a className="btn-outline" href={WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><IconMessage s={16} /> Falar no WhatsApp</a>
                <button className="btn-outline" onClick={() => setPayReturn(null)}>Fechar</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ERROR ── Falha na geração: 2 caminhos amigos:
           (1) Tentar novamente — re-dispara o pipeline com o MESMO pedido
               (POST /api/regenerate?orderId=...). Não perde os dados do form.
           (2) Falar com a Bia — abre WhatsApp com mensagem MUITO detalhada
               (cliente, pedido, homenageado, relação, ocasião, sentimento,
                estilo, mood, voz, história). A Bia gera manualmente.       */}
      {/* ── MY ORDERS · cliente recorrente ouvindo o histórico ── */}
      {view === 'my-orders' && (
        <MyOrdersView
          customer={customer}
          orders={customerOrders}
          onBack={() => setView('landing')}
          onNew={() => { setView('landing'); setTimeout(() => scrollToForm(), 100) }}
          onPayPending={(o) => {
            // Cliente quer pagar prévia pendente — abre modal PIX na tela de
            // ESCOLHA DE PLANO (startAt='plan' = default), pra o cliente
            // decidir entre R$19,90 (musica) ou R$29,90 (musica + video).
            setPixModal({
              orderId: o.id,
              plan: 'musica',  // default selecionado caso ele aperte rapido
              honoreeName: o.honoree_name,
              customerName: customer?.name,
              customerPhone: customer?.phone,
              startAt: 'plan',
            })
          }}
        />
      )}

      {/* Lookup modal: nível ROOT pra ficar acessível em qualquer view (header
          link clica em qualquer lugar). Estado controlado por `showLookup`. */}
      <LookupOrdersModal
        open={showLookup}
        onClose={() => setShowLookup(false)}
        onFound={(c, orders) => {
          setCustomer(c)
          setCustomerOrders(orders)
          setShowCustomerBanner(true)
          setShowLookup(false)
          setView('my-orders')
          window.scrollTo({ top: 0 })
        }}
      />

      {view === 'error' && (
        <div className="error-page">
          <div className="error-card">
            <div className="error-icon" aria-hidden="true">💜</div>
            <div className="error-title">Tivemos um soluço aqui</div>
            <div className="error-message">
              {errorMsg || 'Deu uma instabilidade na hora de criar — não foi com você, foi com a gente.'}
            </div>
            <div className="error-actions">
              <button type="button" className="btn-primary error-retry-btn"
                onClick={async () => {
                  if (!currentOrderId) { resetToLanding(); return }
                  try {
                    await fetch(`${API_URL}/api/regenerate?orderId=${currentOrderId}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: '{}',
                    })
                    setErrorMsg(''); setView('progress'); setProgress(0)
                  } catch (_) {
                    // se a chamada falhar, ainda vamos pra progress — Inngest
                    // costuma estar OK; o erro foi só de network do client.
                    setErrorMsg(''); setView('progress'); setProgress(0)
                  }
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Tentar de novo
              </button>
              <a className="pix-wa-link error-wa-btn"
                href={`https://wa.me/${BIA_PHONE_E164}?text=${encodeURIComponent([
                  'Oi Bia! 💜',
                  '',
                  'Deu erro na hora de criar minha música. Pode gerar manualmente pra mim?',
                  '',
                  currentOrderId ? `*Pedido:* #${String(currentOrderId).slice(0,8).toUpperCase()}` : '',
                  formData?.clientName ? `*Meu nome:* ${formData.clientName}` : '',
                  formData?.phone ? `*Meu WhatsApp:* ${formData.phone}` : '',
                  '',
                  '*Detalhes da música:*',
                  formData?.honoreeName ? `• Pra: ${formData.honoreeName}` : '',
                  formData?.relationship ? `• Relação: ${formData.relationship}` : '',
                  formData?.occasion ? `• Ocasião: ${formData.occasion}` : '',
                  formData?.feeling ? `• Sentimento: ${formData.feeling}` : '',
                  formData?.genre ? `• Estilo: ${formData.genre}` : '',
                  formData?.mood ? `• Clima: ${formData.mood}` : '',
                  formData?.voice ? `• Voz: ${formData.voice}` : '',
                  '',
                  formData?.story ? `*História que contei:*\n${formData.story}` : '',
                  '',
                  'Obrigado, espero te ouvir aqui! 🙏',
                ].filter(Boolean).join('\n'))}`}
                target="_blank" rel="noopener noreferrer">
                <svg className="pix-wa-link-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.52 3.48A11.84 11.84 0 0 0 12.04 0C5.5 0 .2 5.31.2 11.85c0 2.09.55 4.13 1.6 5.93L0 24l6.39-1.67a11.83 11.83 0 0 0 5.65 1.44h.01c6.54 0 11.84-5.31 11.84-11.85 0-3.17-1.23-6.14-3.47-8.44Zm-8.48 18.22h-.01a9.86 9.86 0 0 1-5.02-1.38l-.36-.21-3.79.99 1.01-3.69-.23-.38a9.83 9.83 0 0 1-1.5-5.18c0-5.43 4.42-9.85 9.86-9.85 2.63 0 5.1 1.03 6.96 2.9a9.79 9.79 0 0 1 2.89 6.96c0 5.44-4.43 9.84-9.81 9.84Zm5.4-7.37c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.64-2.05-.17-.3-.02-.45.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.49 0 1.47 1.08 2.89 1.23 3.09.15.2 2.12 3.24 5.13 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z"/>
                </svg>
                <span>Falar com a Bia no WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── QUEUED (fila — cookie Suno renovando) ── */}
      {view === 'queued' && (
        <div className="error-page">
          <div className="error-card" style={{ borderColor: '#a78bfa' }}>
            <div className="error-icon">🎵</div>
            <div className="error-title" style={{ color: '#a78bfa' }}>
              Sua música tá na fila!
            </div>
            <div className="error-message" style={{ lineHeight: '1.6' }}>
              Recebemos vários pedidos agora e seu pedido entrou na fila prioritária 💜
              <br /><br />
              <strong>Em alguns minutinhos</strong> a gente termina sua música e te avisa!
              {formData.phone && (
                <>
                  <br /><br />
                  📱 Vamos te enviar a prévia no WhatsApp <strong>{formData.phone}</strong> assim que estiver pronta.
                  <br />
                  Pode fechar essa janela tranquilo, sua música tá garantida 🎵
                </>
              )}
              {!formData.phone && (
                <>
                  <br /><br />
                  ⏰ Sua música tá sendo finalizada! Volte aqui em alguns minutinhos pra ouvir a prévia 🎶
                </>
              )}
            </div>
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btn-primary"
                onClick={() => {
                  // Refresh manual — re-checa status do order salvo
                  try {
                    const saved = JSON.parse(localStorage.getItem('hc_pending_order') || '{}')
                    if (saved.orderId) {
                      window.location.href = `/aguardando/${saved.orderId}`
                    } else {
                      resetToLanding()
                    }
                  } catch (_) { resetToLanding() }
                }}
              >
                🔄 Verificar status
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  try { localStorage.removeItem('hc_pending_order') } catch (_) {}
                  resetToLanding()
                }}
                style={{ background: 'transparent', border: '2px solid #a78bfa', color: '#a78bfa' }}
              >
                Voltar pro início
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#" className="header-logo"><IconMusic s={20} /> Histórias<span className="accent">Cantadas</span></a>
              <p className="footer-desc">Transformamos a sua história em uma música personalizada e inesquecível. O presente que emociona de verdade. 💜</p>
              <div className="footer-socials">
                <a href={`https://wa.me/${BIA_PHONE}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><WhatsAppIcon /></a>
                <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><InstaIcon /></a>
              </div>
            </div>
            {footerCols.map(col => (
              <div key={col.title} className="footer-col">
                <div className="footer-col-title">{col.title}</div>
                {col.links.map(l => (
                  <a key={l.label} href={l.href} className="footer-link"
                    {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    {l.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="footer-bottom">
            <div className="footer-text">Feito com <IconHeart s={13} /> por Lembrança Cantada</div>
            <div className="footer-pay"><IconLock s={13} /> Pagamento seguro via PIX</div>
          </div>
        </div>
      </footer>

      {/* STICKY CTA */}
      {view === 'landing' && (
        <button className={`bia-fab${ctaVisible ? ' visible' : ''}`} onClick={scrollToForm} aria-label="Falar com a Bia">
          <span className="bia-fab-avatar">
            <img src="/assets/Bia.jpeg" alt="Bia" onError={e => e.currentTarget.classList.add('hide')} />
            <span className="bia-fab-dot" />
          </span>
          <span className="bia-fab-info">
            <span className="bia-fab-name">Bia</span>
            <span className="bia-fab-status">online · responde na hora</span>
          </span>
        </button>
      )}

      {/* TOAST */}
      {view === 'landing' && (
        <div className="toast-wrap">
          <div className={`toast${toastVisible ? ' visible' : ''}`}>
            <div className="toast-avatar">{toastData.photo ? <img src={toastData.photo} alt="" loading="lazy" /> : toastData.initials}</div>
            <div>
              <div className="toast-title">{toastData.name}</div>
              <div className="toast-subtitle">Criou uma música há {toastData.time} atrás</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
