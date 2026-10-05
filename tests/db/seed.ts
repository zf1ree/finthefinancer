import { sql } from "drizzle-orm";
import type { Tx } from "@/infrastructure/db/scoped";

export type SeededIds = Record<
  | "connection"
  | "consent"
  | "account"
  | "cardAccount"
  | "invoice"
  | "transaction"
  | "category"
  | "rule"
  | "investment"
  | "budget"
  | "budgetLine"
  | "reserve"
  | "plan"
  | "allocation"
  | "insight"
  | "conversation"
  | "message"
  | "pendingAction"
  | "syncRun",
  string
>;

async function insertReturningId(tx: Tx, query: ReturnType<typeof sql>): Promise<string> {
  const rows = await tx.execute<{ id: string }>(query);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("insert sem id");
  }
  return id;
}

/** Cria uma linha em cada tabela de usuário, como o próprio usuário (passando pelo RLS). */
export async function seedUserGraph(tx: Tx, userId: string, tag: string): Promise<SeededIds> {
  const systemCategory = await insertReturningId(
    tx,
    sql`select id from category where slug = 'alimentacao.restaurantes' and user_id is null`,
  );

  await tx.execute(
    sql`insert into user_profile (user_id, display_name) values (${userId}, ${tag})`,
  );
  const connection = await insertReturningId(
    tx,
    sql`insert into of_connection (user_id, external_item_id) values (${userId}, ${`item-${tag}`}) returning id`,
  );
  const consent = await insertReturningId(
    tx,
    sql`insert into consent (user_id, connection_id) values (${userId}, ${connection}) returning id`,
  );
  const account = await insertReturningId(
    tx,
    sql`insert into account (user_id, connection_id, external_id, type, name, balance_cents)
        values (${userId}, ${connection}, ${`acc-${tag}`}, 'checking', ${`Conta ${tag}`}, 100000) returning id`,
  );
  const cardAccount = await insertReturningId(
    tx,
    sql`insert into account (user_id, connection_id, external_id, type, name)
        values (${userId}, ${connection}, ${`card-${tag}`}, 'credit_card', ${`Cartão ${tag}`}) returning id`,
  );
  await tx.execute(
    sql`insert into credit_card (account_id, user_id, credit_limit_cents) values (${cardAccount}, ${userId}, 500000)`,
  );
  const invoice = await insertReturningId(
    tx,
    sql`insert into credit_card_invoice (user_id, account_id, reference_month, total_cents, is_open)
        values (${userId}, ${cardAccount}, '2026-10-01', 218000, true) returning id`,
  );
  const category = await insertReturningId(
    tx,
    sql`insert into category (user_id, parent_id, slug, name, kind)
        values (${userId}, ${systemCategory}, ${`pessoal_${tag}`}, ${`Pessoal ${tag}`}, 'expense') returning id`,
  );
  const rule = await insertReturningId(
    tx,
    sql`insert into categorization_rule (user_id, match_type, match_value, category_id)
        values (${userId}, 'merchant_exact', 'ifood', ${category}) returning id`,
  );
  const transaction = await insertReturningId(
    tx,
    sql`insert into transaction (user_id, account_id, external_id, date, amount_cents, direction,
                                 description_raw, category_id, invoice_id)
        values (${userId}, ${cardAccount}, ${`tx-${tag}`}, '2026-10-02', 4590, 'out',
                'IFOOD *RESTAURANTE', ${category}, ${invoice}) returning id`,
  );
  const investment = await insertReturningId(
    tx,
    sql`insert into investment (user_id, connection_id, external_id, name, type, subtype, balance_cents)
        values (${userId}, ${connection}, ${`inv-${tag}`}, 'Viagem', 'FIXED_INCOME', 'CDB', 740000) returning id`,
  );
  await tx.execute(
    sql`insert into investment_snapshot (investment_id, user_id, day, balance_cents)
        values (${investment}, ${userId}, '2026-10-05', 740000)`,
  );
  const budget = await insertReturningId(
    tx,
    sql`insert into budget (user_id, month, created_by) values (${userId}, '2026-10-01', 'user') returning id`,
  );
  const budgetLine = await insertReturningId(
    tx,
    sql`insert into budget_line (budget_id, user_id, category_id, limit_cents)
        values (${budget}, ${userId}, ${systemCategory}, 80000) returning id`,
  );
  const reserve = await insertReturningId(
    tx,
    sql`insert into reserve (user_id, name, kind, target_cents, investment_id, created_by)
        values (${userId}, 'Viagem', 'travel', 2000000, ${investment}, 'user') returning id`,
  );
  const plan = await insertReturningId(
    tx,
    sql`insert into spending_plan (user_id, name, expected_income_cents, created_by)
        values (${userId}, 'Plano', 600000, 'ai_confirmed') returning id`,
  );
  const allocation = await insertReturningId(
    tx,
    sql`insert into spending_plan_allocation (plan_id, user_id, bucket, reserve_id, amount_cents)
        values (${plan}, ${userId}, 'reserve', ${reserve}, 80000) returning id`,
  );
  const insight = await insertReturningId(
    tx,
    sql`insert into financial_insight (user_id, type, severity, title, body, data, fingerprint)
        values (${userId}, 'LowBalanceInsight', 'warning', 't', 'b', '{}'::jsonb, ${`fp-${tag}`}) returning id`,
  );
  const conversation = await insertReturningId(
    tx,
    sql`insert into ai_conversation (user_id, title) values (${userId}, 'Conversa') returning id`,
  );
  const message = await insertReturningId(
    tx,
    sql`insert into ai_message (conversation_id, user_id, role, content)
        values (${conversation}, ${userId}, 'user', 'Quanto gastei?') returning id`,
  );
  const pendingAction = await insertReturningId(
    tx,
    sql`insert into ai_pending_action (user_id, conversation_id, action_type, payload)
        values (${userId}, ${conversation}, 'create_budget', '{}'::jsonb) returning id`,
  );
  const syncRun = await insertReturningId(
    tx,
    sql`insert into sync_run (user_id, trigger, status) values (${userId}, 'manual', 'ok') returning id`,
  );
  await tx.execute(
    sql`insert into audit_log (user_id, actor, action) values (${userId}, 'user', 'auth.login')`,
  );

  return {
    connection,
    consent,
    account,
    cardAccount,
    invoice,
    transaction,
    category,
    rule,
    investment,
    budget,
    budgetLine,
    reserve,
    plan,
    allocation,
    insight,
    conversation,
    message,
    pendingAction,
    syncRun,
  };
}
