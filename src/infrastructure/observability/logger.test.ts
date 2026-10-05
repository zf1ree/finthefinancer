import { describe, expect, it } from "vitest";
import { redact } from "./logger";

describe("redact", () => {
  it("remove valores, descrições, credenciais e identificadores sensíveis em qualquer nível", () => {
    const input = {
      event: "sync",
      userId: "u1",
      amountCents: 4590,
      tx: { descriptionRaw: "PIX MARIA", balance: 10, kind: "regular" },
      list: [{ externalItemId: "abc", status: "ok" }],
      headers: { authorization: "Bearer x", cookie: "sb=1" },
      email: "kai@example.com",
    };
    expect(redact(input)).toEqual({
      event: "sync",
      userId: "u1",
      amountCents: "[redacted]",
      tx: { descriptionRaw: "[redacted]", balance: "[redacted]", kind: "regular" },
      list: [{ externalItemId: "[redacted]", status: "ok" }],
      headers: { authorization: "[redacted]", cookie: "[redacted]" },
      email: "[redacted]",
    });
  });

  it("guarda só nome e início da pilha de erros", () => {
    const result = redact(new Error("saldo 1234")) as { name: string; stack: string };
    expect(result.name).toBe("Error");
    expect(Object.keys(result)).toEqual(["name", "stack"]);
  });
});
