import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("acesso sem sessão", () => {
  for (const path of [
    "/",
    "/inicio",
    "/transacoes",
    "/configuracoes",
    "/conexoes",
    "/contas",
    "/cartoes",
  ]) {
    test(`${path} manda para o login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/entrar/);
      await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    });
  }

  test("a verificação em duas etapas exige login antes", async ({ page }) => {
    await page.goto("/verificacao");
    await expect(page).toHaveURL(/\/entrar$/);
  });
});

test.describe("tela de login", () => {
  test("tem campos rotulados e valida antes de chamar o Supabase", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill("nao-e-email");
    await page.getByLabel("Senha").fill("x");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`não tem violações de acessibilidade (tema ${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/entrar");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("envia cabeçalhos de segurança", async ({ request }) => {
    const response = await request.get("/entrar");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });
});

test.describe("rotina diária", () => {
  test("recusa chamada sem o segredo do cron", async ({ request }) => {
    const anonymous = await request.get("/api/cron/daily");
    expect(anonymous.status()).toBe(401);
    const wrong = await request.get("/api/cron/daily", {
      headers: { authorization: "Bearer segredo-errado" },
    });
    expect(wrong.status()).toBe(401);
  });
});
