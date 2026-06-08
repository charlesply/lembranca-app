// FaqSection — seção "Tire suas dúvidas" da landing.
// Lado esquerdo: copy + 2 contatos (WhatsApp + Insta) + CTA;
// lado direito: Accordion do DS com as perguntas.
//
// Props:
//   - faqs (array opcional): items {q, a}
//   - biaPhone (string opcional): número pro WhatsApp (sem formatação)
//   - instagramUrl (string opcional)
//   - onScrollToForm (function): callback do CTA "Criar minha música"
import { Pill } from '../../../components/ui/Pill'
import { Accordion } from '../../../components/ui/Accordion'
import { WhatsAppIcon, InstaIcon } from '../../../core/icons'

const DEFAULT_FAQS = [
  { q: 'Como funciona a Lembrança Cantada?', a: 'Você conta a história, escolhe estilo e voz, e o nosso estúdio transforma tudo numa música personalizada. Em minutos você recebe uma prévia gratuita pra ouvir antes de decidir.' },
  { q: 'Quanto tempo demora pra ficar pronta?', a: 'Na maioria das vezes a prévia fica pronta em poucos minutos. A versão completa é liberada logo após a confirmação do pagamento.' },
  { q: 'Consigo ouvir antes de pagar?', a: 'Sim! Você recebe uma prévia gratuita da música. Só paga se gostar — sem compromisso nenhum.' },
  { q: 'Posso escolher a voz e o estilo?', a: 'Com certeza. Você escolhe o gênero musical, o clima e se a voz é masculina ou feminina. Tudo do seu jeito.' },
  { q: 'Como eu recebo a música?', a: 'A prévia e a versão completa ficam disponíveis aqui mesmo no site pra você baixar em MP3. Se escolher o plano com vídeo karaokê (R$ 29,90), o vídeo também aparece pronto pra baixar.' },
  { q: 'E se eu quiser alterar algo na música?', a: 'Dá pra ajustar! Alterações na música têm um pequeno custo adicional e a gente refaz pra ficar do jeitinho que você quer.' },
  { q: 'Como faço o pagamento?', a: 'O pagamento é por PIX, rápido e seguro. Depois é só enviar o comprovante no WhatsApp que a gente libera tudo na hora.' },
  { q: 'Posso mandar a história por áudio?', a: 'Pode sim! É só gravar um áudio contando a história que a gente transcreve e usa tudo na composição da música.' },
]

export default function FaqSection({
  faqs = DEFAULT_FAQS,
  biaPhone = '5511920188319',
  instagramUrl = 'https://instagram.com/historiascantadasbr',
  onScrollToForm,
}) {
  return (
    <section className="faq" id="faq">
      <div className="container faq-grid">
        <div className="faq-aside">
          <Pill tone="accent">PERGUNTAS FREQUENTES</Pill>
          <h2 className="section-title" style={{ textAlign: 'left' }}>
            Tire suas <span className="accent-text">dúvidas</span>
          </h2>
          <p className="faq-aside-text">
            Não encontrou sua pergunta? Fala com a gente, respondemos rapidinho. 💜
          </p>
          <a href={`https://wa.me/${biaPhone}`} target="_blank" rel="noopener noreferrer" className="faq-contact">
            <span className="faq-contact-ic"><WhatsAppIcon /></span>
            <div>
              <div className="faq-contact-t">WhatsApp</div>
              <div className="faq-contact-s">Resposta na hora</div>
            </div>
          </a>
          <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="faq-contact">
            <span className="faq-contact-ic"><InstaIcon /></span>
            <div>
              <div className="faq-contact-t">Instagram</div>
              <div className="faq-contact-s">@historiascantadasbr</div>
            </div>
          </a>
          <button className="btn-primary" onClick={onScrollToForm}>Criar minha música →</button>
        </div>
        <div className="faq-list">
          {/* Accordion do DS (src/components/ui/Accordion) — substitui o
              custom +/− carret. Open/close interno, animação + tokens
              da marca consistentes com o resto do app. */}
          <Accordion items={faqs} />
        </div>
      </div>
    </section>
  )
}
