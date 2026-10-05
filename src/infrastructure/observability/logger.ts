/**
 * Logger estruturado que nunca grava dados financeiros nem credenciais.
 * Qualquer chave sensível é substituída por "[redacted]", em qualquer nível do objeto.
 */
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SENSITIVE_KEY =
  /amount|balance|cents|valor|saldo|description|descri|merchant|note|content|message_text|token|secret|password|senha|code|email|cpf|cnpj|item|account_number|authorization|cookie/i;

const MAX_DEPTH = 4;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    if (value instanceof Error) {
      return { name: value.name, stack: value.stack?.split("\n").slice(0, 6).join("\n") };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[redacted]" : redact(inner, depth + 1),
      ]),
    );
  }
  return value;
}

function write(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...(redact(fields) as Fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
