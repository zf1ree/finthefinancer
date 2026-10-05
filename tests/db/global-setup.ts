import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

/**
 * Cria um banco novo a cada execução, aplica o "shim" do Supabase e todas as migrações.
 * Requer TEST_DATABASE_URL apontando para um Postgres com usuário superusuário
 * (no CI: serviço postgres do GitHub Actions; local: veja README).
 */
const DB_NAME = "fin_test";

declare module "vitest" {
  export interface ProvidedContext {
    appDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      "TEST_DATABASE_URL não definida. Ex.: postgres://postgres:postgres@localhost:5432/postgres",
    );
  }

  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${DB_NAME} with (force)`);
  await admin.unsafe(`create database ${DB_NAME}`);
  await admin.end();

  const testAdminUrl = withDatabase(adminUrl, DB_NAME);
  const root = path.resolve(import.meta.dirname, "../..");

  const superuser = postgres(testAdminUrl, { max: 1, onnotice: () => {} });
  await superuser.unsafe(readFileSync(path.join(root, "tests/db/supabase-shim.sql"), "utf8"));
  await superuser.end();

  // Migrações rodam como app_owner, que (como o "postgres" do Supabase) não é superusuário.
  const appUrl = withCredentials(testAdminUrl, "app_owner", "app_owner");
  const owner = postgres(appUrl, { max: 1, onnotice: () => {} });
  const migrationsDir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await owner.unsafe(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  await owner.end();

  project.provide("appDatabaseUrl", appUrl);
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function withCredentials(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}
