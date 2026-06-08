// Helpers de moeda BRL.

// Parse string com preco BR pra number. Ex: "R$ 29,90" -> 29.9, "39" -> 39
export const priceToNum = (p) =>
  Number(String(p || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0

// Format number pra BRL display. Ex: 29.9 -> "R$ 29,90"
export const fmtBRL = (n) =>
  'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
