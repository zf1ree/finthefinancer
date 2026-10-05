/**
 * Espelho tipado das migrações em supabase/migrations (a fonte da verdade é o SQL).
 * O teste tests/db/schema-drift.test.ts falha se este arquivo e o banco divergirem.
 */
import {
  bigint,
  boolean,
  char,
  date,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", { id: uuid("id").primaryKey() });

const money = (name: string) => bigint(name, { mode: "number" });
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" });

export const accountType = pgEnum("account_type", [
  "checking",
  "savings",
  "credit_card",
  "investment",
  "loan",
  "other",
]);
export const txDirection = pgEnum("tx_direction", ["in", "out"]);
export const txStatus = pgEnum("tx_status", ["pending", "posted", "removed"]);
export const txKind = pgEnum("tx_kind", [
  "regular",
  "internal_transfer",
  "card_bill_payment",
  "investment_move",
  "refund",
]);
export const categorySource = pgEnum("category_source", [
  "user",
  "user_rule",
  "system_rule",
  "provider",
  "ai",
  "default",
]);
export const connectionStatus = pgEnum("connection_status", [
  "active",
  "updating",
  "login_error",
  "outdated",
  "revoked",
  "error",
]);
export const insightSeverity = pgEnum("insight_severity", [
  "info",
  "positive",
  "warning",
  "critical",
]);
export const insightStatus = pgEnum("insight_status", ["new", "seen", "dismissed", "acted"]);
export const pendingStatus = pgEnum("pending_status", [
  "proposed",
  "confirmed",
  "discarded",
  "expired",
  "failed",
]);
export const createdBy = pgEnum("created_by", ["user", "ai_confirmed"]);

export const userProfile = pgTable("user_profile", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  monthlyIncomeCents: money("monthly_income_cents"),
  mainGoal: text("main_goal"),
  lowBalanceThresholdCents: money("low_balance_threshold_cents").notNull().default(50000),
  paydayDay: smallint("payday_day"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  ...timestamps,
});

export const institution = pgTable("institution", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("pluggy"),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
});

export const ofConnection = pgTable(
  "of_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    institutionId: uuid("institution_id").references(() => institution.id),
    provider: text("provider").notNull().default("pluggy"),
    externalItemId: text("external_item_id").notNull(),
    status: connectionStatus("status").notNull().default("active"),
    statusDetail: text("status_detail"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastProviderUpdateAt: timestamp("last_provider_update_at", { withTimezone: true }),
    txCursorDate: date("tx_cursor_date"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique().on(t.id, t.userId)],
);

export const consent = pgTable(
  "consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    connectionId: uuid("connection_id").notNull(),
    externalConsentId: text("external_consent_id"),
    permissions: text("permissions").array().notNull().default([]),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.connectionId, t.userId],
      foreignColumns: [ofConnection.id, ofConnection.userId],
    }).onDelete("cascade"),
  ],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    connectionId: uuid("connection_id"),
    externalId: text("external_id"),
    type: accountType("type").notNull(),
    name: text("name").notNull(),
    numberMasked: text("number_masked"),
    currency: char("currency", { length: 3 }).notNull().default("BRL"),
    balanceCents: money("balance_cents").notNull().default(0),
    balanceAt: timestamp("balance_at", { withTimezone: true }),
    includeInTotals: boolean("include_in_totals").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique().on(t.id, t.userId)],
);

