#!/usr/bin/env node
/**
 * Executable shim for `npx @optsolv/mcp-opt-time`.
 *
 * Kept as plain JS so the published package needs no loader flags. It only
 * resolves the compiled entry point and hands over — every failure is reported
 * on stderr, because stdout belongs to the MCP protocol.
 */

import { main } from "../dist/index.js";

main().catch((error) => {
  process.stderr.write(
    `[opt-time-mcp] falha ao iniciar: ${
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    }\n`,
  );
  process.exit(1);
});
