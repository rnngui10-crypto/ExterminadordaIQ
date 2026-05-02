# IA Trader — IQ Option Signal Bot

## Overview

Painel de inteligência artificial para trading na IQ Option. Gera sinais em tempo real usando Price Action, Machine Learning e RSI em português do Brasil.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/iq-trader)
- **API framework**: Express 5 (artifacts/api-server)
- **UI Components**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts
- **Animations**: Framer Motion
- **Routing**: Wouter
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Architecture

- `artifacts/iq-trader` — Frontend React + Vite app, dark trading terminal theme
- `artifacts/api-server` — Express API server with trading engine
- `lib/api-spec` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-client-react` — Generated React Query hooks
- `lib/api-zod` — Generated Zod validation schemas
- `artifacts/api-server/src/lib/trading-engine.ts` — Core IA trading logic (Price Action, ML, RSI)

## Trading Strategies

1. **Price Action (PA)** — Detecta padrões de velas: Engulfing, Pin Bar, Martelo, Estrela Cadente
2. **Machine Learning (ML)** — Score baseado em RSI, MACD, Bollinger Bands e Médias Móveis
3. **RSI Extremos** — Detecta sobrecompra (>70) e sobrevenda (<30)
4. **Consenso** — Sinais mais fortes quando 2 ou 3 estratégias concordam

## Pages (Frontend — all in Portuguese BR)

- `/` — Dashboard principal com sinais ao vivo, login IQ Option
- `/sinais` — Tabela completa de sinais com filtros
- `/ativos` — Explorador de ativos com gráfico de candles
- `/historico` — Histórico de sinais gerados
- `/configuracoes` — Troca de conta REAL/PRACTICE, info sobre IA

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Assets

All assets organized by category: Forex Principais, Forex Crosses, Forex Exóticos, Criptomoedas, Índices, Commodities. OTC assets available on weekends.
