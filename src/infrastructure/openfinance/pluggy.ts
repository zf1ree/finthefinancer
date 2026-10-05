import { z } from "zod";
import {
  ProviderError,
  type OpenFinanceProvider,
  type ProviderAccount,
  type ProviderBill,
  type ProviderConnectionStatus,
  type ProviderInvestment,
  type ProviderItem,
  type ProviderTransaction,
} from "@/application/sync/provider";
import type { DateRange } from "@/domain/dates";

/**
 * Adaptador do Pluggy (api.pluggy.ai). Só roda no servidor: o Client Secret nunca vai ao navegador.
 * Todo payload passa por Zod; campos desconhecidos são descartados.
 * Referência dos tipos: github.com/pluggyai/pluggy-node (src/types).
 */

// "2026-10-01" vira meio-dia UTC para não cair no dia anterior no fuso de Brasília.
const dateField = z.string().transform((value, ctx) => {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "data inválida" });
    return z.NEVER;
  }
  return date;
});
const optionalDate = dateField.nullish().transform((value) => value ?? null);
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? null);
const optionalNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

const page = <T extends z.ZodType>(item: T) =>
  z.object({
    results: z.array(item),
    page: z.number().int().optional(),
    totalPages: z.number().int().optional(),
  });

const itemSchema = z.object({
  id: z.string(),
  status: z.string(),
  statusDetail: z.unknown().optional(),
  executionStatus: optionalText,
  lastUpdatedAt: optionalDate,
  consentExpiresAt: optionalDate,
  connector: z
    .object({
      id: z.union([z.number(), z.string()]),
      name: z.string(),
      imageUrl: optionalText,
      primaryColor: optionalText,
    })
    .nullish(),
});

const accountSchema = z.object({
  id: z.string(),
  type: z.string(),
  subtype: optionalText,
  name: z.string(),
  marketingName: optionalText,
  number: optionalText,
  balance: z.number(),
  currencyCode: z.string().default("BRL"),
  creditData: z
    .object({
      brand: optionalText,
      creditLimit: optionalNumber,
      availableCreditLimit: optionalNumber,
      balanceCloseDate: optionalDate,
      balanceDueDate: optionalDate,
    })
    .nullish(),
});

const transactionSchema = z.object({
  id: z.string(),
  date: dateField,
  description: z.string().default(""),
  descriptionRaw: optionalText,
  amount: z.number(),
  currencyCode: z.string().default("BRL"),
  status: z.string().nullish(),
  merchant: z
    .object({ name: optionalText, businessName: optionalText, cnpj: optionalText })
    .nullish(),
  paymentData: z.object({ paymentMethod: optionalText }).nullish(),
  creditCardMetadata: z
    .object({
      installmentNumber: optionalNumber,
      totalInstallments: optionalNumber,
      billId: optionalText,
    })
    .nullish(),
});

const billSchema = z.object({
  id: z.string(),
  dueDate: dateField,
  billClosingDate: optionalDate,
  totalAmount: z.number(),
  minimumPaymentAmount: optionalNumber,
});

const investmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  subtype: optionalText,
  balance: z.number(),
  amountOriginal: optionalNumber,
  rate: optionalNumber,
  rateType: optionalText,
  fixedAnnualRate: optionalNumber,
  status: optionalText,
  date: optionalDate,
});

const authSchema = z.object({ apiKey: z.string().min(10) });

const ITEM_STATUS: Record<string, ProviderConnectionStatus> = {
  UPDATED: "active",
  UPDATING: "updating",
  MERGING: "updating",
  LOGIN_ERROR: "login_error",
  OUTDATED: "outdated",
  WAITING_USER_INPUT: "outdated",
  WAITING_USER_ACTION: "outdated",
};

const TOKEN_TTL_MS = 90 * 60 * 1000; // a chave do Pluggy vale 2 h
const MAX_PAGES = 50;
const MAX_ATTEMPTS = 3;

