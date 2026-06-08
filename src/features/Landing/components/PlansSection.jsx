// PlansSection — seção "Planos e Preços" da landing.
// Pill + heading + 2 cards de plano (Música R$19,90 / Música+Vídeo R$29,90).
//
// Props:
//   - plans (array opcional): items {name, planKey, badge, featured, price, desc, delivery, tagline, items[]}
//   - onScrollToForm (function): callback do botão "Criar minha música" de cada plano
import { Pill } from '../../../components/ui/Pill'
import { IconZap } from '../../../core/icons'

const DEFAULT_PLANS = [
  { name: 'Música personalizada', planKey: 'musica', badge: null, featured: false, price: '19,90', desc: 'Sua história transformada em música, só sua 🎵', delivery: 'Pronta rapidinho', tagline: 'A canção perfeita pra emocionar quem você ama.', items: ['Música completa e exclusiva, feita da sua história', 'Voz e estilo à sua escolha', 'Arquivo em MP3 pra guardar pra sempre', 'Prévia e versão completa aqui no chat'] },
  { name: 'Música + Vídeo Personalizado', planKey: 'completa', badge: 'MAIS COMPLETO', featured: true, price: '29,90', desc: 'A música + vídeo personalizado com a letra pra cantar no estilo karaokê 🎤', delivery: 'Pronta rapidinho', tagline: 'A música + um vídeo karaokê personalizado pra cantar e compartilhar.', items: ['Tudo do plano Música personalizada', '🎬 Vídeo personalizado no estilo karaokê (letra pra cantar junto) 🎤', 'Perfeito pra emocionar e postar nas redes', 'Prioridade na produção'] },
]

export default function PlansSection({ plans = DEFAULT_PLANS, onScrollToForm }) {
  return (
    <section className="plans" id="pricing">
      <div className="container">
        <div className="section-header">
          <Pill tone="accent">PLANOS E PREÇOS</Pill>
          <h2 className="section-title">
            Escolha o plano <span className="accent-text">ideal</span> pra você
          </h2>
          <p className="section-subtitle">
            Pagamento único, sem mensalidade. Crie a sua música agora e surpreenda quem você ama.
          </p>
        </div>
        <div className="plans-grid">
          {plans.map(p => (
            <div key={p.name} className={`plan-card${p.featured ? ' featured' : ''}`}>
              {p.badge && <div className="plan-badge">{p.badge}</div>}
              <div className="plan-name">{p.name}</div>
              <div className="plan-tagline">{p.tagline}</div>
              <div className="plan-price"><span className="plan-currency">R$</span>{p.price}</div>
              <div className="plan-delivery"><IconZap s={14} /> {p.delivery}</div>
              <div className="plan-items">
                {p.items.map(it => (
                  <div key={it} className="plan-item"><span className="check">✓</span> {it}</div>
                ))}
              </div>
              <button className="btn-primary" onClick={onScrollToForm}>Criar minha música →</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
