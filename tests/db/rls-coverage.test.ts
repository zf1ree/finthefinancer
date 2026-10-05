import { afterAll, describe, expect, it } from "vitest";
import { connect } from "./helpers";

/** Garante que nenhuma tabela nova entre no banco sem RLS. */
const { client } = connect();

afterAll(async () => {
  await client.end();
});

describe("cobertura de RLS", () => {
  it("toda tabela do schema public tem RLS ligado e forçado", async () => {
    const rows = await client<{ table: string; enabled: boolean; forced: boolean }[]>`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows.length).toBeGreaterThan(0);
    const missing = rows.filter((row) => !row.enabled || !row.forced).map((row) => row.table);
    expect(missing).toEqual([]);
  });

  it("toda tabela com user_id tem política de leitura que usa auth.uid()", async () => {
    const rows = await client<{ table: string }[]>`
      select distinct c.table_name as table
      from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'user_id'
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.table_name
            and p.cmd in ('SELECT', 'ALL') and p.qual like '%auth.uid()%'
        )`;
    expect(rows.map((row) => row.table)).toEqual([]);
  });

  it("anon não tem nenhum privilégio no schema public", async () => {
    const rows = await client<{ table: string }[]>`
      select table_name as table from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'`;
    expect(rows).toEqual([]);
  });
});
