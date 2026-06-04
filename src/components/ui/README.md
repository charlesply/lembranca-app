# Componentes · Lembrança Cantada

Biblioteca React pronta, estilizada com os tokens da marca (`../tokens/tokens.css`).

## Setup
1. Importe `tokens/tokens.css` uma vez no app (ex: `main.tsx`).
2. Copie esta pasta `components/` pra `src/`.
3. Use:
```tsx
import { Button, Card, Modal, Tabs, useToaster } from './components';
```

## O que tem
**Layout (responsivo):** Container · Grid · Stack · Cluster
**Forms:** Input · **Select** (dropdown estilizado) · **Combobox** (select com busca) · **MultiSelect** (vários + chips) · **DatePicker** (calendário próprio) · Switch · Dropdown (menu de ações)
**Power 2026:** **CommandK** (⌘K paleta de comandos) · **Skeleton** (shimmer) · **TabView** (abas com skeleton de loading na troca) · **CountUp** (KPI animado) · **ConfirmDialog** (ação destrutiva) · **EmptyState** (lista vazia) · **Reveal** (entrada em scroll)
Button · Card · Pill · Badge · Tabs · Modal · Tooltip · Accordion · Toaster (hook) · Avatar · **AvatarStack** (grupo +N) · Table · **Charts coloridos** (AreaChart, LineChart, BarChart, Donut, Gauge, Funnel, Sparkline, KPITile).

> **`<TabView>`** mostra um skeleton de loading a cada troca de aba; o placeholder **cobre a área real do conteúdo** (overlay), então respeita o layout que estiver lá — qualquer conteúdo, sem ajuste:
> ```tsx
> <TabView tabs={[
>   { id: 'geral', label: 'Visão geral', content: <Overview /> },
>   { id: 'metrica', label: 'Métricas', content: <Metrics /> },
> ]} />   {/* loadingMs={0} desliga o skeleton */}
> ```

> ⚠️ Em formulários use **`<Select>`** e **`<DatePicker>`** do kit — NUNCA `<select>` ou `<input type="date">` nativos (renderizam com o visual do navegador/SO, fora do padrão da marca).
>
> O `<Select>` é um **listbox custom** (lista própria na cor da marca, teclado ↑↓ Enter Esc):
> ```tsx
> <Select label="Plano" value={plano} onChange={setPlano}
>   options={[{ value: 'mensal', label: 'Mensal' }, { value: 'anual', label: 'Anual' }]} />
> ```

Todos usam `var(--c-*)` — respondem ao tema (claro/escuro) e à marca automaticamente.

## 📱 Mobile-first / responsivo
`Container` (largura fluida + padding clamp) e `Grid` (auto-fit) já são responsivos **sem media query** — encolhem e empilham sozinhos de 360px a 1440px+.
```tsx
<Container>
  <Grid min={240}>        {/* 4-up no desktop → 2-up → 1-up no mobile, automático */}
    <KPITile label="Receita" value="R$ 48,2k" delta="+24%" data={[12,18,24,34]} />
    {/* … */}
  </Grid>
</Container>
```
Regra: nada de scroll horizontal · grids com `auto-fit` · empilhar abaixo de 768px · touch ≥ 44px · headings com `clamp()`.

## ⚠️ Charts são COLORIDOS, nunca pretos
Todo gráfico usa `var(--c-primary)` (e a escala da marca / semânticos quando categórico). Exemplos:
```tsx
<BarChart data={[4, 3, 3]} labels={['CSM 1', 'CSM 2', 'CSM 3']} horizontal />
<LineChart data={[12, 19, 15, 27, 32, 41]} labels={['jan','fev','mar','abr','mai','jun']} />
<Donut segments={[
  { label: 'Promotores', value: 5, color: 'var(--c-success)' },
  { label: 'Neutros', value: 3, color: 'var(--c-warning)' },
  { label: 'Detratores', value: 2, color: 'var(--c-danger)' },
]} />
<KPITile label="Receita · 30d" value="R$ 48,2k" delta="+24%" data={[12,18,15,24,28,34]} />
```
Se a IA gerar um gráfico preto/cinza, está ERRADO — troque a cor da série por `var(--c-primary)`.

Componentes mais nichados (form avançado, overlays): peça pra IA usando o `system-prompt.md`.
