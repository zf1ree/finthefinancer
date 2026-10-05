import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/application/sync/provider";
import { localDate } from "@/domain/dates";
import { createPluggyProvider } from "./pluggy";

type Route = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function setup(routes: Record<string, Route>) {
  const calls: { path: string; url: URL; init: RequestInit | undefined }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace(/^\//, "");
    calls.push({ path, url, init });
    if (path === "auth") return json({ apiKey: "chave-de-teste-123" });
    const route = routes[path];
    return route ? route(url, init) : json({ message: "not found" }, 404);
  });
  const sleep = vi.fn(async () => {});
  const provider = createPluggyProvider({
    clientId: "client-id",
    clientSecret: "client-secret",
    baseUrl: "https://api.example.test/",
    fetch: fetchMock as unknown as typeof fetch,
    sleep,
  });
  return { provider, calls, sleep };
}

describe("Pluggy: item", () => {
  it("traduz status, instituição e datas", async () => {
    const { provider, calls } = setup({
      "items/item-1": () =>
        json({
          id: "item-1",
          status: "LOGIN_ERROR",
          executionStatus: "INVALID_CREDENTIALS",
          lastUpdatedAt: "2026-10-05T10:00:00.000Z",
          consentExpiresAt: null,
          connector: {
            id: 212,
            name: "Nubank",
            imageUrl: "https://x/nu.svg",
            primaryColor: "820AD1",
          },
          campoNovo: { ignorado: true },
        }),
    });
    const item = await provider.getItem("item-1");
    expect(item).toEqual({
      externalId: "item-1",
      institution: {
        externalId: "212",
        name: "Nubank",
        logoUrl: "https://x/nu.svg",
        primaryColor: "820AD1",
      },
      status: "login_error",
      statusDetail: "INVALID_CREDENTIALS",
      lastUpdatedAt: new Date("2026-10-05T10:00:00.000Z"),
      consentExpiresAt: null,
    });
    const authCall = calls.find((call) => call.path === "auth");
    expect(JSON.parse(String(authCall?.init?.body))).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const itemCall = calls.find((call) => call.path === "items/item-1");
    expect(new Headers(itemCall?.init?.headers).get("X-API-KEY")).toBe("chave-de-teste-123");
  });

  it("item inexistente ou de outra aplicação vira null", async () => {
    const { provider } = setup({ "items/x": () => json({}, 403) });
    await expect(provider.getItem("x")).resolves.toBeNull();
    await expect(provider.getItem("nao-existe")).resolves.toBeNull();
  });

  it("reaproveita a chave entre chamadas", async () => {
    const { provider, calls } = setup({
      "items/a": () => json({ id: "a", status: "UPDATED" }),
    });
    await provider.getItem("a");
    await provider.getItem("a");
    expect(calls.filter((call) => call.path === "auth")).toHaveLength(1);
  });
});

describe("Pluggy: contas", () => {
  it("identifica cartão e poupança e lê os dados de crédito", async () => {
    const { provider } = setup({
      accounts: () =>
        json({
          results: [
            {
              id: "c1",
              type: "BANK",
              subtype: "CHECKING_ACCOUNT",
              name: "Conta",
              marketingName: null,
              number: "0001/12345-6",
              balance: 1520.33,
              currencyCode: "BRL",
              creditData: null,
            },
            {
              id: "s1",
              type: "BANK",
              subtype: "SAVINGS_ACCOUNT",
              name: "Poupança",
              number: null,
              balance: 10,
              currencyCode: "BRL",
            },
            {
              id: "k1",
              type: "CREDIT",
              subtype: "CREDIT_CARD",
              name: "Cartão",
              marketingName: "Nubank Ultravioleta",
              number: "4321",
              balance: 2180,
              currencyCode: "BRL",
              creditData: {
                brand: "MASTERCARD",
                creditLimit: 5000,
                availableCreditLimit: 2820,
                balanceCloseDate: "2026-10-25",
                balanceDueDate: null,
              },
            },
          ],
        }),
    });
    const accounts = await provider.listAccounts("item-1");
    expect(accounts.map((account) => account.kind)).toEqual(["checking", "savings", "credit_card"]);
    expect(accounts[2]).toMatchObject({
      name: "Nubank Ultravioleta",
      credit: { brand: "MASTERCARD", limit: 5000, available: 2820, dueDate: null },
    });
    // data sem horário não pode virar o dia anterior em Brasília
    expect(accounts[2]?.credit?.closeDate?.toISOString()).toBe("2026-10-25T12:00:00.000Z");
  });
});

