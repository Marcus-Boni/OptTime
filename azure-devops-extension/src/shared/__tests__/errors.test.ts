import {
  ApiError,
  describeApiError,
  diagnoseNetworkFailure,
  kindForStatus,
} from "../errors";

/**
 * Testes de comportamento para a classificação de falhas de API.
 *
 * Cobre o cenário exato do incidente de 2026-08-25: bloqueio de CORS no Azure
 * App Service fazendo a extensão acusar "Token inválido" quando a causa real
 * era outra. Framework-free de propósito — são funções puras sobre valores
 * simples, e um runner seria mais maquinário do que os testes.
 *
 * Executar com `npm test`.
 */

const API = "https://opt-time.optsolv.com.br";
const ORIGIN = "https://optsolvtimetracker.gallery.vsassets.io";

let failures = 0;

function check(label: string, condition: boolean, extra = ""): void {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}

function contains(label: string, haystack: string, needle: string): void {
  check(label, haystack.includes(needle), haystack.includes(needle) ? "" : `obtido: "${haystack}"`);
}

// `diagnoseNetworkFailure` lê `window`/`navigator` só na hora da chamada,
// então basta plantar os globais antes de cada cenário.
(globalThis as Record<string, unknown>).window = {
  location: { origin: ORIGIN },
};

function setOnLine(value: boolean): void {
  // `navigator` no Node é getter-only; redefinir a propriedade é necessário
  // porque uma atribuição direta seria ignorada em silêncio.
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: value },
    configurable: true,
    writable: true,
  });
}
setOnLine(true);

function setFetch(
  impl: (url: string, init?: { mode?: string }) => Promise<unknown>,
): void {
  (globalThis as Record<string, unknown>).fetch = impl as unknown;
}

async function run(): Promise<void> {
  console.log("── diagnoseNetworkFailure ──");

  // Cenário do incidente: o servidor está no ar (a sonda no-cors passa), mas
  // a chamada real foi recusada pela camada de CORS do Azure App Service.
  setFetch((_url, init) =>
    init?.mode === "no-cors"
      ? Promise.resolve({ type: "opaque" })
      : Promise.reject(new TypeError("Failed to fetch")),
  );
  const blocked = await diagnoseNetworkFailure(API);
  check('servidor no ar + chamada recusada → "blocked"', blocked === "blocked", blocked);

  // Aplicação fora do ar: nem a sonda passa.
  setFetch(() => Promise.reject(new TypeError("Failed to fetch")));
  const unreachable = await diagnoseNetworkFailure(API);
  check('host inacessível → "unreachable"', unreachable === "unreachable", unreachable);

  // Sem rede: o navegador já sabe, nem vale sondar.
  setOnLine(false);
  const offline = await diagnoseNetworkFailure(API);
  check('navigator.onLine false → "offline"', offline === "offline", offline);
  setOnLine(true);

  console.log("\n── kindForStatus ──");
  check("401 → unauthorized", kindForStatus(401) === "unauthorized");
  check("403 → forbidden", kindForStatus(403) === "forbidden");
  check("404 → notFound", kindForStatus(404) === "notFound");
  check("409 → conflict", kindForStatus(409) === "conflict");
  check("500 → server", kindForStatus(500) === "server");
  check("502 → server", kindForStatus(502) === "server");
  check("418 → http", kindForStatus(418) === "http");

  console.log("\n── describeApiError: o incidente de 2026-08-25 ──");
  const corsMsg = describeApiError(
    new ApiError("blocked", `Falha ao chamar ${API}.`, { target: API }),
    "conectar",
  );
  console.log(`        "${corsMsg}"`);
  contains("cita o host", corsMsg, API);
  contains("nomeia CORS", corsMsg, "CORS");
  contains("informa a origem a liberar", corsMsg, ORIGIN);
  contains("inocenta o token", corsMsg, "Não é problema do seu token");
  check("host sem pontuação grudada", !corsMsg.includes("com.br."), corsMsg.slice(0, 60));
  check("NÃO acusa o token", !corsMsg.includes("Token inválido"));

  console.log("\n── describeApiError: demais casos ──");
  const cases: Array<[string, ApiError, string[], string[], string]> = [
    [
      "401 acusa o token",
      new ApiError("unauthorized", "x", { status: 401 }),
      ["Token inválido ou revogado"],
      ["CORS"],
      "conectar",
    ],
    [
      "404 aponta a URL",
      new ApiError("notFound", `${API} respondeu 404.`, { status: 404, target: API }),
      ["raiz da aplicação"],
      ["Token inválido"],
      "conectar",
    ],
    [
      "unreachable fala em URL/app no ar",
      new ApiError("unreachable", `Falha ao chamar ${API}.`, { target: API }),
      ["Não foi possível alcançar", API],
      ["Token inválido"],
      "conectar",
    ],
    [
      "offline fala em internet",
      new ApiError("offline", "x"),
      ["Sem conexão de rede"],
      ["Token inválido"],
      "conectar",
    ],
    [
      "500 mostra o status",
      new ApiError("server", "x", { status: 500 }),
      ["500"],
      ["Token inválido"],
      "conectar",
    ],
    [
      "409 repassa a mensagem do servidor",
      new ApiError("conflict", "A semana já foi submetida.", { status: 409 }),
      ["A semana já foi submetida."],
      ["Token inválido"],
      "conectar",
    ],
    [
      "403 usa a ação no texto",
      new ApiError("forbidden", "x", { status: 403 }),
      ["permissão", "registrar as horas"],
      [],
      "registrar as horas",
    ],
  ];

  for (const [label, error, expected, forbidden, action] of cases) {
    const msg = describeApiError(error, action);
    const ok =
      expected.every((e) => msg.includes(e)) && forbidden.every((f) => !msg.includes(f));
    check(label, ok, ok ? "" : `obtido: "${msg}"`);
  }

  console.log("\n── erro desconhecido não vira acusação ──");
  const unknown = describeApiError(new TypeError("boom"), "conectar");
  check("erro fora do domínio → mensagem neutra", !unknown.includes("Token inválido"), unknown);

  console.log("\n── flags de conveniência ──");
  check(
    "blocked é problema de conectividade, não de credencial",
    new ApiError("blocked", "x").isConnectivityProblem &&
      !new ApiError("blocked", "x").isCredentialProblem,
  );
  check(
    "unauthorized é problema de credencial",
    new ApiError("unauthorized", "x").isCredentialProblem,
  );

  console.log(`\n${failures === 0 ? "TODOS OS CHECKS PASSARAM" : `${failures} FALHA(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void run();
