// Tracking unificado Meta Pixel (fbq) + Google Analytics 4 (gtag).
// `custom=true` dispara trackCustom no Meta. `options.eventID` permite
// deduplicacao server-side via CAPI usando o mesmo event_id.
import { apiGet } from './api'

// Conversões de Compra do Google Ads — UMA entrada por conta de anúncio.
// ➕ Conta nova: adiciona 'AW-<id>/<label>' aqui E o gtag('config','AW-<id>')
// no index.html. O disparo (valor real + transaction_id) é automático.
const GADS_CONVERSIONS = [
  'AW-16541781263/n-KvCLz-ntQcEI-a3s89',  // conta 1
  'AW-18347014139/5M07CJ-ggNYcEPvvxKxE',  // conta 2
  'AW-17220044703/82QICMT3ttccEJ-PlJNA',  // conta 3
]

export function track(event, params, custom, options) {
  try {
    if (typeof window !== 'undefined' && window.fbq) {
      if (options && options.eventID) {
        window.fbq(custom ? 'trackCustom' : 'track', event, params || {}, { eventID: options.eventID })
      } else {
        window.fbq(custom ? 'trackCustom' : 'track', event, params || {})
      }
    }
  } catch (_) {}
  try { if (typeof window !== 'undefined' && window.gtag) window.gtag('event', event, params || {}) } catch (_) {}
}

