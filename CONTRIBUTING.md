# Convenções do projeto

- Leia `docs/arquitetura.md` antes de mudanças estruturais.
- Dinheiro sempre em centavos inteiros (`Cents`, `src/domain/money.ts`). Nunca float.
- Datas contábeis como `LocalDate` no fuso America/Sao_Paulo (`src/domain/dates.ts`).
- Todo acesso a dados de usuário passa por `withUser(userId, ...)` (RLS). `withSystem` só para o cron e o catálogo global de instituições.
- `userId` vem sempre da sessão (`requireSession()`), nunca do cliente nem da IA.
- Toda tabela nova com `user_id`: RLS + FK composta `(id, user_id)` + entrada no teste `tests/db/isolation.test.ts`.
- O schema SQL em `supabase/migrations/` é a fonte da verdade; `src/infrastructure/db/schema.ts` espelha (teste de drift).
- Nunca registrar valores, descrições de transação, e-mails ou tokens em logs (use `logger`).
- Dados do Open Finance entram só pela porta `OpenFinanceProvider` (`src/application/sync/provider.ts`), validados com Zod no adaptador.
- Textos da interface em português do Brasil.
- Antes de concluir: `pnpm check`, `pnpm test:db`, `pnpm build`.
