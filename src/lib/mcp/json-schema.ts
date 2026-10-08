/**
 * A small JSON Schema validator for the subset the MCP tool catalog uses.
 *
 * Tool `outputSchema`s are published to clients, which may validate
 * `structuredContent` against them. The project carries no JSON Schema library,
 * and the catalog only needs: `type` (single or list), `enum`, `properties`,
 * `required`, `items`, `minimum`/`maximum` and `additionalProperties: false`.
 * Anything fancier is deliberately unsupported — a schema this validator cannot
 * check is a schema a client would struggle to rely on.
 *
 * Used by the verification scripts, never on the request path: a data shape
 * that drifts must fail a test, not a user's tool call.
 */

export interface JsonSchemaNode {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean;
  description?: string;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

/** `integer` is also a valid `number`; everything else must match exactly. */
function matchesType(actual: string, expected: string): boolean {
  return actual === expected || (expected === "number" && actual === "integer");
}

/**
 * Validates `value` against `schema`.
 *
 * @returns One message per violation, each prefixed with its JSON path
 * (`$.events[2].start`). An empty list means the value conforms.
 */
export function validateAgainstSchema(
  value: unknown,
  rawSchema: object,
  path = "$",
): string[] {
  // Catalog schemas are typed loosely (`properties: Record<string, unknown>`);
  // this validator is the one place that reads them structurally.
  const schema = rawSchema as JsonSchemaNode;
  const errors: string[] = [];
  const actual = typeOf(value);

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((expected) => matchesType(actual, expected))) {
      return [`${path}: esperado ${allowed.join(" | ")}, recebido ${actual}`];
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(
      `${path}: ${JSON.stringify(value)} fora de [${schema.enum.map((item) => JSON.stringify(item)).join(", ")}]`,
    );
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: ${value} abaixo do mínimo ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: ${value} acima do máximo ${schema.maximum}`);
    }
  }

  if (actual === "object" && value !== null) {
    const record = value as Record<string, unknown>;

    for (const key of schema.required ?? []) {
      if (!(key in record) || record[key] === undefined) {
        errors.push(`${path}.${key}: campo obrigatório ausente`);
      }
    }

    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (record[key] !== undefined) {
        errors.push(
          ...validateAgainstSchema(record[key], child, `${path}.${key}`),
        );
      }
    }

    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(record)) {
        if (!known.has(key)) errors.push(`${path}.${key}: campo não previsto`);
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(
        ...validateAgainstSchema(
          item,
          schema.items as JsonSchemaNode,
          `${path}[${index}]`,
        ),
      );
    });
  }

  return errors;
}
