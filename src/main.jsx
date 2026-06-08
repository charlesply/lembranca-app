// Entrypoint do app — agora apenas monta o AppRouter.
// Antes tinha regex de path manual aqui (Fases 0-3 do refactor preservaram
// esse padrão). Fase 4 substitui pelo react-router-dom.
import React from 'react'
import ReactDOM from 'react-dom/client'
import AppRouter from './app/router'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
)
