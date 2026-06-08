// Hook que fica perguntando o status de pagamento a cada N segundos
// uma vez que ha um PIX ativo. Quando detecta paid, dispara onPaid().
import { useEffect, useRef } from 'react'
import { checkPaymentStatus } from '../api/paymentService'

export function usePixPolling({ orderId, hasPix, intervalMs = 4000, onPaid }) {
  const timerRef = useRef(null)
  // Mantemos onPaid em ref pra nao reiniciar o polling quando o caller
  // re-cria a callback (anti-padrao comum em useEffect).
  const onPaidRef = useRef(onPaid)
  useEffect(() => { onPaidRef.current = onPaid }, [onPaid])

  useEffect(() => {
    if (!hasPix || !orderId) return
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      const data = await checkPaymentStatus(orderId)
      if (cancelled) return
      if (data?.paid) {
        onPaidRef.current?.()
        return
      }
      timerRef.current = setTimeout(tick, intervalMs)
    }

    // Primeiro tick imediato + agendamento
    tick()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hasPix, orderId, intervalMs])
}