// Dispara Purchase. Se passar orderId, gera event_id `purchase_{orderId}`
// pra dedup com o CAPI (mesmo event_id que o servidor manda).
//
// CORRIGIDO 15/jun/2026: o `value` agora vem do backend (order.payment_amount)
// em vez de `localStorage.hc_pay_value`. Causa do antigo bug: ~85% dos clientes
// pagavam por fluxos que NÃO setam o localStorage (link /finalizar/:id,
// /promo/:id, reload pós-pagamento, modo anônimo) → Pixel mandava `value:0`
// enquanto CAPI mandava o valor real → Meta detectava mismatch → ROAS bagunçado.
// Fallback pra localStorage só pra continuar disparando mesmo se backend cair.
export async function trackPurchase(orderId) {
  let v = 0
  let order = null
  // Source-of-truth: o que o backend gravou em payment_amount no Supabase.
  if (orderId) {
    try {
      order = await apiGet(`/api/order/${orderId}/status`, { timeout: 5000 })
      const fromServer = Number(order?.payment_amount)
      if (Number.isFinite(fromServer) && fromServer > 0) v = fromServer
    } catch (_) {}
  }
  // Fallback (rede falhou ou orderId ausente): usa o que tava no localStorage.
  if (!v) {
    try { v = Number(localStorage.getItem('hc_pay_value')) || 0 } catch (_) {}
  }
  // 🔒 NUNCA disparar 0: se backend E localStorage falharam (ex: compra pelo e-mail
  // de recuperação em device novo), o Pixel iria com valor 0 e o Facebook, ao
  // deduplicar com o CAPI (mesmo event_id), ficaria com o 0 → subconta a receita.
  // Preço padrão atual = 29,90 (todas as vendas). Melhor errar pra cima que pra 0.
  if (!v || v <= 0) v = 29.90
  const params = { value: v, currency: 'BRL' }
  const options = orderId ? { eventID: `purchase_${orderId}` } : undefined
  track('Purchase', params, false, options)

  // Enhanced Conversions (Google Ads): manda telefone (do pedido) + e-mail (local)
  // como user_data — o gtag hasheia sozinho (SHA-256) e o Google casa MAIS
  // conversões (recupera as que o clique client-side perde). Só vale de verdade
  // com o toggle "Conversões otimizadas" LIGADO na conta do Google Ads.
  try {
    if (typeof window !== 'undefined' && window.gtag) {
      const ud = {}
      const ph = String((order && order.phone) || '').replace(/\D/g, '')
      if (ph.length >= 10) ud.phone_number = '+' + (ph.startsWith('55') ? ph : '55' + ph)
      try {
        const c = JSON.parse(localStorage.getItem('hc_customer') || '{}')
        const em = String(c.email || '').trim().toLowerCase()
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) ud.email = em
      } catch (_) {}
      if (ud.phone_number || ud.email) window.gtag('set', 'user_data', ud)
    }
  } catch (_) {}

  // Google Ads — conversão de Compra em TODAS as contas de anúncio. Dispara com
  // VALOR + moeda e transaction_id = orderId (dedup: se a página recarregar, o
  // Google não conta 2x a mesma venda). Os snippets padrão vêm com value fixo e
  // transaction_id vazio — por isso montamos aqui com o valor real.
  // ➕ Conta nova? basta adicionar o 'AW-xxxx/label' na lista + gtag('config') no index.html.
  try {
    if (typeof window !== 'undefined' && window.gtag) {
      for (const sendTo of GADS_CONVERSIONS) {
        window.gtag('event', 'conversion', {
          send_to: sendTo,
          value: v,
          currency: 'BRL',
          transaction_id: orderId || '',
        })
      }
    }
  } catch (_) {}

  // TikTok Pixel — conversão de Compra (CompletePayment) com valor real + dedup.
  // Advanced Matching: manda email/telefone (o ttq HASHEIA sozinho, SHA-256). O
  // event_id `purchase_{orderId}` deduplicaria com a Events API server-side (se um
  // dia ligar). Só dispara se o ttq carregou (senão falha silenciosa no try).
  try {
    if (typeof window !== 'undefined' && window.ttq) {
      try {
        const idu = {}
        const ph = String((order && order.phone) || '').replace(/\D/g, '')
        if (ph.length >= 10) idu.phone_number = '+' + (ph.startsWith('55') ? ph : '55' + ph)
        const c = JSON.parse(localStorage.getItem('hc_customer') || '{}')
        const em = String(c.email || '').trim().toLowerCase()
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) idu.email = em
        if (idu.email || idu.phone_number) window.ttq.identify(idu)
      } catch (_) {}
      window.ttq.track('CompletePayment', {
        value: v, currency: 'BRL',
        content_type: 'product', content_id: orderId || 'musica',
        content_name: 'Musica personalizada',
      }, orderId ? { event_id: `purchase_${orderId}` } : undefined)
    }
  } catch (_) {}

  // Kwai Pixel WEB (317838080956520) — conversão de Compra (evento client-side
  // 'purchase'). Atribuição 100% pelo PIXEL/cookie (web), NÃO server-side: o pixel
  // Event API foi abandonado (exigia clickid real que o Kwai não entrega na URL).
  // Só dispara se o pixel base (kwaiq) estiver carregado no index.html; senão no-op.
  try {
    if (typeof window !== 'undefined' && window.kwaiq) {
      window.kwaiq.instance('317838080956520').track('purchase', {
        value: v, currency: 'BRL',
        content_id: orderId || 'musica', content_type: 'product',
        content_name: 'Musica personalizada',
      })
    }
  } catch (_) {}
}

// Kwai — evento AddToCart (pixel client-side). Chamar quando o cliente CLICA pra
// gerar PIX (forte intenção de compra). Serve pra OTIMIZAÇÃO de campanha Kwai
// enquanto o Purchase não junta 20 conversões. No-op se o kwaiq não carregou.
export function trackKwaiAddToCart(value) {
  try {
    if (typeof window !== 'undefined' && window.kwaiq) {
      const v = Number(value) > 0 ? Number(value) : 29.90
      window.kwaiq.instance('317838080956520').track('addToCart', {
        value: v, currency: 'BRL', content_type: 'product', content_name: 'Musica personalizada',
      })
    }
  } catch (_) {}
}

// Le cookie pelo nome. Retorna '' se nao existir ou se DOM nao disponivel.
function readCookie(name) {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : ''
  } catch (_) { return '' }
}

