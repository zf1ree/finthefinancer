import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Delta } from "./delta";
import { Money } from "./money";
import { StatCard } from "./stat-card";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s/g, " ");

describe("Money", () => {
  it("formata centavos em reais com sinal opcional", () => {
    expect(text(renderToStaticMarkup(<Money value={124730} />))).toBe("R$ 1.247,30");
    expect(text(renderToStaticMarkup(<Money value={-5990} signed />))).toBe("-R$ 59,90");
  });

  it("recusa valor não inteiro (centavos fracionados indicam bug)", () => {
    expect(() => renderToStaticMarkup(<Money value={10.5} />)).toThrow();
  });
});

describe("Delta", () => {
  it("despesa subindo é ruim, com texto explícito", () => {
    const html = renderToStaticMarkup(
      <Delta percent={18} goodWhen="down" comparedTo="sua média" />,
    );
    expect(text(html)).toBe("18% acima da sua média");
    expect(html).toContain("text-negative");
  });

  it("receita subindo é bom", () => {
    const html = renderToStaticMarkup(<Delta percent={12.5} goodWhen="up" comparedTo="média" />);
    expect(text(html)).toBe("12,5% acima da média");
    expect(html).toContain("text-positive");
  });

  it("sem base de comparação, diz isso em vez de inventar", () => {
    expect(
      text(renderToStaticMarkup(<Delta percent={null} goodWhen="up" comparedTo="média" />)),
    ).toBe("Sem base para comparar");
  });
});

describe("StatCard", () => {
  it("mostra traço quando o dado não existe, nunca R$ 0,00", () => {
    const html = text(renderToStaticMarkup(<StatCard title="Caixinhas" value={null} />));
    expect(html).toContain("—");
    expect(html).not.toContain("R$");
  });
});
