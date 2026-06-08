// LandingTopbar — barra de anúncio fixa no topo, só na landing.
// Mostra prova social + oferta + countdown + CTA.
//
// Props:
//   - offerEnd (timestamp ms): repassado pro Countdown
//   - onScrollToForm (function): callback do botão "Criar minha música"
import { IconGift, IconZap, IconArrowRight } from '../../../core/icons'
import Countdown from './Countdown'

export default function LandingTopbar({ offerEnd, onScrollToForm }) {
  return (
    <div className="topbar topbar-offer">
      <span className="topbar-proof">
        <IconGift s={14} /> +5.000 músicas já emocionaram
      </span>
      <span className="topbar-mid">
        <IconZap s={14} /> <span className="topbar-label">Oferta de lançamento:</span> <strong>R$&nbsp;19,90</strong>
        <Countdown end={offerEnd} compact />
      </span>
      <button className="topbar-cta" onClick={onScrollToForm}>
        Criar <span className="topbar-label">minha </span>música <IconArrowRight s={14} />
      </button>
    </div>
  )
}
