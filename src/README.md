# Arquitetura — Feature-Sliced Design (adaptado)

Este projeto segue uma versão adaptada do **Feature-Sliced Design (FSD)**
pra dar isolamento entre features e clareza de responsabilidades.

## Estrutura atual

```
src/
├── app/                 ✅ Setup global
│   └── router/          ✅ React Router (substitui o regex manual antigo)
├── core/                ✅ Código compartilhado e genérico
│   ├── infra/           ✅ analytics.js, api.js (API_URL + apiGet/apiPost)
│   ├── ui/              ⚠️  Vide nota abaixo
│   └── utils/           ✅ safeFilename, sleep, currency, etc
├── features/
│   ├── Quiz/            ✅ Quiz.jsx + quizConfig.js
│   ├── Payment/         ✅ PaymentPage + api/paymentService + hooks/usePixPolling
│   ├── Delivery/        ✅ DeliveryPage + api/deliveryService + hooks/useVideoPoster
│   ├── Chat/            ⏳ FUTURO — atualmente embutido em App.jsx
│   ├── Admin/           ⏳ FUTURO — atualmente embutido em App.jsx
│   └── Recovery/        ⏳ FUTURO — Portal "Minhas Músicas" (Entrega 3)
├── components/
│   └── ui/              ✅ Design system (Button, Card, Input, Modal, etc — 28 TSX)
├── pages/               ⏳ FUTURO — quando Chat/Admin sairem do App.jsx
├── App.jsx              ⚠️  Ainda contém Chat + Admin + Landing (refactor futuro)
└── main.jsx             ✅ Monta o AppRouter
```

## Regras de dependência

```
pages → features → core
app   → providers/router (configura tudo)
```

- `core` NÃO pode importar de `features` ou `pages`
- `features` pode importar de `core` mas NÃO de outra `feature`
- `pages` pode importar de `features` e `core`

## Convenções dentro de cada feature

```
features/X/
├── api/           Chamadas pro backend (services)
├── components/    Componentes visuais da feature
├── hooks/         Lógica reusável dentro da feature
├── modals/        Modais específicos
└── types.ts       Tipos da feature (futuro: TypeScript)
```

## Nota sobre `core/ui/`

O design system existe em **`src/components/ui/`** (28 componentes TSX:
Button, Card, Input, Modal, Accordion, etc.). Por ser uma library já
isolada e madura, **NÃO foi criado `src/core/ui/` separado**.

Pra fim de arquitetura, considerar `components/ui/` ≡ `core/ui/`.

## Histórico do refactor (branch `refactor/feature-sliced`)

| Fase | Status | O que mudou |
|---|---|---|
| 0 | ✅ | Setup base: react-router-dom + estrutura de pastas + README |
| 1 | ✅ | core/utils: safeFilename, sleep, priceToNum, fmtBRL |
| 2 | ✅ | core/infra: analytics + api (API_URL, apiGet, apiPost) |
| 3 | ⏭️ | skip — components/ui já cumpre o papel |
| 4 | ✅ | React Router substitui regex de pathname em main.jsx |
| 5 | ✅ | features/Delivery (DeliveryPage + service + hook useVideoPoster) |
| 6 | ✅ | features/Payment (PaymentPage + service + hook usePixPolling) |
| 7 | ✅ | features/Quiz (Quiz.jsx + quizConfig.js movidos) |
| 8 | ⏳ | features/Chat — adiado (desacoplar do App.jsx é grande, ~3-5h) |
| 9 | ⏳ | features/Admin — adiado (mesmo motivo) |
| 10 | ✅ | Cleanup + README + smoke test final |

## Próximos passos sugeridos (quando voltar)

1. **Extrair Chat do App.jsx pra `features/Chat/`** — o chat com a Bia
   tem state acoplado a 30+ pieces do App. Estratégia: ChatProvider
   (Context) que expõe o state, depois Chat puro consome.
2. **Extrair Admin do App.jsx pra `features/Admin/`** — mais simples
   que Chat porque é tela isolada. Movê-la pra `features/Admin/` +
   atualizar a rota.
3. **TypeScript gradual** — começar pelos arquivos novos (services,
   hooks, utils). Quando criar novo `.tsx`, ele já tipa correto.
4. **Tests** — Vitest + React Testing Library, começar pelos hooks
   (useVideoPoster, usePixPolling).
