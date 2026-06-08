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
