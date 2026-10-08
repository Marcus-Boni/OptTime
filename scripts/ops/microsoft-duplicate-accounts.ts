/**
 * Lists users that have more than one Microsoft `account` row, and which of the
 * extra rows a cleanup would remove. SIMULATION ONLY — it removes nothing.
 *
 *   pnpm ops:microsoft-duplicates
 *
 * Background: when the app moved to another Entra registration, Better Auth
 * created a new row (`account_id` is pairwise per registration) and left the old
 * one behind with a refresh token Microsoft no longer honours. See
 * `src/lib/microsoft-account-selection.ts` for the rule that picks the live row.
 *
 * A row is a removal *candidate* only when it is (a) not the row that rule picks
 * and (b) not updated for more than 90 days. Removing a row does not sign anyone
 * out: sessions do not depend on it.
 *
 * There is deliberately no mode that deletes. The listing runs in a READ ONLY
 * transaction, so even a bug here could not write; a deleting mode should be
 * written only after the output of this one has been reviewed against the
 * environment it will run on, and it should not be bolted onto this file.
 */

import { eq, sql } from "drizzle-orm";
import { db, dbPool } from "@/lib/db";
import { account } from "@/lib/db/schema";
import {
  type CleanupDecision,
  type MicrosoftAccountRow,
  planDuplicateCleanup,
  STALE_ACCOUNT_DAYS,
} from "@/lib/microsoft-account-selection";

const USAGE = "Uso: pnpm ops:microsoft-duplicates [--dry-run]";

/** Flags a person might reach for expecting a deletion. All refused. */
const REMOVAL_FLAGS = ["--apply", "--execute", "--delete", "--force", "--yes"];

const LABELS: Record<CleanupDecision, string> = {
  "keep-selected": "MANTER (escolhida)    ",
  "keep-recent": "MANTER (recente)      ",
  "remove-candidate": "CANDIDATA À REMOÇÃO  ",
};

function write(line = ""): void {
  process.stdout.write(`${line}\n`);
}

/** `abcdef…wxyz` — enough to tell rows apart, not enough to be an identifier. */
function shorten(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function day(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "—";
}

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname || "(desconhecido)";
  } catch {
    return "(desconhecido)";
  }
}

async function loadRows(): Promise<MicrosoftAccountRow[]> {
  return db.transaction(async (tx) => {
    // Postgres refuses any write for the rest of this transaction.
    await tx.execute(sql`SET TRANSACTION READ ONLY`);

    return tx
      .select({
        id: account.id,
        userId: account.userId,
        accountId: account.accountId,
        refreshToken: account.refreshToken,
        refreshTokenExpiresAt: account.refreshTokenExpiresAt,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
        updatedAt: account.updatedAt,
      })
      .from(account)
      .where(eq(account.providerId, "microsoft"));
  });
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  const refused = args.filter((arg) => REMOVAL_FLAGS.includes(arg));
  if (refused.length > 0) {
    process.stderr.write(
      `Este script só simula; não existe modo de remoção (${refused.join(", ")}).\n` +
        "Confira a simulação com quem decide a limpeza antes de escrever um modo que remova.\n",
    );
    return 2;
  }

  const unknown = args.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    process.stderr.write(
      `Argumento desconhecido: ${unknown.join(", ")}\n${USAGE}\n`,
    );
    return 2;
  }

  const rows = await loadRows();
  const plans = planDuplicateCleanup(rows, new Date());
  const usersWithMicrosoft = new Set(rows.map((row) => row.userId)).size;

  write("Contas Microsoft duplicadas — SIMULAÇÃO (nada é alterado)");
  write(`Banco: ${databaseHost()}`);
  write(
    `Regra: a conta escolhida é a mesma que o app usa; candidata à remoção = não escolhida E sem atualização há mais de ${STALE_ACCOUNT_DAYS} dias.`,
  );
  write();
  write(
    `${plans.length} usuário(s) com mais de uma linha Microsoft, de ${usersWithMicrosoft} usuário(s) com conta Microsoft (${rows.length} linhas).`,
  );

  const totals: Record<CleanupDecision, number> = {
    "keep-selected": 0,
    "keep-recent": 0,
    "remove-candidate": 0,
  };

  for (const plan of plans) {
    write();
    write(`Usuário ${plan.userId}`);

    for (const { row, decision, ageDays } of plan.rows) {
      totals[decision] += 1;
      write(
        `  ${LABELS[decision]} account.id=${row.id}  account_id=${shorten(row.accountId)}  ` +
          `atualizada em ${day(row.updatedAt)} (há ${ageDays} d)  ` +
          `refresh token: ${row.refreshToken ? `sim, expira ${day(row.refreshTokenExpiresAt)}` : "não"}`,
      );
    }
  }

  write();
  write(
    `Resumo: ${totals["remove-candidate"]} linha(s) candidata(s) à remoção, ` +
      `${totals["keep-recent"]} mantida(s) por serem recentes, ` +
      `${totals["keep-selected"]} escolhida(s).`,
  );
  write("Nada foi removido.");

  return 0;
}

main().then(
  async (code) => {
    await dbPool.end();
    process.exit(code);
  },
  async (error: unknown) => {
    process.stderr.write(
      `Falha ao listar: ${error instanceof Error ? error.message : "erro desconhecido"}\n`,
    );
    await dbPool.end().catch(() => undefined);
    process.exit(1);
  },
);
