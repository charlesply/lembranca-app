// Detalhes dos planos vendidos no app. Sincronizar com backend PAY_PLANS
// em lib/payPlans (se mudar valor aqui, muda lá tambem).
export const PLAN_DETAILS = {
  musica:   { name: 'Música personalizada',         amount: 19.90 },
  completa: { name: 'Música personalizada + vídeo', amount: 29.90 },
  // Planos do TESTE A/B de preço (música only + 1 edição, SEM vídeo).
  // Preço/entrega decididos no servidor (payPlans). Aqui só o display.
  test37:   { name: 'Música personalizada', amount: 37.00 },
  test47:   { name: 'Música personalizada', amount: 47.00 },
  test67:   { name: 'Música personalizada', amount: 67.00 },
}

// ─────────────────────────────────────────────────────────────
// TESTE A/B DE PREÇO
// Atribui UMA vez por visitante (persistido em localStorage) e nunca reatribui.
//   - 50% → 'control' (fluxo atual: musica R$19,90 + completa R$29,90 com vídeo)
//   - 25% p37 · 25% p47  (p67 SAIU do teste 08/jul — convertia mal. Config de p67
//     é mantida abaixo só pra renderizar pedidos p67 antigos + QA ?pv=p67.)
// Sorteio: r < 0.5 → control; senão [0.5,0.75) → p37, [0.75,1) → p47.
// ─────────────────────────────────────────────────────────────
export const PRICE_VARIANT_KEY = 'lc_price_variant'

// Config de cada variante de teste: qual planKey mandar pro backend + display.
export const TEST_VARIANTS = {
  p37: { planKey: 'test37', price: 37.00, anchor: 97.00 },
  p47: { planKey: 'test47', price: 47.00, anchor: 97.00 },
  p67: { planKey: 'test67', price: 67.00, anchor: 127.00 },
}

function drawVariant() {
  const r = Math.random()
  if (r < 0.5) return 'control'
  // p67 saiu do teste: [0.5,0.75) → p37, [0.75,1) → p47.
  return r < 0.75 ? 'p37' : 'p47'
}

const _VALID_PV = ['control', 'p37', 'p47', 'p67']

// Resolve a variante de preço. PRIORIDADE:
//   1) ?pv= no STAGING (QA — blindado por hostname, nunca vale em produção)
//   2) orderVariant — a variante FIXADA NO PEDIDO (fonte da verdade: o cliente
//      vê SEMPRE o mesmo preço em qualquer device / no link do e-mail)
//   3) localStorage/sorteio (rede de segurança — o pedido sempre traz a variante)
export function getPriceVariant(orderVariant) {
  try {
    if (typeof window !== 'undefined' && /(^|\.)staging\./.test(window.location.hostname)) {
      const pv = new URLSearchParams(window.location.search).get('pv')
      if (_VALID_PV.includes(pv)) { try { localStorage.setItem(PRICE_VARIANT_KEY, pv) } catch (_) {} return pv }
    }
    if (_VALID_PV.includes(orderVariant)) return orderVariant
    const cur = localStorage.getItem(PRICE_VARIANT_KEY)
    if (_VALID_PV.includes(cur)) return cur
    const v = drawVariant()
    try { localStorage.setItem(PRICE_VARIANT_KEY, v) } catch (_) {}
    return v
  } catch (_) {
    return _VALID_PV.includes(orderVariant) ? orderVariant : 'control'
  }
}

// Variante é de teste (mostra plano único música-only)?
export function isTestVariant(v) {
  return v === 'p37' || v === 'p47' || v === 'p67'
}
