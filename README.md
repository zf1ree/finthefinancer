# Fin

Analista financeiro pessoal com IA, de uso pessoal e custo operacional zero.
O desenho completo está em [`docs/arquitetura.md`](docs/arquitetura.md); a pesquisa de produto e mercado em [`docs/01-discovery-e-pesquisa.md`](docs/01-discovery-e-pesquisa.md).
As convenções de código estão em [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · Supabase (Postgres + Auth com MFA) · Drizzle ORM · Zod · Vitest · Playwright.
Open Finance pelo Meu Pluggy (Fase 2) e IA pelo Groq (Fase 4).

## Estrutura

```
src/
├── app/             rotas e telas (Next.js)
├── components/      design system e componentes de tela, sem lógica financeira
├── application/     casos de uso e regras de acesso
├── domain/          regras financeiras puras (dinheiro em centavos, datas no fuso de SP)
├── infrastructure/  banco (Drizzle + RLS), autenticação, logs
├── lib/             utilitários sem regra de negócio
└── proxy.ts         sessão, login + MFA obrigatório, CSP com nonce
supabase/migrations/ schema SQL (fonte da verdade), RLS e categorias
tests/db/            testes contra Postgres real: RLS, isolamento entre usuários, schema
e2e/                 testes no navegador: acesso e acessibilidade
```

As dependências entre camadas são verificadas pelo ESLint (`eslint-plugin-boundaries`).

## Rodando localmente

```bash
pnpm install
cp .env.example .env.local   # preencha com os dados do seu projeto Supabase
pnpm dev
```

Verificações (as mesmas do CI):

```bash
pnpm check                                   # lint, tipos, formatação e testes unitários
TEST_DATABASE_URL=postgres://... pnpm test:db # RLS e isolamento entre usuários
pnpm build && pnpm test:e2e                   # navegador (Playwright)
```

## Configurando o Supabase (uma vez)

1. Crie um projeto na região **South America (São Paulo)**.
2. Rode as migrações de `supabase/migrations/` (SQL Editor, na ordem dos arquivos, ou `supabase db push` com a CLI).
3. Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**.
4. Em **Authentication → Users**, crie o seu usuário (e-mail e senha).
5. Em **Authentication → Multi-Factor**, deixe o TOTP habilitado. O app obriga o cadastro do autenticador no primeiro login.

## Deploy (Vercel Hobby)

1. Importe o repositório na Vercel.
2. Cadastre as variáveis de `.env.example` (exceto `TEST_DATABASE_URL`) em **Settings → Environment Variables**.
3. Em **Settings → Functions**, escolha a região `gru1` (São Paulo), se disponível no seu plano.