// Junta os dados que o backend usa pra Meta CAPI: pixel ativo + cookies
// _fbp/_fbc. O servidor adiciona IP + User-Agent + email/phone hashed.
export function getMetaPixelData() {
  let fbp_pixel_id = ''
  try { fbp_pixel_id = String(window.__HC_FBP_ID__ || '') } catch (_) {}
  return {
    fbp_pixel_id,
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTM + src tracking — captura URLSearchParams na primeira carga e persiste
// em localStorage pra sobreviver ao funil (cliente pode abrir prévia em outra
// aba, voltar pelo email, etc). Captura: utm_source, utm_campaign, utm_medium,
// utm_term, utm_content, src.
// Idempotente: só sobrescreve se vier valor novo na URL (mais recente vence).
// ═══════════════════════════════════════════════════════════════════════════

const TRACKING_KEYS = ['utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content', 'src', 'kwai_clickid']
const TRACKING_STORAGE_KEY = 'hc_tracking'

// Captura params da URL atual e salva no localStorage. Chama 1x ao abrir o site.
// Se a URL não tem nenhum param de tracking, NÃO toca no que já está salvo
// (preserva o tracking original do cliente).
export function captureTrackingFromURL() {
  try {
    const url = new URL(window.location.href)
    const fromURL = {}
    let foundAny = false
    for (const k of TRACKING_KEYS) {
      const v = url.searchParams.get(k)
      if (v) {
        fromURL[k] = String(v).slice(0, 200)
        foundAny = true
      }
    }
    // Google Ads marca o clique com gclid/gbraid/wbraid (NÃO com utm). Se veio um
    // desses e não há utm_source, atribuímos a google/cpc pra o tráfego aparecer no
    // banco (e guardamos o gclid em utm_content pra conversão offline futura).
    const gAdsId = url.searchParams.get('gclid') || url.searchParams.get('gbraid') || url.searchParams.get('wbraid')
    if (gAdsId && !fromURL.utm_source) {
      fromURL.utm_source = 'google'
      fromURL.utm_medium = fromURL.utm_medium || 'cpc'
      if (!fromURL.utm_content) fromURL.utm_content = String(gAdsId).slice(0, 200)
      foundAny = true
    }
    // Kwai carimba o clique com um TOKEN na URL de destino (macro `callback` — nome
    // confirmado pela API deles: valor inventado dá erro "callback字段不合法"). Guardamos
    // pra mandar no EVENT_PURCHASE server-side (Kwai atribui por esse token). Cobrimos
    // vários nomes de param porque o suporte não confirmou o exato: callback (oficial),
    // clickid, ksclickid, pxsource. Se veio e não há utm_source, atribuímos kwai/cpc.
    const kwaiClick = url.searchParams.get('callback')
      || url.searchParams.get('clickid')
      || url.searchParams.get('ksclickid')
      || url.searchParams.get('pxsource')
    if (kwaiClick) {
      fromURL.kwai_clickid = String(kwaiClick).slice(0, 200)
      if (!fromURL.utm_source) {
        fromURL.utm_source = 'kwai'
        fromURL.utm_medium = fromURL.utm_medium || 'cpc'
      }
      foundAny = true
    }
    if (!foundAny) return // não mexe no localStorage
    // Merge: mantém o que já tinha + sobrescreve com o que veio na URL
    const existing = getTracking()
    const merged = { ...existing, ...fromURL, captured_at: new Date().toISOString() }
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(merged))
  } catch (_) {}
}

// Beacon de clique de SMS (carga REAL): quando a página abre com ?src=sms,
// confirma o clique HONESTO no backend. Bot faz o 302 do /s mas NÃO renderiza
// esta página, então nunca dispara isso → só humano conta. Idempotente no backend.
export function confirmSmsClick() {
  try {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    if (p.get('src') !== 'sms') return
    const m = window.location.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (!m) return
    fetch('https://suno-api-novo.bvph.uk/api/sms/click-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m[0] }),
      keepalive: true,
    }).catch(() => {})
  } catch (_) {}
}

// Retorna o tracking salvo (objeto) ou {} se nada.
export function getTracking() {
  try {
    const raw = localStorage.getItem(TRACKING_STORAGE_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return {}
    // Só retorna os campos válidos
    const out = {}
    for (const k of TRACKING_KEYS) if (obj[k]) out[k] = obj[k]
    return out
  } catch (_) { return {} }
}
