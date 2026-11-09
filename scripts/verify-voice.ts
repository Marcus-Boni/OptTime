/** Real React/browser voice hand-off regression checks; synthetic APIs only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";

interface Bundler {
  build: (
    options: Record<string, unknown>,
  ) => Promise<{ outputFiles: { text: string }[] }>;
}

async function main(): Promise<void> {
  const require = createRequire(import.meta.url);
  const bundler = createRequire(require.resolve("tsx/package.json"))(
    "esbuild",
  ) as Bundler;
  const fixture = resolve("scripts/voice-e2e");
  const bundle = await bundler.build({
    entryPoints: [resolve(fixture, "browser.tsx")],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    sourcemap: "inline",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "synthetic-platform",
        setup(build: {
          onResolve: (
            options: { filter: RegExp },
            callback: () => { path: string },
          ) => void;
        }): void {
          build.onResolve(
            { filter: /^(@\/lib\/auth-client|next\/navigation|next\/link)$/ },
            () => ({ path: resolve(fixture, "platform.tsx") }),
          );
        },
      },
    ],
  });
  const server = createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/bundle.js"
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8",
    );
    res.end(
      req.url === "/bundle.js"
        ? bundle.outputFiles[0].text
        : '<!doctype html><html lang="pt-BR"><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : { channel: process.env.VOICE_BROWSER_CHANNEL ?? "chrome" }),
    headless: true,
  });
  try {
    const failures: string[] = [];
    let passed = 0;
    async function check(
      name: string,
      run: (page: Page) => Promise<void>,
    ): Promise<void> {
      if (
        process.env.VOICE_TEST_FILTER &&
        !name.includes(process.env.VOICE_TEST_FILTER)
      )
        return;
      const page = await browser.newPage({ reducedMotion: "reduce" });
      page.setDefaultTimeout(4_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) =>
        new URL(route.request().url()).hostname === "127.0.0.1"
          ? route.continue()
          : route.abort(),
      );
      try {
        await page.goto(`http://127.0.0.1:${port}`);
        await page.waitForFunction(() => Boolean(window.voiceHarness));
        await run(page);
        assert.deepEqual(errors, [], "Browser must not crash");
        passed++;
        console.log(`✓ ${name}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(name);
        console.error(`✗ ${name}: ${message}`);
        console.error(
          JSON.stringify({
            requests: await page.evaluate(() => window.voiceHarness?.requests),
            recognition: await page.evaluate(() =>
              window.voiceHarness?.recognition.stats(),
            ),
            errors,
          }),
        );
      } finally {
        await page.close();
      }
    }
    async function reply(page: Page, index = 1): Promise<void> {
      await page
        .getByText(`Resposta sintética ${index}`, { exact: true })
        .waitFor();
    }
    async function probe(page: Page): Promise<void> {
      await page.evaluate(() => window.voiceHarness.mount({ probe: true }));
      await page
        .getByRole("button", { name: "Start probe", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="speech-status"]')
            ?.textContent === "listening",
      );
    }
    async function results(page: Page): Promise<string[]> {
      return JSON.parse(
        (await page.getByTestId("speech-results").textContent()) ?? "[]",
      ) as string[];
    }

    await check(
      "StrictMode preserves parked command and one visible response",
      async (page): Promise<void> => {
        await page.evaluate(() =>
          window.voiceHarness.mount({
            queued: "Comando estacionado de verificação",
          }),
        );
        await reply(page);
        const requests = await page.evaluate(
          () => window.voiceHarness.requests,
        );
        assert.equal(requests.length, 1);
        assert.equal(
          requests[0].aborted,
          false,
          "StrictMode replay must not abort accepted voice command",
        );
        assert.equal(
          await page.getByText("Resposta sintética 1", { exact: true }).count(),
          1,
        );
      },
    );
    await check(
      "Parked command waits for late authenticated session",
      async (page): Promise<void> => {
        await page.evaluate(() =>
          window.voiceHarness.mount({
            queued: "Comando após autenticação",
            authReady: false,
          }),
        );
        await page.waitForTimeout(180);
        assert.equal(
          await page.evaluate(() => window.voiceHarness.requests.length),
          0,
        );
        await page.evaluate(() => window.voiceHarness.setAuth(true));
        await reply(page);
        assert.equal(
          await page.evaluate(() => window.voiceHarness.requests.length),
          1,
        );
      },
    );
    await check(
      "Two distinct utterances may use identical words",
      async (page): Promise<void> => {
        await page.evaluate(() => window.voiceHarness.mount());
        await page.waitForTimeout(100);
        await page.evaluate(() =>
          window.voiceHarness.queue("Quantas horas hoje?"),
        );
        await reply(page);
        await page.evaluate(() =>
          window.voiceHarness.queue("Quantas horas hoje?"),
        );
        await reply(page, 2);
        assert.equal(
          await page.evaluate(() => window.voiceHarness.requests.length),
          2,
        );
      },
    );
    await check(
      "Replacement aborts old request and preserves new response",
      async (page): Promise<void> => {
        await page.evaluate(() => {
          window.voiceHarness.setResponseDelay(500);
          window.voiceHarness.mount();
        });
        await page.waitForTimeout(100);
        await page.evaluate(() =>
          window.voiceHarness.queue("Primeiro comando"),
        );
        await page.waitForFunction(
          () => window.voiceHarness.requests.length === 1,
        );
        await page.evaluate(() =>
          window.voiceHarness.queue("Comando substituto"),
        );
        await reply(page, 2);
        const requests = await page.evaluate(
          () => window.voiceHarness.requests,
        );
        assert.equal(requests[0].aborted, true);
        assert.equal(requests[1].aborted, false);
      },
    );
    await check(
      "Speechend before any result still stops and accepts late final",
      async (page): Promise<void> => {
        await probe(page);
        await page.evaluate(() => window.voiceHarness.recognition.speechEnd());
        await page.waitForFunction(
          () => window.voiceHarness.recognition.stats().stops > 0,
        );
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "Frase final recebida após speechend",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="speech-results"]')
              ?.textContent !== "[]",
        );
        assert.deepEqual(await results(page), [
          "Frase final recebida após speechend",
        ]);
      },
    );
    await check(
      "Manual stop waits for full final instead of sending interim",
      async (page): Promise<void> => {
        await probe(page);
        await page.evaluate(() =>
          window.voiceHarness.recognition.result("registre uma", false),
        );
        await page
          .getByRole("button", { name: "Stop probe", exact: true })
          .click();
        assert.deepEqual(await results(page), []);
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "registre uma hora no projeto",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="speech-results"]')
              ?.textContent !== "[]",
        );
        assert.deepEqual(await results(page), ["registre uma hora no projeto"]);
      },
    );
    await check(
      "Natural end sends completed utterance once without restarting",
      async (page): Promise<void> => {
        await probe(page);
        const starts = await page.evaluate(
          () => window.voiceHarness.recognition.stats().starts,
        );
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "Comando final em silêncio",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="speech-results"]')
              ?.textContent !== "[]",
        );
        assert.deepEqual(await results(page), ["Comando final em silêncio"]);
        assert.equal(
          await page.evaluate(
            () => window.voiceHarness.recognition.stats().starts,
          ),
          starts,
        );
      },
    );
    await check(
      "Overlay manual send waits for late final recognition",
      async (page): Promise<void> => {
        await page.evaluate(() => window.voiceHarness.mount({ overlay: true }));
        await page
          .getByRole("button", { name: "Parar", exact: true })
          .waitFor();
        await page.evaluate(() =>
          window.voiceHarness.recognition.result("registre uma", false),
        );
        await page
          .getByRole("button", { name: "Enviar agora", exact: true })
          .click();
        assert.equal(
          await page.evaluate(() => window.voiceHarness.requests.length),
          0,
        );
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "registre uma hora de revisão técnica",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await reply(page);
        const requests = await page.evaluate(
          () => window.voiceHarness.requests,
        );
        assert.equal(requests.length, 1);
        assert.equal(
          requests[0].message,
          "registre uma hora de revisão técnica",
        );
      },
    );
    await check(
      "Overlay dismissal cancels delivery; reopen sends a new utterance",
      async (page): Promise<void> => {
        await page.evaluate(() => window.voiceHarness.mount({ overlay: true }));
        await page
          .getByRole("button", { name: "Parar", exact: true })
          .waitFor();
        await page.evaluate(() =>
          window.voiceHarness.recognition.result(
            "Não enviar este rascunho",
            false,
          ),
        );
        await page
          .getByRole("button", { name: "Fechar o modo de voz", exact: true })
          .click();
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "Rascunho tardio cancelado",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await page.waitForTimeout(150);
        assert.equal(
          await page.evaluate(() => window.voiceHarness.requests.length),
          0,
        );
        await page
          .getByRole("button", { name: "Abrir voz de teste", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Parar", exact: true })
          .waitFor();
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "Novo comando após reabrir",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await reply(page);
        const requests = await page.evaluate(
          () => window.voiceHarness.requests,
        );
        assert.equal(requests.length, 1);
        assert.equal(requests[0].message, "Novo comando após reabrir");
      },
    );
    for (const final of [true, false]) {
      await check(
        `Overlay auto-sends ${final ? "final" : "interim"} transcript with missing speech-end events`,
        async (page): Promise<void> => {
          await page.evaluate(() =>
            window.voiceHarness.mount({ overlay: true }),
          );
          await page
            .getByRole("button", { name: "Parar", exact: true })
            .waitFor();
          const text = final
            ? "Comando final sem eventos de encerramento"
            : "Comando provisório sem eventos de encerramento";
          await page.evaluate(
            ({ text, final }) => {
              window.voiceHarness.recognition.speechStart();
              window.voiceHarness.recognition.result(text, final);
            },
            { text, final },
          );
          // No speechend/end or button clicks: transcript inactivity must finish it.
          await page.waitForFunction(
            () => window.voiceHarness.requests.length === 1,
            undefined,
            { timeout: 6500 },
          );
          await reply(page);
          await page.waitForTimeout(650);
          const requests = await page.evaluate(
            () => window.voiceHarness.requests,
          );
          assert.equal(requests.length, 1);
          assert.equal(requests[0].message, text);
          assert.equal(requests[0].aborted, false);
        },
      );
    }
    await check(
      "Ongoing transcript updates postpone auto-send beyond silence duration",
      async (page): Promise<void> => {
        await page.evaluate(() => window.voiceHarness.mount({ overlay: true }));
        await page
          .getByRole("button", { name: "Parar", exact: true })
          .waitFor();
        const initialStops = await page.evaluate(
          () => window.voiceHarness.recognition.stats().stops,
        );
        await page.evaluate(() =>
          window.voiceHarness.recognition.speechStart(),
        );
        // Actual continuing speech produces fresh transcript events. Keep them
        // coming more often than 1.8s, over a total longer than that threshold.
        for (let part = 1; part <= 4; part++) {
          await page.evaluate(
            (part) =>
              window.voiceHarness.recognition.result(
                `Frase em andamento parte ${part}`,
                false,
              ),
            part,
          );
          await page.waitForTimeout(650);
        }
        assert.equal(
          await page.evaluate(() => window.voiceHarness.requests.length),
          0,
        );
        assert.equal(
          await page.evaluate(
            () => window.voiceHarness.recognition.stats().stops,
          ),
          initialStops,
        );
        // Then stop updating, without speechend: inactivity alone must stop it.
        await page.waitForFunction(
          (before) => window.voiceHarness.recognition.stats().stops > before,
          initialStops,
        );
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "Frase em andamento concluída depois da pausa",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await reply(page);
        assert.equal(
          await page.evaluate(() => window.voiceHarness.requests[0].message),
          "Frase em andamento concluída depois da pausa",
        );
      },
    );
    await check(
      "Manual edit after stopping dictation survives its late final",
      async (page): Promise<void> => {
        await page.evaluate(() => window.voiceHarness.mount());
        await page
          .getByRole("button", { name: "Ditar por voz", exact: true })
          .click();
        await page.evaluate(() =>
          window.voiceHarness.recognition.result("Rascunho inicial", false),
        );
        await page.waitForFunction(
          () =>
            document.querySelector("textarea")?.value === "Rascunho inicial",
        );
        await page
          .getByRole("button", { name: "Parar ditado", exact: true })
          .click();
        await page.locator("textarea").fill("Texto corrigido manualmente");
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "Rascunho inicial completo",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await page.waitForTimeout(120);
        assert.equal(
          await page.locator("textarea").inputValue(),
          "Texto corrigido manualmente",
          "Late recognition must not overwrite a manual edit",
        );
        assert.equal(
          await page.evaluate(() => window.voiceHarness.requests.length),
          0,
        );
      },
    );
    await check(
      "Composer late final cannot repopulate an explicitly sent draft",
      async (page): Promise<void> => {
        await page.evaluate(() => window.voiceHarness.mount());
        await page
          .getByRole("button", { name: "Ditar por voz", exact: true })
          .click();
        await page.evaluate(() =>
          window.voiceHarness.recognition.result(
            "Ditado enviado explicitamente",
            false,
          ),
        );
        await page.waitForFunction(
          () =>
            document.querySelector("textarea")?.value ===
            "Ditado enviado explicitamente",
        );
        await page
          .getByRole("button", { name: "Enviar mensagem", exact: true })
          .click();
        await page.evaluate(() => {
          window.voiceHarness.recognition.result(
            "Ditado enviado explicitamente com final tardio",
            true,
          );
          window.voiceHarness.recognition.end();
        });
        await reply(page);
        assert.equal(await page.locator("textarea").inputValue(), "");
        const requests = await page.evaluate(
          () => window.voiceHarness.requests,
        );
        assert.equal(requests.length, 1);
        assert.equal(requests[0].message, "Ditado enviado explicitamente");
      },
    );
    await check(
      "Unsupported recognition stays unsupported without sending",
      async (page): Promise<void> => {
        await page.evaluate(() => {
          window.voiceHarness.recognition.supported(false);
          window.voiceHarness.mount({ probe: true });
        });
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="speech-status"]')
              ?.textContent === "unsupported",
        );
        await page
          .getByRole("button", { name: "Start probe", exact: true })
          .click();
        assert.deepEqual(await results(page), []);
      },
    );
    await check(
      "Denied microphone reports failure without sending",
      async (page): Promise<void> => {
        await probe(page);
        await page.evaluate(() => {
          window.voiceHarness.recognition.error("not-allowed");
          window.voiceHarness.recognition.end();
        });
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="speech-status"]')
              ?.textContent === "denied",
        );
        assert.deepEqual(await results(page), []);
        assert.match(
          (await page.getByTestId("speech-error").textContent()) ?? "",
          /negada|bloqueou/,
        );
      },
    );
    await check(
      "No-speech exposes retry feedback and never invents a command",
      async (page): Promise<void> => {
        await probe(page);
        await page.evaluate(() => {
          window.voiceHarness.recognition.error("no-speech");
          window.voiceHarness.recognition.end();
        });
        await page.waitForFunction(() =>
          Boolean(
            document.querySelector('[data-testid="speech-error"]')?.textContent,
          ),
        );
        assert.deepEqual(await results(page), []);
      },
    );
    await check(
      "Migrates pre-existing localStorage threads to PostgreSQL via PUT /api/ai/threads",
      async (page): Promise<void> => {
        await page.evaluate(() => {
          const now = Date.now();
          localStorage.setItem(
            "timebot_chat_v3_voice-test-user",
            JSON.stringify({
              activeThreadId: "legacy-local-thread",
              threads: [
                {
                  id: "legacy-local-thread",
                  title: "Conversa legada no navegador",
                  createdAt: now - 5000,
                  updatedAt: now - 1000,
                  messages: [
                    {
                      id: "msg-u-1",
                      role: "user",
                      content: "Pergunta salva no localStorage",
                      cards: [],
                      actions: [],
                      tools: [],
                      createdAt: now - 4000,
                    },
                    {
                      id: "msg-a-1",
                      role: "assistant",
                      content: "Resposta migrada automaticamente para o banco",
                      cards: [],
                      actions: [],
                      tools: [],
                      createdAt: now - 3000,
                    },
                  ],
                },
              ],
            }),
          );
          window.voiceHarness.mount();
        });
        await page
          .getByText("Resposta migrada automaticamente para o banco", {
            exact: true,
          })
          .waitFor();
        await page.waitForFunction(
          () => window.voiceHarness.threadSyncPayloads.length >= 1,
        );
        const synced = await page.evaluate(
          () => window.voiceHarness.threadSyncPayloads[0],
        );
        assert.equal(synced.activeThreadId, "legacy-local-thread");
        assert.equal(synced.threads.length, 1);
      },
    );
    await check(
      "Hydrates remote PostgreSQL threads and executed keys onto a clean browser",
      async (page): Promise<void> => {
        await page.evaluate(() => {
          const now = Date.now();
          window.voiceHarness.setServerThreads({
            activeThreadId: "remote-db-thread",
            executedKeys: ["plan:plan-remote-1"],
            threads: [
              {
                id: "remote-db-thread",
                title: "Conversa sincronizada do banco",
                createdAt: now - 8000,
                updatedAt: now - 2000,
                messages: [
                  {
                    id: "msg-r-1",
                    role: "user",
                    content: "Pergunta feita em outro dispositivo",
                    cards: [],
                    actions: [],
                    tools: [],
                    createdAt: now - 7000,
                  },
                  {
                    id: "msg-r-2",
                    role: "assistant",
                    content: "Resposta carregada do PostgreSQL",
                    cards: [],
                    actions: [],
                    tools: [],
                    createdAt: now - 6000,
                  },
                ],
              },
            ],
          });
          window.voiceHarness.mount();
        });
        await page
          .getByText("Resposta carregada do PostgreSQL", { exact: true })
          .waitFor();
        const executedRaw = await page.evaluate(() =>
          localStorage.getItem("optsolv:operator:executed:v1"),
        );
        assert.ok(
          executedRaw?.includes("plan:plan-remote-1"),
          "Remote executed keys must hydrate into local executed-store",
        );
      },
    );
    console.log(
      `Voice browser checks: ${passed} passed, ${failures.length} failed. Recognition/audio and server APIs are synthetic; React components/hooks are real.`,
    );
    assert.deepEqual(failures, [], "Voice browser regressions must pass");
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
