/**
 * Utility to extract user-friendly error messages from API responses.
 * Handles Zod flatten error details ({ error: "...", details: { fieldErrors: ... } }).
 */
export function extractApiErrorMessage(
  err: unknown,
  fallback = "Ocorreu um erro ao processar a solicitação.",
): string {
  if (!err || typeof err !== "object") return fallback;

  const errorObj = err as {
    error?: unknown;
    message?: unknown;
    details?: {
      fieldErrors?: Record<string, string[] | string>;
      formErrors?: string[];
    };
  };

  // 1. Check for detailed field errors (Zod flatten output)
  if (
    errorObj.details?.fieldErrors &&
    typeof errorObj.details.fieldErrors === "object"
  ) {
    const messages: string[] = [];
    const fieldLabels: Record<string, string> = {
      description: "Descrição",
      projectId: "Projeto",
      duration: "Duração",
      date: "Data",
      billable: "Faturável",
      azureWorkItemId: "Work Item",
      azureWorkItemTitle: "Título do Work Item",
      startTime: "Horário inicial",
      endTime: "Horário final",
    };

    for (const [field, msgs] of Object.entries(errorObj.details.fieldErrors)) {
      const fieldLabel = fieldLabels[field] ?? field;

      if (Array.isArray(msgs) && msgs.length > 0) {
        const formattedMsgs = msgs.map((m) => {
          if (typeof m === "string") {
            if (m.includes("Too big") || m.includes("<=")) {
              return "tamanho excede o limite máximo permitido (máximo de 2000 caracteres)";
            }
            if (m.includes("Required") || m.includes("cannot be empty")) {
              return "campo obrigatório";
            }
          }
          return String(m);
        });
        messages.push(`${fieldLabel}: ${formattedMsgs.join(", ")}`);
      } else if (typeof msgs === "string" && msgs) {
        messages.push(`${fieldLabel}: ${msgs}`);
      }
    }

    if (messages.length > 0) {
      return messages.join(". ");
    }
  }

  // 2. Check for form-level errors
  if (
    Array.isArray(errorObj.details?.formErrors) &&
    errorObj.details.formErrors.length > 0
  ) {
    return errorObj.details.formErrors.join(". ");
  }

  // 3. Check for top-level error string
  if (typeof errorObj.error === "string" && errorObj.error.trim()) {
    return errorObj.error;
  }

  // 4. Check for top-level message string
  if (typeof errorObj.message === "string" && errorObj.message.trim()) {
    return errorObj.message;
  }

  return fallback;
}
