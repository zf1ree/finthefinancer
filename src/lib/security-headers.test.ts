import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "./security-headers";

describe("createNonce", () => {
  it("gera valores diferentes e em base64", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("buildContentSecurityPolicy", () => {
  const csp = buildContentSecurityPolicy({
    nonce: "abc",
    supabaseUrl: "https://x.supabase.co",
    isDev: false,
  });

  it("permite scripts só com nonce e bloqueia frames e objetos", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("só conecta no próprio app e no Supabase", () => {
    expect(csp).toContain("connect-src 'self' https://x.supabase.co");
  });

  it("libera eval apenas em desenvolvimento", () => {
    expect(buildContentSecurityPolicy({ nonce: "n", supabaseUrl: "", isDev: true })).toContain(
      "'unsafe-eval'",
    );
  });
});