export type PluggyConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export function createPluggyProvider(config: PluggyConfig): OpenFinanceProvider {
  const doFetch = config.fetch ?? fetch;
  const sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = config.now ?? Date.now;
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  let token: { value: string; expiresAt: number } | null = null;

  async function apiKey(forceRefresh = false): Promise<string> {
    if (!forceRefresh && token && token.expiresAt > now()) return token.value;
    const response = await doFetch(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new ProviderError(
        response.status >= 500 ? "unavailable" : "auth",
        `Pluggy auth ${response.status}`,
      );
    }
    const parsed = authSchema.safeParse(await response.json());
    if (!parsed.success) throw new ProviderError("invalid_response", "Pluggy auth sem apiKey");
    token = { value: parsed.data.apiKey, expiresAt: now() + TOKEN_TTL_MS };
    return token.value;
  }

  /** GET com nova tentativa em 429/5xx e renovação da chave em 401. null em 404/403. */
  async function get<T extends z.ZodType>(
    path: string,
    schema: T,
    query: Record<string, string | number> = {},
  ): Promise<z.infer<T> | null> {
    const url = new URL(`${baseUrl}/${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));

    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      const response = await doFetch(url, {
        headers: { "X-API-KEY": await apiKey(), accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });

      if (response.status === 401 && !refreshed) {
        refreshed = true;
        await apiKey(true);
        continue;
      }
      if (response.status === 404 || response.status === 403) return null;
      if (response.status === 429 || response.status >= 500) {
        if (attempt >= MAX_ATTEMPTS) {
          throw new ProviderError(
            response.status === 429 ? "rate_limited" : "unavailable",
            `Pluggy ${path.split("/")[0]} ${response.status}`,
          );
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt,
        );
        continue;
      }
      if (response.status === 401) throw new ProviderError("auth", "Pluggy recusou a chave");
      if (!response.ok) {
        throw new ProviderError("unavailable", `Pluggy ${path.split("/")[0]} ${response.status}`);
      }

      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        throw new ProviderError(
          "invalid_response",
          `Formato inesperado em ${path.split("/")[0]}: ${parsed.error.issues
            .slice(0, 3)
            .map((issue) => issue.path.join("."))
            .join(", ")}`,
        );
      }
      return parsed.data;
    }
  }

  async function getAllPages<T extends z.ZodType>(
    path: string,
    item: T,
    query: Record<string, string | number>,
    pageSize: number,
  ): Promise<z.infer<T>[]> {
    const results: z.infer<T>[] = [];
    for (let current = 1; current <= MAX_PAGES; current++) {
      const body = await get(path, page(item), { ...query, pageSize, page: current });
      if (!body) return results;
      results.push(...body.results);
      const totalPages = body.totalPages ?? 1;
      if (current >= totalPages || body.results.length === 0) return results;
    }
    throw new ProviderError("invalid_response", `${path}: mais de ${MAX_PAGES} páginas`);
  }

  return {
    async getItem(itemId): Promise<ProviderItem | null> {
      const item = await get(`items/${encodeURIComponent(itemId)}`, itemSchema);
      if (!item) return null;
      const detail = item.executionStatus ?? null;
      return {
        externalId: item.id,
        institution: item.connector
          ? {
              externalId: String(item.connector.id),
              name: item.connector.name,
              logoUrl: item.connector.imageUrl,
              primaryColor: item.connector.primaryColor,
            }
          : null,
        status: ITEM_STATUS[item.status] ?? "error",
        statusDetail: detail ? detail.slice(0, 60) : null,
        lastUpdatedAt: item.lastUpdatedAt,
        consentExpiresAt: item.consentExpiresAt,
      };
    },

    async listAccounts(itemId): Promise<ProviderAccount[]> {
      const body = await get("accounts", page(accountSchema), { itemId });
      return (body?.results ?? []).map((account) => {
        const isCard = account.type === "CREDIT" || account.subtype === "CREDIT_CARD";
        const credit = account.creditData;
        return {
          externalId: account.id,
          kind: isCard
            ? "credit_card"
            : account.subtype === "SAVINGS_ACCOUNT"
              ? "savings"
              : "checking",
          name: account.marketingName ?? account.name,
          number: account.number,
          balance: account.balance,
          currency: account.currencyCode,
          credit:
            isCard && credit
              ? {
                  brand: credit.brand,
                  limit: credit.creditLimit,
                  available: credit.availableCreditLimit,
                  closeDate: credit.balanceCloseDate,
                  dueDate: credit.balanceDueDate,
                }
              : null,
        };
      });
    },

    async listTransactions(accountId, range: DateRange): Promise<ProviderTransaction[]> {
      const rows = await getAllPages(
        "transactions",
        transactionSchema,
        { accountId, from: range.from, to: range.to },
        500,
      );
      return rows.map((tx) => ({
        externalId: tx.id,
        date: tx.date,
        description: tx.description || tx.descriptionRaw || "",
        amount: tx.amount,
        currency: tx.currencyCode,
        status: tx.status === "PENDING" ? "pending" : "posted",
        merchantName: tx.merchant?.businessName ?? tx.merchant?.name ?? null,
        merchantCnpj: tx.merchant?.cnpj ?? null,
        paymentMethod: tx.paymentData?.paymentMethod ?? null,
        installmentNumber: tx.creditCardMetadata?.installmentNumber ?? null,
        installmentTotal: tx.creditCardMetadata?.totalInstallments ?? null,
        billExternalId: tx.creditCardMetadata?.billId ?? null,
      }));
    },

    async listBills(accountId): Promise<ProviderBill[]> {
      const rows = await getAllPages("bills", billSchema, { accountId }, 100);
      return rows.map((bill) => ({
        externalId: bill.id,
        dueDate: bill.dueDate,
        closeDate: bill.billClosingDate,
        total: bill.totalAmount,
        minimum: bill.minimumPaymentAmount,
      }));
    },

    async listInvestments(itemId): Promise<ProviderInvestment[]> {
      const rows = await getAllPages("investments", investmentSchema, { itemId }, 100);
      return rows.map((investment) => ({
        externalId: investment.id,
        name: investment.name,
        type: investment.type,
        subtype: investment.subtype,
        balance: investment.balance,
        amountOriginal: investment.amountOriginal,
        rateDescription: describeRate(investment),
        active: investment.status !== "TOTAL_WITHDRAWAL",
        date: investment.date,
      }));
    },
  };
}

function describeRate(investment: z.infer<typeof investmentSchema>): string | null {
  const percent = (value: number) =>
    `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  if (investment.rate !== null && investment.rateType) {
    return `${percent(investment.rate)} do ${investment.rateType}`;
  }
  if (investment.fixedAnnualRate !== null) return `${percent(investment.fixedAnnualRate)} ao ano`;
  return null;
}
