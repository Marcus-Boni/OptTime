import { validateM2MToken } from "@/lib/integration/auth";
import { ApiError, toErrorResponse } from "@/lib/integration/errors";
import { createRequestId, logRequest } from "@/lib/integration/logger";
import {
  checkRateLimit,
  getRateLimitHeaders,
} from "@/lib/integration/rate-limit";
import { requireScope, SCOPES } from "@/lib/integration/scopes";
import {
  generateTimeEntriesReportPDF,
  getTimeEntriesReportData,
  timeEntriesReportQuerySchema,
} from "@/lib/reports/time-entries-report";

export async function GET(req: Request): Promise<Response> {
  const requestId = createRequestId(req);
  const start = Date.now();
  let clientId = "unknown";

  try {
    const ctx = await validateM2MToken(req);
    clientId = ctx.clientId;

    const rlHeaders = getRateLimitHeaders(clientId);
    if (!checkRateLimit(clientId)) {
      logRequest({
        requestId,
        clientId,
        route: "GET /api/v1/reports/time-entries",
        durationMs: Date.now() - start,
        status: 429,
      });

      return Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            details: null,
          },
        },
        { status: 429, headers: { ...rlHeaders, "X-Request-Id": requestId } },
      );
    }

    requireScope(ctx.scopes, SCOPES.READ);

    const { searchParams } = new URL(req.url);
    const parsed = timeEntriesReportQuerySchema.safeParse(
      Object.fromEntries(searchParams),
    );

    if (!parsed.success) {
      logRequest({
        requestId,
        clientId,
        route: "GET /api/v1/reports/time-entries",
        durationMs: Date.now() - start,
        status: 400,
      });

      return Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: parsed.error.flatten(),
          },
        },
        { status: 400, headers: { ...rlHeaders, "X-Request-Id": requestId } },
      );
    }

    const data = await getTimeEntriesReportData(parsed.data);

    const acceptHeader = req.headers.get("accept") ?? "";
    const wantsPdf =
      parsed.data.format === "pdf" || acceptHeader.includes("application/pdf");

    if (wantsPdf) {
      const pdfBytes = await generateTimeEntriesReportPDF(data);
      const rlHeadersFinal = getRateLimitHeaders(clientId);

      logRequest({
        requestId,
        clientId,
        route: "GET /api/v1/reports/time-entries (format=pdf)",
        durationMs: Date.now() - start,
        status: 200,
      });

      return new Response(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${data.pdfFilename}"`,
          "Content-Length": String(pdfBytes.byteLength),
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "X-Request-Id": requestId,
          ...rlHeadersFinal,
        },
      });
    }

    const rlHeadersFinal = getRateLimitHeaders(clientId);
    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/reports/time-entries",
      durationMs: Date.now() - start,
      status: 200,
    });

    return Response.json(data.report, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Request-Id": requestId,
        ...rlHeadersFinal,
      },
    });
  } catch (error: unknown) {
    const status = error instanceof ApiError ? error.status : 500;
    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/reports/time-entries",
      durationMs: Date.now() - start,
      status,
    });
    return toErrorResponse(error, requestId);
  }
}