export const creditCard = pgTable("credit_card", {
  accountId: uuid("account_id").primaryKey(),
  userId: userId(),
  brand: text("brand"),
  creditLimitCents: money("credit_limit_cents"),
  availableLimitCents: money("available_limit_cents"),
  closingDay: smallint("closing_day"),
  dueDay: smallint("due_day"),
  closingDaySource: text("closing_day_source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditCardInvoice = pgTable("credit_card_invoice", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  accountId: uuid("account_id").notNull(),
  externalId: text("external_id"),
  referenceMonth: date("reference_month").notNull(),
  closeDate: date("close_date"),
  dueDate: date("due_date"),
  totalCents: money("total_cents"),
  minimumCents: money("minimum_cents"),
  isOpen: boolean("is_open").notNull().default(false),
  ...timestamps,
});

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => authUsers.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  colorToken: text("color_token"),
  kind: text("kind").notNull(),
  isEssential: boolean("is_essential").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const categorizationRule = pgTable("categorization_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  matchType: text("match_type").notNull(),
  matchValue: text("match_value").notNull(),
  categoryId: uuid("category_id").notNull(),
  priority: smallint("priority").notNull().default(100),
  createdFromTx: uuid("created_from_tx"),
  hits: integer("hits").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const transaction = pgTable("transaction", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  accountId: uuid("account_id").notNull(),
  externalId: text("external_id").notNull(),
  date: date("date").notNull(),
  amountCents: money("amount_cents").notNull(),
  direction: txDirection("direction").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("BRL"),
  status: txStatus("status").notNull().default("posted"),
  kind: txKind("kind").notNull().default("regular"),
  descriptionRaw: text("description_raw").notNull(),
  merchantNameRaw: text("merchant_name_raw"),
  merchantCnpj: text("merchant_cnpj"),
  merchantKey: text("merchant_key"),
  paymentMethod: text("payment_method"),
  categoryId: uuid("category_id"),
  categorySource: categorySource("category_source").notNull().default("default"),
  categoryConfidence: real("category_confidence"),
  invoiceId: uuid("invoice_id"),
  installmentNumber: smallint("installment_number"),
  installmentTotal: smallint("installment_total"),
  linkedTxId: uuid("linked_tx_id"),
  note: text("note"),
  isHidden: boolean("is_hidden").notNull().default(false),
  ...timestamps,
});

export const investment = pgTable("investment", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  connectionId: uuid("connection_id").notNull(),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  subtype: text("subtype"),
  balanceCents: money("balance_cents").notNull(),
  amountInvestedCents: money("amount_invested_cents"),
  rateDescription: text("rate_description"),
  liquidity: text("liquidity"),
  balanceAt: timestamp("balance_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const investmentSnapshot = pgTable(
  "investment_snapshot",
  {
    investmentId: uuid("investment_id").notNull(),
    userId: userId(),
    day: date("day").notNull(),
    balanceCents: money("balance_cents").notNull(),
  },
  (t) => [primaryKey({ columns: [t.investmentId, t.day] })],
);

export const budget = pgTable("budget", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  month: date("month").notNull(),
  totalLimitCents: money("total_limit_cents"),
  createdBy: createdBy("created_by").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const budgetLine = pgTable("budget_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  budgetId: uuid("budget_id").notNull(),
  userId: userId(),
  categoryId: uuid("category_id").notNull(),
  limitCents: money("limit_cents").notNull(),
});

export const reserve = pgTable("reserve", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  targetCents: money("target_cents"),
  targetDate: date("target_date"),
  investmentId: uuid("investment_id"),
  manualBalanceCents: money("manual_balance_cents"),
  priority: smallint("priority").notNull().default(100),
  createdBy: createdBy("created_by").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const spendingPlan = pgTable("spending_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  name: text("name").notNull(),
  expectedIncomeCents: money("expected_income_cents").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  rationale: text("rationale"),
  createdBy: createdBy("created_by").notNull(),
  ...timestamps,
});

export const spendingPlanAllocation = pgTable("spending_plan_allocation", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id").notNull(),
  userId: userId(),
  bucket: text("bucket").notNull(),
  categoryId: uuid("category_id"),
  reserveId: uuid("reserve_id"),
  amountCents: money("amount_cents").notNull(),
});

export const financialInsight = pgTable("financial_insight", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  type: text("type").notNull(),
  severity: insightSeverity("severity").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  recommendation: text("recommendation"),
  data: jsonb("data").notNull(),
  action: jsonb("action"),
  fingerprint: text("fingerprint").notNull(),
  status: insightStatus("status").notNull().default("new"),
  validUntil: date("valid_until"),
  ...timestamps,
});

export const aiConversation = pgTable("ai_conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  title: text("title"),
  summary: text("summary"),
  ...timestamps,
});

export const aiMessage = pgTable("ai_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull(),
  userId: userId(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolName: text("tool_name"),
  toolArgs: jsonb("tool_args"),
  toolResult: jsonb("tool_result"),
  validation: jsonb("validation"),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiPendingAction = pgTable("ai_pending_action", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  conversationId: uuid("conversation_id"),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: pendingStatus("status").notNull().default("proposed"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  resultRef: uuid("result_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRun = pgTable("sync_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(),
  step: text("step"),
  stats: jsonb("stats").notNull().default({}),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").references(() => authUsers.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").notNull().default({}),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
