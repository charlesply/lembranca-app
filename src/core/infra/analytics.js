// Tracking unificado Meta Pixel (fbq) + Google Analytics 4 (gtag).
// `custom=true` dispara trackCustom no Meta. `options.eventID` permite
// deduplicacao server-side via CAPI usando o mesmo event_id.

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
export function trackPurchase(orderId) {
  let v = 0
  try { v = Number(localStorage.getItem('hc_pay_value')) || 0 } catch (_) {}
  const params = { value: v, currency: 'BRL' }
  const options = orderId ? { eventID: `purchase_${orderId}` } : undefined
  track('Purchase', params, false, options)
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

const TRACKING_KEYS = ['utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content', 'src']
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
    if (!foundAny) return // não mexe no localStorage
    // Merge: mantém o que já tinha + sobrescreve com o que veio na URL
    const existing = getTracking()
    const merged = { ...existing, ...fromURL, captured_at: new Date().toISOString() }
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(merged))
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
