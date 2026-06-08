// TestimonialsSection — seção "O que nossos clientes dizem" da landing.
// Pill + heading + 3 cards de depoimento (estrelas, quote, autor com avatar).
//
// Props:
//   - testimonials (array opcional): items {initials, name, loc, photo, quote}
//     photo é opcional — se faltar, exibe `initials` no avatar.
import { Pill } from '../../../components/ui/Pill'

const DEFAULT_TESTIMONIALS = [
  { initials: 'MC', name: 'Mariana Costa', loc: 'Rio de Janeiro, RJ', photo: 'https://randomuser.me/api/portraits/women/68.jpg', quote: '"Queria dar um presente único de aniversário. O estúdio criou uma música linda com nossos momentos juntos. Foi de longe o melhor presente que já dei!"' },
  { initials: 'RL', name: 'Rafael Lima', loc: 'São Paulo, SP', photo: 'https://randomuser.me/api/portraits/men/32.jpg', quote: '"Fiz pra minha mãe no Dia das Mães. Ela chorou de emoção quando ouviu o nome dela na letra. Valeu cada centavo, recomendo muito!"' },
  { initials: 'FS', name: 'Fernando Santos', loc: 'Belo Horizonte, MG', photo: 'https://randomuser.me/api/portraits/men/45.jpg', quote: '"A qualidade é impressionante. A música ficou profissional e super emocionante. Minha namorada amou!"' },
]

export default function TestimonialsSection({ testimonials = DEFAULT_TESTIMONIALS }) {
  return (
    <section className="testimonials" id="testimonials">
      <div className="container">
        <div className="section-header">
          <Pill tone="accent">DEPOIMENTOS</Pill>
          <h2 className="section-title">
            O que nossos <span className="accent-text">clientes</span> dizem
          </h2>
          <p className="section-subtitle">
            Lembranças reais de quem transformou sentimentos em música.
          </p>
        </div>
        <div className="testimonials-grid">
          {testimonials.map(t => (
            <div key={t.name} className="testimonial-card">
              <div className="testimonial-stars">★★★★★</div>
              <div className="testimonial-quote">{t.quote}</div>
              <div className="testimonial-author">
                <div className="testimonial-avatar">
                  {t.photo ? <img src={t.photo} alt={t.name} loading="lazy" /> : t.initials}
                </div>
                <div>
                  <div className="testimonial-name">{t.name}</div>
                  <div className="testimonial-location">{t.loc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
