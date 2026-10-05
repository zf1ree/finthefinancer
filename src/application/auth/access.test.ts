import { describe, expect, it } from "vitest";
import { decideAccess, safeNextPath } from "./access";

const aal1 = { aal: "aal1" } as const;
const aal2 = { aal: "aal2" } as const;

describe("decideAccess", () => {
  it("manda quem não está logado para o login, guardando o destino", () => {
    expect(decideAccess("/transacoes", null)).toEqual({
      type: "redirect",
      to: "/entrar?next=%2Ftransacoes",
    });
    expect(decideAccess("/", null)).toEqual({ type: "redirect", to: "/entrar" });
  });

  it("exige MFA: sessão aal1 vai para a verificação em qualquer tela do app", () => {
    for (const path of ["/", "/inicio", "/configuracoes", "/qualquer/coisa"]) {
      expect(decideAccess(path, aal1)).toEqual({ type: "redirect", to: "/verificacao" });
    }
  });

  it("libera as telas do app só com aal2", () => {
    expect(decideAccess("/inicio", aal2)).toEqual({ type: "allow" });
    expect(decideAccess("/", aal2)).toEqual({ type: "redirect", to: "/inicio" });
  });

  it("trata a tela de login conforme a sessão", () => {
    expect(decideAccess("/entrar", null)).toEqual({ type: "allow" });
    expect(decideAccess("/entrar", aal1)).toEqual({ type: "redirect", to: "/verificacao" });
    expect(decideAccess("/entrar", aal2)).toEqual({ type: "redirect", to: "/inicio" });
  });

  it("trata a tela de verificação conforme a sessão", () => {
    expect(decideAccess("/verificacao", null)).toEqual({ type: "redirect", to: "/entrar" });
    expect(decideAccess("/verificacao", aal1)).toEqual({ type: "allow" });
    expect(decideAccess("/verificacao", aal2)).toEqual({ type: "redirect", to: "/inicio" });
  });

  it("deixa as rotas de API decidirem a própria autorização", () => {
    expect(decideAccess("/api/health", null)).toEqual({ type: "allow" });
  });
});

describe("safeNextPath", () => {
  it.each([
    [undefined, "/inicio"],
    ["", "/inicio"],
    ["/transacoes", "/transacoes"],
    ["/plano?aba=reservas", "/plano?aba=reservas"],
    ["//evil.com", "/inicio"],
    ["https://evil.com", "/inicio"],
    ["/\\evil.com", "/inicio"],
    ["/entrar", "/inicio"],
    ["/verificacao", "/inicio"],
  ])("%j → %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
