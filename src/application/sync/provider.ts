import type { DateRange } from "@/domain/dates";

/**
 * Porta do provedor de Open Finance. O adaptador (Pluggy) valida o payload com Zod
 * e entrega estes tipos; valores ainda em reais, com o sinal do provedor.
 */

export type ProviderConnectionStatus = "active" | "updating" | "login_error" | "outdated" | "error";

export type ProviderInstitution = {
  readonly externalId: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly primaryColor: string | null;
};

export type ProviderItem = {
  readonly externalId: string;
  readonly institution: ProviderInstitution | null;
  readonly status: ProviderConnectionStatus;
  readonly statusDetail: string | null;
  readonly lastUpdatedAt: Date | null;
  readonly consentExpiresAt: Date | null;
};

export type ProviderCreditData = {
  readonly brand: string | null;
  readonly limit: number | null;
  readonly available: number | null;
  readonly closeDate: Date | null;
  readonly dueDate: Date | null;
};

export type ProviderAccount = {
  readonly externalId: string;
  readonly kind: "checking" | "savings" | "credit_card";
  readonly name: string;
  readonly number: string | null;
  readonly balance: number;
  readonly currency: string;
  readonly credit: ProviderCreditData | null;
};

export type ProviderTransaction = {
  readonly externalId: string;
  readonly date: Date;
  readonly description: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: "pending" | "posted";
  readonly merchantName: string | null;
  readonly merchantCnpj: string | null;
  readonly paymentMethod: string | null;
  readonly installmentNumber: number | null;
  readonly installmentTotal: number | null;
  readonly billExternalId: string | null;
};

export type ProviderBill = {
  readonly externalId: string;
  readonly dueDate: Date;
  readonly closeDate: Date | null;
  readonly total: number;
  readonly minimum: number | null;
};

export type ProviderInvestment = {
  readonly externalId: string;
  readonly name: string;
  readonly type: string;
  readonly subtype: string | null;
  readonly balance: number;
  readonly amountOriginal: number | null;
  readonly rateDescription: string | null;
  readonly active: boolean;
  readonly date: Date | null;
};

export interface OpenFinanceProvider {
  /** null quando o item não existe ou não está autorizado para esta aplicação. */
  getItem(itemId: string): Promise<ProviderItem | null>;
  listAccounts(itemId: string): Promise<ProviderAccount[]>;
  /** Todas as páginas do período. */
  listTransactions(accountId: string, range: DateRange): Promise<ProviderTransaction[]>;
  listBills(accountId: string): Promise<ProviderBill[]>;
  listInvestments(itemId: string): Promise<ProviderInvestment[]>;
}

export type ProviderErrorCode =
  "not_configured" | "auth" | "rate_limited" | "unavailable" | "invalid_response";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
