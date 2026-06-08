// Service do feature Payment — wraps endpoints de pagamento do backend.
import { apiGet, apiPost } from '../../../core/infra'

// Carrega dados da order pra mostrar previa + plano.
export async function fetchOrderStatus(id) {
  return apiGet(`/api/order/${id}/status`)
}

// Cria PIX vinculado ao orderId. Retorna { brCode, brCodeBase64, expiresAt }.
export async function createPix(orderId, plan) {
  return apiPost('/api/pay/create', { orderId, plan }, { retries: 2 })
}

// Polling de status de pagamento. Retorna { paid, status, abacate_status }.
export async function checkPaymentStatus(orderId) {
  return apiGet(`/api/pay/status?orderId=${encodeURIComponent(orderId)}`)
}