describe("Pluggy: transações", () => {
  it("percorre todas as páginas com o período pedido", async () => {
    const { provider, calls } = setup({
      transactions: (url) => {
        const current = Number(url.searchParams.get("page"));
        return json({
          page: current,
          totalPages: 2,
          results: [
            {
              id: `t${current}`,
              date: "2026-10-03T03:00:00.000Z",
              description: "IFOOD",
              amount: 45.9,
              currencyCode: "BRL",
              status: current === 2 ? "PENDING" : "POSTED",
              merchant: {
                name: "iFood",
                businessName: "IFOOD.COM AGENCIA",
                cnpj: "14380200000121",
              },
              creditCardMetadata: { installmentNumber: 1, totalInstallments: 3, billId: "bill-9" },
            },
          ],
        });
      },
    });
    const rows = await provider.listTransactions("acc", {
      from: localDate("2026-09-01"),
      to: localDate("2026-10-05"),
    });
    expect(rows.map((row) => [row.externalId, row.status])).toEqual([
      ["t1", "posted"],
      ["t2", "pending"],
    ]);
    expect(rows[0]).toMatchObject({
      merchantName: "IFOOD.COM AGENCIA",
      installmentNumber: 1,
      installmentTotal: 3,
      billExternalId: "bill-9",
    });
    const params = calls.find((call) => call.path === "transactions")?.url.searchParams;
    expect(params?.get("accountId")).toBe("acc");
    expect(params?.get("from")).toBe("2026-09-01");
    expect(params?.get("to")).toBe("2026-10-05");
    expect(params?.get("pageSize")).toBe("500");
  });

  it("tenta de novo após 429 respeitando Retry-After", async () => {
    let attempts = 0;
    const { provider, sleep } = setup({
      transactions: () => {
        attempts++;
        return attempts === 1
          ? json({}, 429, { "retry-after": "2" })
          : json({ results: [], totalPages: 1 });
      },
    });
    await provider.listTransactions("acc", {
      from: localDate("2026-10-01"),
      to: localDate("2026-10-05"),
    });
    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("desiste depois de 3 falhas do servidor", async () => {
    const { provider } = setup({ transactions: () => json({}, 503) });
    const error = await provider
      .listTransactions("acc", { from: localDate("2026-10-01"), to: localDate("2026-10-05") })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("unavailable");
  });

  it("formato inesperado vira erro claro, sem os dados no texto", async () => {
    const { provider } = setup({
      transactions: () => json({ results: [{ id: "t", amount: "45,90", description: "SEGREDO" }] }),
    });
    const error = (await provider
      .listTransactions("acc", { from: localDate("2026-10-01"), to: localDate("2026-10-05") })
      .catch((caught: unknown) => caught)) as ProviderError;
    expect(error.code).toBe("invalid_response");
    expect(error.message).not.toContain("SEGREDO");
    expect(error.message).not.toContain("45,90");
  });
});

describe("Pluggy: autenticação", () => {
  it("renova a chave uma vez quando recebe 401", async () => {
    let first = true;
    const { provider, calls } = setup({
      "items/a": () => {
        if (first) {
          first = false;
          return json({}, 401);
        }
        return json({ id: "a", status: "UPDATED" });
      },
    });
    await expect(provider.getItem("a")).resolves.toMatchObject({ status: "active" });
    expect(calls.filter((call) => call.path === "auth")).toHaveLength(2);
  });

  it("credenciais erradas viram erro de autenticação", async () => {
    const provider = createPluggyProvider({
      clientId: "x",
      clientSecret: "y",
      baseUrl: "https://api.example.test",
      fetch: (async () => json({ message: "invalid" }, 401)) as unknown as typeof fetch,
    });
    await expect(provider.getItem("a")).rejects.toMatchObject({ code: "auth" });
  });
});

describe("Pluggy: faturas e investimentos", () => {
  it("lê faturas e caixinhas", async () => {
    const { provider } = setup({
      bills: () =>
        json({
          results: [
            {
              id: "b1",
              dueDate: "2026-10-01T00:00:00.000Z",
              billClosingDate: null,
              totalAmount: 2180,
              minimumPaymentAmount: 327,
            },
          ],
          totalPages: 1,
        }),
      investments: () =>
        json({
          results: [
            {
              id: "i1",
              name: "Viagem",
              type: "FIXED_INCOME",
              subtype: "CDB",
              balance: 7400.12,
              amountOriginal: 7000,
              rate: 100,
              rateType: "CDI",
              status: "ACTIVE",
            },
            {
              id: "i2",
              name: "Antiga",
              type: "FIXED_INCOME",
              subtype: "CDB",
              balance: 0,
              status: "TOTAL_WITHDRAWAL",
            },
          ],
          totalPages: 1,
        }),
    });
    const bills = await provider.listBills("k1");
    expect(bills[0]).toMatchObject({
      externalId: "b1",
      total: 2180,
      minimum: 327,
      closeDate: null,
    });
    const investments = await provider.listInvestments("item-1");
    expect(
      investments.map((investment) => [investment.rateDescription, investment.active]),
    ).toEqual([
      ["100% do CDI", true],
      [null, false],
    ]);
  });
});
