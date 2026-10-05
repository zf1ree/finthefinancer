import { getTableColumns, isTable } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { connect } from "./helpers";

/** O schema Drizzle (tipos do app) precisa bater com as migrações SQL (fonte da verdade). */
const { client } = connect();

afterAll(async () => {
  await client.end();
});

const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
  isTable(value),
);

describe("schema Drizzle x banco", () => {
  it("todas as tabelas do public existem no Drizzle e vice-versa", async () => {
    const rows = await client<{ name: string }[]>`
      select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`;
    const inDb = rows.map((row) => row.name).sort();
    const inDrizzle = tables
      .map((table) => getTableConfig(table))
      .filter((config) => (config.schema ?? "public") === "public")
      .map((config) => config.name)
      .sort();
    expect(inDrizzle).toEqual(inDb);
  });

  it.each(
    tables
      .map((table) => [getTableConfig(table), table] as const)
      .filter(([config]) => (config.schema ?? "public") === "public")
      .map(([config, table]) => [config.name, table] as const),
  )("colunas e nulabilidade de %s batem", async (name, table) => {
    const rows = await client<{ column: string; nullable: string }[]>`
      select column_name as column, is_nullable as nullable from information_schema.columns
      where table_schema = 'public' and table_name = ${name}`;
    const inDb = Object.fromEntries(rows.map((row) => [row.column, row.nullable === "YES"]));
    const inDrizzle = Object.fromEntries(
      Object.values(getTableColumns(table)).map((column) => [column.name, !column.notNull]),
    );
    expect(inDrizzle).toEqual(inDb);
  });
});
