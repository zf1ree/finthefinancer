import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Verifica o contraste WCAG dos tokens definidos em globals.css, nos dois temas. */
const css = readFileSync(path.resolve(import.meta.dirname, "../../app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const tokens: Record<string, string> = {};
  for (const match of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    tokens[match[1] as string] = match[2] as string;
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const themes = { claro: block(":root {"), escuro: block(':root[data-theme="dark"]') };

const TEXT_PAIRS: [string, string][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surface-2"],
  ["text-muted", "bg"],
  ["text-muted", "surface"],
  ["accent", "surface"],
  ["accent", "bg"],
  ["accent-fg", "accent"],
  ["positive", "surface"],
  ["negative", "surface"],
  ["warning", "surface"],
  ["positive", "positive-soft"],
  ["negative", "negative-soft"],
  ["warning", "warning-soft"],
  ["accent", "accent-soft"],
];

describe.each(Object.entries(themes))("tema %s", (_name, tokens) => {
  it("define todos os tokens usados", () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(tokens[fg], fg).toBeDefined();
      expect(tokens[bg], bg).toBeDefined();
    }
  });

  it.each(TEXT_PAIRS)("%s sobre %s tem contraste ≥ 4.5:1", (fg, bg) => {
    expect(contrast(tokens[fg] as string, tokens[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });
});

it("o bloco de tema escuro automático é igual ao manual", () => {
  const auto = block(':root:not([data-theme="light"])');
  expect(auto).toEqual(themes.escuro);
});
