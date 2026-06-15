// Roteamento declarativo via react-router-dom.
// Substitui o regex de path manual que tinha em main.jsx.
//
// Rotas:
//   /                  -> App (quiz/landing)
//   /p/:id             -> DeliveryPage (entrega pos-pagamento)
//   /finalizar/:id     -> PaymentPage (PIX recovery / cobranca direta)
//   /promo/:id         -> PromoPage (oferta recovery R$19,90 c/ video)
//   /minhas-musicas    -> placeholder (Entrega 3 futura)
//   /admin             -> dentro de App (tela legada — migrar quando feature Admin)
//
// CATCH-ALL: qualquer outra rota cai no App pra preservar o comportamento
// atual onde a UI controla o que mostrar via state interno.
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from '../../App.jsx'
import { DeliveryPage } from '../../features/Delivery'
import { PaymentPage } from '../../features/Payment'
import { PromoPage } from '../../features/Promo'

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/p/:id" element={<DeliveryPage />} />
        <Route path="/finalizar/:id" element={<PaymentPage />} />
        <Route path="/promo/:id" element={<PromoPage />} />
        {/* Catch-all: tudo o resto cai no App (inclui /admin, query params, etc.) */}
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  )
}
