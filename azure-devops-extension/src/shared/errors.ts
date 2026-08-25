/**
 * Falhas de API com causa preservada.
 *
 * Antes, qualquer exceção virava "Token inválido ou URL incorreta" — o que
 * mandou a investigação de um bloqueio de CORS em produção para o lado errado
 * por um bom tempo. O problema não era a mensagem em si: era o `catch` não ter
 * como saber o que tinha acontecido.
 *
 * Aqui a causa é classificada uma vez, no ponto em que ainda se sabe o que
 * falhou, e carregada até a tela.
 */

export type ApiFailureKind =
  /** Sem rede: o próprio navegador informa que está offline. */
  | "offline"
  /** O host não respondeu — DNS, TLS, aplicação fora do ar. */
  | "unreachable"
  /** O host respondeu, mas recusou a chamada da extensão (CORS). */
  | "blocked"
  /** `fetch` falhou e não foi possível refinar o motivo. */
  | "network"
  /** 401 — token ausente, inválido ou revogado. */
  | "unauthorized"
  /** 403 — autenticado, mas sem permissão. */
  | "forbidden"
  /** 404 — rota inexistente; normalmente a URL não é a raiz da aplicação. */
  | "notFound"
  /** 409 — regra de negócio, como período de timesheet bloqueado. */
  | "conflict"
  /** 5xx. */
  | "server"
  /** Qualquer outro status fora da faixa 2xx. */
  | "http";

export class ApiError extends Error {
  readonly kind: ApiFailureKind;
  readonly status: number | null;
  /** Corpo da resposta, quando houver — útil no console, não na tela. */
  readonly detail: string | null;
  /**
   * Base da API que estava sendo chamada.
   *
   * Campo próprio, e não algo a extrair da mensagem: a primeira versão pescava
   * a URL com regex e trazia junto o ponto final da frase, imprimindo
   * "https://opt-time.optsolv.com.br. respondeu".
   */
  readonly target: string | null;

  constructor(
    kind: ApiFailureKind,
    message: string,
    options: {
      status?: number | null;
      detail?: string | null;
      target?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.detail = options.detail ?? null;
    this.target = options.target ?? null;
  }

  /** True quando reconfigurar as credenciais tende a resolver. */
  get isCredentialProblem(): boolean {
    return this.kind === "unauthorized";
  }

  /** True quando o problema está entre a extensão e o servidor. */
  get isConnectivityProblem(): boolean {
    return (
      this.kind === "offline" ||
      this.kind === "unreachable" ||
      this.kind === "blocked" ||
      this.kind === "network"
    );
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Classifica uma resposta HTTP fora da faixa 2xx. */
export function kindForStatus(status: number): ApiFailureKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";
  return "http";
}

/**
 * Descobre por que o `fetch` foi rejeitado.
 *
 * O navegador entrega `TypeError: Failed to fetch` tanto para "sem rede" quanto
 * para "bloqueado por CORS" — a indistinção é proposital, para não vazar
 * informação sobre hosts internos. Mas dá para inferir de fora: uma requisição
 * `no-cors` completa sempre que o host está acessível, porque o navegador nem
 * tenta ler a resposta. Se ela passa e a chamada real não passou, o servidor
 * está no ar e quem recusou foi a camada de CORS.
 */
export async function diagnoseNetworkFailure(
  apiUrl: string,
): Promise<ApiFailureKind> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }

  try {
    await fetch(`${apiUrl}/api/health`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
    });
    return "blocked";
  } catch {
    return "unreachable";
  }
}

/**
 * Mensagem para a tela.
 *
 * `action` completa a frase — "não foi possível iniciar o timer" — para que o
 * mesmo erro se explique no contexto de quem o provocou.
 */
export function describeApiError(error: unknown, action: string): string {
  if (!isApiError(error)) {
    return `Não foi possível ${action}. Tente novamente.`;
  }

  const host = error.target ?? "o servidor";

  switch (error.kind) {
    case "offline":
      return "Sem conexão de rede. Verifique sua internet e tente novamente.";

    case "unreachable":
      return `Não foi possível alcançar ${host}. Confirme se a URL está correta e se a aplicação está no ar.`;

    case "blocked":
      return (
        `${host} respondeu, mas recusou a chamada da extensão — bloqueio de CORS. ` +
        `Peça para liberarem a origem ${currentOrigin()} no servidor. ` +
        "Não é problema do seu token."
      );

    case "network":
      return `Falha de comunicação com ${host}. Verifique a rede e tente novamente.`;

    case "unauthorized":
      return "Token inválido ou revogado. Gere um novo Token de Extensão na aplicação e reconecte.";

    case "forbidden":
      return `Seu usuário não tem permissão para ${action}.`;

    case "notFound":
      return `Rota não encontrada em ${host}. Confirme que a URL aponta para a raiz da aplicação, sem /api no final.`;

    case "conflict":
      // O servidor manda o motivo em português e ele é mais específico do que
      // qualquer texto genérico que a extensão pudesse montar.
      return error.message;

    case "server":
      return `A aplicação retornou erro ${error.status}. Tente novamente em instantes.`;

    default:
      return `Não foi possível ${action} (HTTP ${error.status}).`;
  }
}

/**
 * Registra o erro completo no console.
 *
 * A tela recebe uma frase; o suporte precisa do status, do corpo e da origem.
 */
export function logApiError(context: string, error: unknown): void {
  if (isApiError(error)) {
    console.error(`[OptSolv Extension] ${context}:`, {
      kind: error.kind,
      status: error.status,
      message: error.message,
      detail: error.detail,
      origin: currentOrigin(),
    });
    return;
  }

  console.error(`[OptSolv Extension] ${context}:`, error);
}

function currentOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "a extensão";
}

