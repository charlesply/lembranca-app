// BiaFab — FAB sticky "Falar com a Bia no WhatsApp", só na landing.
// Lê pedido salvo no localStorage pra montar mensagem personalizada
// ("Olá Bia! Aqui é Charles — sobre a música para João" etc).
//
// Props:
//   - visible (bool): aparece quando true (controla a class .visible)
//   - supportNum (string opcional): número da Bia no WhatsApp
//
// Notas:
// - Lê localStorage SÍNCRONO na renderização (sem state) — mesmo
//   comportamento do código original. Se o pedido salvo mudar, basta
//   a página rerenderizar.
export default function BiaFab({ visible, supportNum = '5511920933097' }) {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem('hc_current_order') || 'null') } catch (_) { return null }
  })()
  const clientName = (saved?.customerName || '').trim()
  const honoree = (saved?.honoreeName || '').trim()
  const orderId = saved?.id ? `\nPedido: #${String(saved.id).slice(0, 8).toUpperCase()}` : ''
  const greet = clientName ? `Olá Bia! Aqui é ${clientName}` : 'Olá Bia!'
  const honPart = honoree
    ? ` — sobre a música para *${honoree}*`
    : ' — quero entender melhor sobre a música personalizada antes de comprar 🎵'
  const msg = `${greet}${honPart}${orderId}`
  const mailHref = `mailto:suporte@lembrancacantada.com?subject=${encodeURIComponent('Ajuda — Lembrança Cantada')}&body=${encodeURIComponent(msg)}`

  return (
    <a className={`bia-fab${visible ? ' visible' : ''}`} href={mailHref}
       aria-label="Falar com a Bia por e-mail">
      <span className="bia-fab-avatar">
        <img src="/assets/Bia.jpeg" alt="Bia" onError={e => e.currentTarget.classList.add('hide')} />
        <span className="bia-fab-dot" />
      </span>
      <span className="bia-fab-info">
        <span className="bia-fab-name">Bia</span>
        <span className="bia-fab-status">suporte@lembrancacantada.com</span>
      </span>
    </a>
  )
}
