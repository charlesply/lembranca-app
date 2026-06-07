import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import DeliveryPage from './DeliveryPage.jsx'
import './index.css'

// Roteamento minimo: /p/:id renderiza a pagina de entrega (cliente acessa
// sua musica/video apos compra). Resto fica no quiz/form principal.
const isDelivery = /^\/p\/[a-f0-9-]{8,}/i.test(window.location.pathname)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isDelivery ? <DeliveryPage /> : <App />}
  </React.StrictMode>,
)
