import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import DeliveryPage from './DeliveryPage.jsx'
import PaymentPage from './PaymentPage.jsx'
import './index.css'

// Roteamento minimo (sem react-router):
//   /p/:id        → DeliveryPage (entrega pos-pagamento)
//   /finalizar/:id → PaymentPage (PIX recovery / cobranca via link direto)
//   resto          → App (quiz/form principal)
const path = window.location.pathname
const route =
  /^\/p\/[a-f0-9-]{8,}/i.test(path) ? 'delivery' :
  /^\/finalizar\/[a-f0-9-]{8,}/i.test(path) ? 'payment' :
  'app'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {route === 'delivery' ? <DeliveryPage />
      : route === 'payment' ? <PaymentPage />
      : <App />}
  </React.StrictMode>,
)
