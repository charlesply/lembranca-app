// HowItWorksSection — seção "Como funciona" (4 passos).
// Pill + heading + 4 cards numerados com img + titulo + texto.
//
// Props:
//   - steps (array opcional): items {n, title, text}
//     Imagens são lidas de /assets/passos/passo-{n}.jpg
import { Pill } from '../../../components/ui/Pill'

const DEFAULT_STEPS = [
  { n: 1, title: 'Conte a sua história', text: 'Você nos diz pra quem é, a relação e os momentos especiais. Pode ser por texto ou por áudio — do seu jeito.' },
  { n: 2, title: 'Personalize cada detalhe', text: 'Escolha o estilo musical, o clima e a voz (masculina ou feminina). A música fica com a sua cara.' },
  { n: 3, title: 'Receba a prévia na hora', text: 'Em poucos minutos você ouve um trecho da música pronta, sem compromisso e sem pagar nada antes.' },
  { n: 4, title: 'Emocione quem você ama', text: 'Liberou a versão completa, é seu pra guardar e mandar — fica pra sempre 💜' },
]

export default function HowItWorksSection({ steps = DEFAULT_STEPS }) {
  return (
    <section className="howitworks" id="como-funciona">
      <div className="container">
        <div className="section-header">
          <Pill tone="accent">COMO FUNCIONA</Pill>
          <h2 className="section-title">
            Crie uma música inesquecível em <span className="accent-text">4 passos simples</span>
          </h2>
          <p className="section-subtitle">
            Do jeito mais fácil possível: você conta, a gente compõe e emociona quem você ama.
          </p>
        </div>
        <div className="how-grid">
          {steps.map(s => (
            <div key={s.n} className="how-card">
              <div className="how-num">{s.n}</div>
              <div className="how-img">
                <img src={`/assets/passos/passo-${s.n}.jpg`} alt={s.title} loading="lazy" />
              </div>
              <div className="how-title">{s.title}</div>
              <div className="how-text">{s.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
