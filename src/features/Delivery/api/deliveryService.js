// Service do feature Delivery — busca o status da order pra exibir media.
import { apiGet } from '../../../core/infra'

export async function fetchOrderStatus(id) {
  return apiGet(`/api/order/${id}/status`)
}
