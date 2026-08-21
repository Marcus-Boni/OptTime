import * as vscode from "vscode";
import { normalizeHex } from "../util/color";
import type { Logger } from "../util/logger";

/**
 * Project-coloured dots for tree items.
 *
 * `TreeItem.iconPath` takes a `ThemeIcon` — which can only be tinted with
 * registered theme colours — or a file `Uri`. Projects carry arbitrary hex
 * colours from the database, so the only way to show the real colour is to
 * write a tiny SVG per colour and point at it.
 *
 * The files go in the extension's global storage, are 200 bytes each, and are
 * reused across sessions and workspaces.
 */

export class ProjectIcons implements vscode.Disposable {
  private readonly cache = new Map<string, vscode.Uri>();
  private readonly directory: vscode.Uri;
  private ready: Promise<void> | null = null;

  constructor(
    context: vscode.ExtensionContext,
    private readonly logger: Logger,
  ) {
    this.directory = vscode.Uri.joinPath(context.globalStorageUri, "swatches");
  }

  /**
   * Returns a coloured-dot icon for the given project colour.
   *
   * Falls back to a plain codicon when the colour is malformed or the file
   * cannot be written — a missing swatch is a cosmetic problem, and throwing
   * here would take a whole tree view down with it.
   */
  async dot(color: string | null | undefined): Promise<vscode.Uri | vscode.ThemeIcon> {
    const normalized = normalizeHex(color);
    if (!normalized) return new vscode.ThemeIcon("circle-filled");

    const cached = this.cache.get(normalized);
    if (cached) return cached;

    try {
      await this.ensureDirectory();

      const target = vscode.Uri.joinPath(
        this.directory,
        `dot-${normalized.slice(1)}.svg`,
      );
      await vscode.workspace.fs.writeFile(target, svgFor(normalized));

      this.cache.set(normalized, target);
      return target;
    } catch (error: unknown) {
      this.logger.debug(`Não foi possível gerar o ícone ${normalized}.`);
      this.logger.debug(String(error));
      return new vscode.ThemeIcon("circle-filled");
    }
  }

  private ensureDirectory(): Promise<void> {
    this.ready ??= Promise.resolve(
      vscode.workspace.fs.createDirectory(this.directory),
    ).then(() => undefined);
    return this.ready;
  }

  dispose(): void {
    this.cache.clear();
  }
}

export { normalizeHex };

function svgFor(hex: string): Uint8Array {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
    `<circle cx="8" cy="8" r="5" fill="${hex}"/>` +
    `</svg>`;

  return new TextEncoder().encode(svg);
}
