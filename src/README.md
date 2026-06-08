# Arquitetura — Feature-Sliced Design (adaptado)

Este projeto segue uma versão adaptada do **Feature-Sliced Design (FSD)**
pra dar isolamento entre features e clareza de responsabilidades.

## Estrutura

```
src/
├── app/               Setup global (router, providers, styles)
├── core/              Código compartilhado e genérico
│   ├── infra/         Comunicação externa (api, analytics, storage)
│   ├── ui/            Componentes burros reusáveis (Button, Card, Input)
│   └── utils/         Funções puras (formatters, masks)
├── features/          Lógica de negócio isolada por feature
│   ├── Quiz/          Funnel TypeForm
│   ├── Chat/          Bia conversacional
│   ├── Payment/       PaymentPage + PIX
│   ├── Delivery/      /p/:id (player + share)
│   ├── Recovery/      /minhas-musicas (Entrega 3 futura)
│   └── Admin/         Dashboard
└── pages/             Páginas que só montam o layout
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

O design system já existe em **`src/components/ui/`** (28 componentes TSX:
Button, Card, Input, Modal, Accordion, etc.). Por ser uma library já
isolada e madura, **NÃO criamos pasta nova `src/core/ui/`** — a pasta
`components/ui/` cumpre o papel do "core/ui" do FSD.

Quando uma feature precisar de componente burro, importa de
`@/components/ui/X` (ou caminho relativo). Pra fim de arquitetura,
considerar `components/ui/` ≡ `core/ui/`.

## Histórico

- 2026-06-08: Refatoração iniciada (branch `refactor/feature-sliced`)
  - Fase 0: setup base ✅
  - Fase 1: extrair utils puros (safeFilename, sleep, currency) ✅
  - Fase 2: extrair infra (analytics, api) ✅
  - Fase 3: skipped — `components/ui/` já cumpre o papel
  - Fase 4: React Router (próxima)
