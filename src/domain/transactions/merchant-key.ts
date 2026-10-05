/**
 * Chave estável do estabelecimento, usada pelas regras de categoria que aprendem:
 * "IFOOD *RESTAURANTE 123" e "Ifood*Restaurante" viram a mesma chave.
 */
export function merchantKey(text: string): string | null {
  const key = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(pg|pag|pagto|mp|pp|ec|ifd)\s*\*/g, "") // prefixos de adquirente: "PG *LOJA"
    .replace(/[*\-_/.,:;#]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return key.length >= 2 ? key : null;
}
