// Countdown — contador regressivo da oferta de lançamento.
// Aparece no header (modo compact) e no hero (modo padrão).
// Props:
//   - end (timestamp ms): quando a oferta termina
//   - compact (bool): variante pequena pro header
import { useEffect, useState } from 'react'

// Ícone do raio (Lucide "zap"). Inline pra evitar dep externa.
const IconZap = (props) => (
  <svg width={props.s || 15} height={props.s || 15} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

export default function Countdown({ end, compact }) {
  const [left, setLeft] = useState(Math.max(0, end - Date.now()))
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, end - Date.now())), 1000)
    return () => clearInterval(id)
  }, [end])
  if (left <= 0) return null
  const pad = n => String(n).padStart(2, '0')
  const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60
  const Box = ({ v, l }) => (
    <div className="cd-box">
      <span className="cd-num">{pad(v)}</span>
      <span className="cd-lbl">{l}</span>
    </div>
  )
  if (compact) return (
    <span className="countdown countdown-compact" role="timer" aria-label="Tempo restante da oferta">
      <Box v={m} l="min" /><span className="cd-sep">:</span><Box v={s} l="seg" />
    </span>
  )
  return (
    <div className="offer-urgency">
      <div className="offer-urgency-top"><IconZap s={15} /> Oferta de lançamento — termina em</div>
      <div className="countdown" role="timer" aria-label="Tempo restante da oferta">
        <Box v={m} l="min" /><span className="cd-sep">:</span><Box v={s} l="seg" />
      </div>
    </div>
  )
}
