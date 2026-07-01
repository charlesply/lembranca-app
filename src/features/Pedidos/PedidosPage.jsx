// PedidosPage — /pedidos: página simples "Acessar minha música".
// O cliente digita e-mail, telefone (com DDD) ou nº do pedido → a gente acha e
// leva pra área Minhas Músicas (vê música paga OU prévia, e pode ajustar).
import { useState } from 'react'

const API = 'https://suno-api-novo.bvph.uk'
const P = '#C96240', P_DARK = '#AB4B2B'

export default function PedidosPage() {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const go = async (e) => {
    if (e) e.preventDefault()
    const val = q.trim()
    if (!val || loading) return
    setLoading(true); setErr('')
    try {
      const raw = val.replace(/^#/, '').trim()
      const isEmail = /@/.test(raw)
      const digits = raw.replace(/\D/g, '')
      const hex = raw.replace(/[^0-9a-f]/gi, '')
      const looksOrder = val.trim().startsWith('#') || /[a-f]/i.test(raw) || raw.includes('-') || hex.length === 8 || hex.length >= 32

      // Telefone puro (10+ dígitos, sem letras) → direto pra Minhas Músicas.
      if (!isEmail && !looksOrder && digits.length >= 10) {
        window.location.href = `/?tel=${digits}`
        return
      }
      // E-mail ou nº do pedido → busca no backend, pega o telefone e leva pra Minhas Músicas.
      const qs = isEmail ? `email=${encodeURIComponent(raw)}` : `order=${encodeURIComponent(hex)}`
      const r = await fetch(`${API}/api/order/lookup?${qs}`).then(x => x.json()).catch(() => null)
      const orders = (r && r.orders) || []
      if (!orders.length) {
        setErr('Não encontrei nenhum pedido com esse dado 🤔 Confere o e-mail, o telefone (com DDD) ou o número do pedido.')
        setLoading(false); return
      }
      const withPhone = orders.find(o => o.phone) || orders[0]
      const ph = String(withPhone.phone || '').replace(/\D/g, '')
      if (ph) { window.location.href = `/?tel=${ph}`; return }
      // Sem telefone no cadastro → abre o pedido direto (pago = /p, prévia = /finalizar).
      const o = orders.find(x => x.paid_at) || orders[0]
      window.location.href = o.paid_at ? `/p/${o.id}` : `/finalizar/${o.id}`
    } catch (_) {
      setErr('Deu um probleminha aqui 😣 Tenta de novo em instantes.')
      setLoading(false)
    }
  }

  return (
    <div className="pedidos-wrap">
      <form className="pedidos-card" onSubmit={go}>
        <div className="pedidos-eyebrow">Lembrança Cantada</div>
        <h1 className="pedidos-title">Acessar minha música <span aria-hidden="true">💛</span></h1>
        <p className="pedidos-sub">
          Digite seu <b>e-mail</b>, <b>telefone</b> (com DDD) ou o <b>número do pedido</b> que a gente abre a sua música.
        </p>
        <input
          className="pedidos-input"
          value={q}
          onChange={e => { setQ(e.target.value); if (err) setErr('') }}
          placeholder="e-mail, telefone ou #A1B2C3D4"
          autoFocus
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
        />
        {err && <div className="pedidos-err">{err}</div>}
        <button type="submit" className="pedidos-btn" disabled={loading || !q.trim()}>
          {loading ? 'Procurando…' : 'Ver minha música'}
        </button>
        <p className="pedidos-foot">
          Aparece aqui depois que o pagamento é confirmado — ou a sua prévia, se ainda não pagou.
          Acabou de pagar? Espere 1 minutinho 💛
        </p>
      </form>

      <style>{`
        .pedidos-wrap {
          min-height: 100vh; width: 100%;
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px;
          background: linear-gradient(160deg, #fdf2ec 0%, #fbe8de 100%);
          font-family: Inter, system-ui, -apple-system, sans-serif;
        }
        .pedidos-card {
          width: 100%; max-width: 460px;
          background: #fff; border-radius: 22px;
          padding: 34px 30px 26px;
          box-shadow: 0 24px 60px -18px rgba(171,75,43,.28);
          text-align: center;
          display: flex; flex-direction: column;
        }
        .pedidos-eyebrow {
          font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
          color: ${P}; margin-bottom: 14px;
        }
        .pedidos-title { margin: 0 0 10px; font-size: 27px; font-weight: 800; color: #1c1917; letter-spacing: -.01em; }
        .pedidos-sub { margin: 0 0 20px; font-size: 15px; line-height: 1.5; color: #78716c; }
        .pedidos-sub b { color: #57534e; }
        .pedidos-input {
          width: 100%; box-sizing: border-box;
          padding: 15px 18px; margin-bottom: 12px;
          background: #faf6f3; border: 1.5px solid #eaddd4; border-radius: 14px;
          font-size: 16px; color: #1c1917; outline: none; text-align: center;
          transition: border-color .15s, background-color .15s;
        }
        .pedidos-input:focus { border-color: ${P}; background: #fff; }
        .pedidos-input::placeholder { color: #b8a99e; }
        .pedidos-err {
          font-size: 13.5px; color: #b3402b; background: rgba(184,58,58,.08);
          border-radius: 10px; padding: 9px 12px; margin-bottom: 12px; line-height: 1.45;
        }
        .pedidos-btn {
          width: 100%; padding: 15px 18px; border: none; border-radius: 14px;
          background: linear-gradient(135deg, ${P} 0%, ${P_DARK} 100%);
          color: #fff; font-size: 16px; font-weight: 700; cursor: pointer;
          box-shadow: 0 8px 22px -8px rgba(171,75,43,.6);
          transition: filter .15s, opacity .15s;
        }
        .pedidos-btn:hover:not(:disabled) { filter: brightness(1.04); }
        .pedidos-btn:disabled { opacity: .55; cursor: default; }
        .pedidos-foot { margin: 18px 0 0; font-size: 12.5px; line-height: 1.5; color: #a8a29e; }
      `}</style>
    </div>
  )
}
