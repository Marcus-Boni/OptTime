/**
 * Behaviour tests for the pure logic — duration parsing, branch parsing,
 * colour normalisation, URL trimming.
 *
 * Run with `npm test`. Deliberately framework-free: these are total functions
 * over plain values, and a runner would be more machinery than the tests.
 */

import { parseBranch } from "../core/branch-parser";
import {
  formatMinutes,
  formatStopwatch,
  parseDuration,
  progressBar,
} from "../util/duration";
import { normalizeHex } from "../util/color";
import { normalizeBaseUrl } from "../api/client";

let failures = 0;

function eq(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        esperado ${e}\n        obtido   ${a}`}`);
}

console.log("── parseDuration ──");
eq('"2" → 120', parseDuration("2"), { ok: true, minutes: 120 });
eq('"2.5" → 150', parseDuration("2.5"), { ok: true, minutes: 150 });
eq('"2,5" → 150', parseDuration("2,5"), { ok: true, minutes: 150 });
eq('"2h30" → 150', parseDuration("2h30"), { ok: true, minutes: 150 });
eq('"2h" → 120', parseDuration("2h"), { ok: true, minutes: 120 });
eq('"2h30m" → 150', parseDuration("2h30m"), { ok: true, minutes: 150 });
eq('"150m" → 150', parseDuration("150m"), { ok: true, minutes: 150 });
eq('"150 min" → 150', parseDuration("150 min"), { ok: true, minutes: 150 });
eq('"90 minutos" → 90', parseDuration("90 minutos"), { ok: true, minutes: 90 });
eq('"2:30" → 150', parseDuration("2:30"), { ok: true, minutes: 150 });
eq('":45" → 45', parseDuration(":45"), { ok: true, minutes: 45 });
eq('"1,5 hora" → 90', parseDuration("1,5 hora"), { ok: true, minutes: 90 });
eq('"3 horas" → 180', parseDuration("3 horas"), { ok: true, minutes: 180 });
eq('" 2h30 " tolera espaços', parseDuration("  2h30  "), { ok: true, minutes: 150 });
eq('"0" rejeitado (< 1 min)', parseDuration("0").ok, false);
eq('"25" rejeitado (> 24h)', parseDuration("25").ok, false);
eq('"abc" rejeitado', parseDuration("abc").ok, false);
eq('"" rejeitado', parseDuration("").ok, false);
eq('"24" aceito (limite)', parseDuration("24"), { ok: true, minutes: 1440 });

console.log("\n── formatMinutes ──");
eq("450 → 7h30", formatMinutes(450), "7h30");
eq("45 → 45m", formatMinutes(45), "45m");
eq("120 → 2h", formatMinutes(120), "2h");
eq("0 → 0m", formatMinutes(0), "0m");
eq("65 → 1h05 (zero-padded)", formatMinutes(65), "1h05");
eq("negativo → 0m", formatMinutes(-10), "0m");

console.log("\n── formatStopwatch ──");
eq("5025s → 1:23:45", formatStopwatch(5025), "1:23:45");
eq("727s → 12:07", formatStopwatch(727), "12:07");
eq("0s → 00:00", formatStopwatch(0), "00:00");
eq("negativo → 00:00", formatStopwatch(-5), "00:00");

console.log("\n── progressBar ──");
eq("meio cheio", progressBar(4, 8, 8), "████░░░░");
eq("vazio", progressBar(0, 8, 4), "░░░░");
eq("cheio", progressBar(8, 8, 4), "████");
eq("acima do total satura", progressBar(20, 8, 4), "████");
eq("total zero", progressBar(1, 0, 3), "───");

console.log("\n── parseBranch ──");
eq(
  "feat/OPT-452-auth-flow",
  parseBranch("feat/OPT-452-auth-flow"),
  { workItemId: 452, projectCode: "OPT", slugDescription: "Auth flow" },
);
eq(
  "users/marcus/OPT-452",
  parseBranch("users/marcus/OPT-452"),
  { workItemId: 452, projectCode: "OPT", slugDescription: "Marcus" },
);
eq(
  "bugfix/AB#1234-null-check",
  parseBranch("bugfix/AB#1234-null-check"),
  { workItemId: 1234, projectCode: null, slugDescription: "Null check" },
);
eq(
  "feature/452-login-page",
  parseBranch("feature/452-login-page"),
  { workItemId: 452, projectCode: null, slugDescription: "Login page" },
);
eq(
  "OPT-7",
  parseBranch("OPT-7"),
  { workItemId: 7, projectCode: "OPT", slugDescription: null },
);
eq(
  "sem número",
  parseBranch("refactor/cleanup-imports"),
  { workItemId: null, projectCode: null, slugDescription: "Cleanup imports" },
);
eq(
  "prefixo de tipo não vira projeto",
  parseBranch("fix-123-thing").projectCode,
  null,
);
eq(
  "padrão extra do usuário tem prioridade",
  parseBranch("ticket/9911-algo", ["^ticket/(?<id>\\d+)"]).workItemId,
  9911,
);
eq(
  "padrão extra inválido não quebra",
  parseBranch("feat/OPT-452-x", ["([unclosed"]).workItemId,
  452,
);
eq(
  "número longo não é truncado",
  parseBranch("feat/OPT-4521-x").workItemId,
  4521,
);
eq(
  "código minúsculo vira maiúsculo",
  parseBranch("hotfix/opt-89-cache"),
  { workItemId: 89, projectCode: "OPT", slugDescription: "Cache" },
);
eq(
  "separador underscore",
  parseBranch("feat/OPT_452_auth_flow"),
  { workItemId: 452, projectCode: "OPT", slugDescription: "Auth flow" },
);
eq("branch vazia", parseBranch("").workItemId, null);

console.log("\n── normalizeHex ──");
eq("#F97316 → #f97316", normalizeHex("#F97316"), "#f97316");
eq("f97316 sem # → #f97316", normalizeHex("f97316"), "#f97316");
eq("#abc expande", normalizeHex("#abc"), "#aabbcc");
eq("inválido → null", normalizeHex("laranja"), null);
eq("null → null", normalizeHex(null), null);
eq("injeção rejeitada", normalizeHex('#fff"/><script>'), null);

console.log("\n── normalizeBaseUrl ──");
eq("remove barra final", normalizeBaseUrl("https://x.com/"), "https://x.com");
eq("remove /api/v1", normalizeBaseUrl("https://x.com/api/v1"), "https://x.com");
eq("remove /api/v1/me", normalizeBaseUrl("https://x.com/api/v1/me"), "https://x.com");
eq("preserva o resto", normalizeBaseUrl("https://x.com/opt"), "https://x.com/opt");

console.log(`\n${failures === 0 ? "TODOS OS CHECKS PASSARAM" : `${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
