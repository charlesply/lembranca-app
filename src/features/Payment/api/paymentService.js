// Service do feature Payment — wraps endpoints de pagamento do backend.
import { apiGet, apiPost, API_URL } from '../../../core/infra'

// Carrega dados da order pra mostrar previa + plano.
export async function fetchOrderStatus(id) {
  return apiGet(`/api/order/${id}/status`)
}

// Cria PIX vinculado ao orderId. Retorna { brCode, brCodeBase64, expiresAt } OU
// { needs_cpf:true, prefilled_email, honoree } quando o pedido é variante B do
// teste A/B de checkout (aí o front mostra o CheckoutCpfBox e reenvia com cpf).
// priceVariant (lc_price_variant) vai junto pra medir conversão do teste A/B.
// extra = { cpf, email } na 2ª chamada (após a caixa de CPF).
export async function createPix(orderId, plan, priceVariant, extra = {}) {
  return apiPost('/api/pay/create', { orderId, plan, priceVariant, ...extra }, { retries: 2 })
}

// Polling de status de pagamento. Retorna { paid, status, abacate_status }.
export async function checkPaymentStatus(orderId) {
  return apiGet(`/api/pay/status?orderId=${encodeURIComponent(orderId)}`)
}

// Upload de comprovante PIX. multipart/form-data, então não passa pelo
// apiPost (que serializa JSON). Retorna { auto_approved, proof_status,
// reasons[] }.
export async function submitPaymentProof(orderId, file, plan) {
  try {
    const fd = new FormData()
    fd.append('proof', file)
    fd.append('plan', plan)
    const r = await fetch(`${API_URL}/api/order/${orderId}/proof`, {
      method: 'POST', body: fd,
    })
    return await r.json().catch(() => ({}))
  } catch (_) {
    return { reason: 'sem conexão' }
  }
}
