// Roteamento declarativo via react-router-dom.
// Substitui o regex de path manual que tinha em main.jsx.
//
// Rotas:
//   /                  -> App (quiz/landing)
//   /p/:id             -> DeliveryPage (entrega pos-pagamento)
//   /finalizar/:id     -> PaymentPage (PIX recovery / cobranca direta)
//   /minhas-musicas    -> placeholder (Entrega 3 futura)
//   /admin             -> dentro de App (tela legada — migrar quando feature Admin)
//
// CATCH-ALL: qualquer outra rota cai no App pra preservar o comportamento
// atual onde a UI controla o que mostrar via state interno.
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from '../../App.jsx'
import DeliveryPage from '../../DeliveryPage.jsx'
import PaymentPage from '../../PaymentPage.jsx'

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/p/:id" element={<DeliveryPage />} />
        <Route path="/finalizar/:id" element={<PaymentPage />} />
        {/* Catch-all: tudo o resto cai no App (inclui /admin, query params, etc.) */}
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  )
}
