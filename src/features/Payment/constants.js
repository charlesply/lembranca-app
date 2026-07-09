// Detalhes dos planos vendidos no app. Sincronizar com backend PAY_PLANS
// em lib/payPlans (se mudar valor aqui, muda lá tambem).
export const PLAN_DETAILS = {
  musica:   { name: 'Música personalizada',         amount: 19.90 },
  completa: { name: 'Música personalizada + vídeo', amount: 29.90 },
  // Planos do TESTE A/B de preço (música only + 1 edição, SEM vídeo).
  // Preço/entrega decididos no servidor (payPlans). Aqui só o display.
  test2900: { name: 'Música personalizada', amount: 29.00 },
  test29:   { name: 'Música personalizada', amount: 29.90 }, // = test2990 (variante p2990)
  test37:   { name: 'Música personalizada', amount: 37.00 },
  test47:   { name: 'Música personalizada', amount: 47.00 },
  test67:   { name: 'Música personalizada', amount: 67.00 },
}

// ─────────────────────────────────────────────────────────────
// TESTE A/B DE PREÇO
// Atribui UMA vez por visitante (persistido em localStorage) e nunca reatribui.
// TESTE DEFINITIVO (09/jul): 34% control (musica R$19,90 / completa R$29,90 c/ vídeo)
//   vs 33% p2990 (R$29,90 só música) vs 33% p2900 (R$29,00 só música). Ambos sem
//   âncora ("Valor único"). Sorteio: r<0.34 control · [0.34,0.67) p2990 · resto p2900.
// p29/p37/p47/p67 ENCERRADOS — config mantida abaixo só pra renderizar pedidos
// antigos dessas variantes + QA ?pv=. Não são mais sorteados.
// ─────────────────────────────────────────────────────────────
export const PRICE_VARIANT_KEY = 'lc_price_variant'

// Config de cada variante de teste: qual planKey mandar pro backend + display.
export const TEST_VARIANTS = {
  p2990: { planKey: 'test29',   price: 29.90, anchor: null }, // ATIVO — R$29,90 só música
  p2900: { planKey: 'test2900', price: 29.00, anchor: null }, // ATIVO — R$29,00 só música
  p29: { planKey: 'test29', price: 29.90, anchor: null }, // encerrado (só p/ pedidos antigos)
  p37: { planKey: 'test37', price: 37.00, anchor: 97.00 }, // encerrado
  p47: { planKey: 'test47', price: 47.00, anchor: 97.00 }, // encerrado
  p67: { planKey: 'test67', price: 67.00, anchor: 127.00 }, // encerrado
}

function drawVariant() {
  // Teste definitivo: 34% control / 33% p2990 / 33% p2900.
  const r = Math.random()
  if (r < 0.34) return 'control'
  return r < 0.67 ? 'p2990' : 'p2900'
}

const _VALID_PV = ['control', 'p2990', 'p2900', 'p29', 'p37', 'p47', 'p67']

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
  return v === 'p2990' || v === 'p2900' || v === 'p29' || v === 'p37' || v === 'p47' || v === 'p67'
}
