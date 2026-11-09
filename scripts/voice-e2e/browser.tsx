import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { VoiceCommandOverlay } from "@/components/ai/operator/VoiceCommandOverlay";
import { TimeBotChat } from "@/components/ai/TimeBotChat";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { DEFAULT_OPERATOR_SETTINGS } from "@/lib/ai/operator/types";
import { queueVoiceCommand } from "@/lib/ai/operator/voice-events";

export interface TestRequest {
  message: string;
  aborted: boolean;
}
export interface SyntheticThreadsState {
  activeThreadId: string;
  threads: unknown[];
  executedKeys: string[];
}
export interface VoiceHarnessApi {
  mount: (options?: {
    queued?: string;
    authReady?: boolean;
    overlay?: boolean;
    probe?: boolean;
  }) => void;
  queue: (text: string) => void;
  setAuth: (ready: boolean) => void;
  requests: TestRequest[];
  threadSyncPayloads: SyntheticThreadsState[];
  setServerThreads: (state: SyntheticThreadsState) => void;
  setResponseDelay: (milliseconds: number) => void;
  recognition: {
    result: (text: string, final: boolean) => void;
    speechStart: () => void;
    speechEnd: () => void;
    end: () => void;
    error: (code: SpeechRecognitionErrorCode) => void;
    stats: () => { starts: number; stops: number; instances: number };
    supported: (value: boolean) => void;
  };
}

declare global {
  interface Window {
    voiceHarness: VoiceHarnessApi;
    voiceAuthReady: boolean;
  }
}

window.voiceAuthReady = true;
const engines: SyntheticRecognition[] = [];
class SyntheticRecognition
  extends EventTarget
  implements SpeechRecognitionInstance
{
  lang = "pt-BR";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  starts = 0;
  stops = 0;
  onstart: SpeechRecognitionInstance["onstart"] = null;
  onend: SpeechRecognitionInstance["onend"] = null;
  onresult: SpeechRecognitionInstance["onresult"] = null;
  onerror: SpeechRecognitionInstance["onerror"] = null;
  onaudiostart: SpeechRecognitionInstance["onaudiostart"] = null;
  onspeechstart: SpeechRecognitionInstance["onspeechstart"] = null;
  onspeechend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null =
    null;
  constructor() {
    super();
    engines.push(this);
  }
  start(): void {
    this.starts++;
    this.onstart?.call(this, new Event("start"));
  }
  stop(): void {
    this.stops++;
  }
  abort(): void {}
  result(text: string, final: boolean): void {
    const alternative = { transcript: text, confidence: 1 };
    const result = Object.assign([alternative], {
      isFinal: final,
      item: (): SpeechRecognitionAlternative => alternative,
    });
    const results = Object.assign([result], {
      item: (): SpeechRecognitionResult => result,
    });
    this.onresult?.call(
      this,
      Object.assign(new Event("result"), { resultIndex: 0, results }),
    );
  }
}
window.SpeechRecognition = SyntheticRecognition;
window.webkitSpeechRecognition = undefined;
function engine(): SyntheticRecognition {
  const current = engines.at(-1);
  if (!current) throw new Error("No synthetic recognition session");
  return current;
}
const requests: TestRequest[] = [];
const threadSyncPayloads: SyntheticThreadsState[] = [];
let serverThreadsState: SyntheticThreadsState = {
  activeThreadId: "",
  threads: [],
  executedKeys: [],
};
let responseDelay = 60;
window.fetch = async (input, init): Promise<Response> => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href,
  );
  if (url.pathname === "/api/operator/policy") {
    return Response.json({
      settings: DEFAULT_OPERATOR_SETTINGS,
      actions: [],
      role: "member",
    });
  }
  if (url.pathname === "/api/projects") {
    return Response.json([]);
  }
  if (url.pathname === "/api/ai/threads") {
    if (init?.method === "PUT" && init.body) {
      const payload = JSON.parse(String(init.body)) as SyntheticThreadsState;
      threadSyncPayloads.push(payload);
      serverThreadsState = payload;
    }
    return Response.json(serverThreadsState);
  }
  if (url.pathname.startsWith("/api/ai/threads/")) {
    return Response.json({ deleted: true });
  }
  if (url.pathname === "/api/ai/context") {
    return Response.json({
      firstName: "Teste",
      role: "member",
      todayMinutes: 0,
      weekMinutes: 0,
      weekTargetMinutes: 2400,
      weekStatus: "open",
      pendingApprovals: 0,
      timer: {
        running: false,
        paused: false,
        projectName: null,
        elapsedMinutes: 0,
      },
      highlights: [],
      suggestions: [],
      providerConfigured: true,
    });
  }
  if (url.pathname === "/api/ai/chat") {
    const body = JSON.parse(String(init?.body)) as { message: string };
    const request = { message: body.message, aborted: false };
    requests.push(request);
    const index = requests.length;
    return new Promise<Response>((resolve, reject) => {
      const finish = (): void => {
        resolve(
          new Response(
            `data: ${JSON.stringify({ type: "text", delta: `Resposta sintética ${index}` })}\n\ndata: {"type":"done"}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } },
          ),
        );
      };
      const timer = setTimeout(finish, responseDelay);
      const abort = (): void => {
        clearTimeout(timer);
        request.aborted = true;
        reject(new DOMException("Synthetic abort", "AbortError"));
      };
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  }
  throw new Error(`Unexpected synthetic browser request: ${url.pathname}`);
};

function SpeechProbe() {
  const [results, setResults] = useState<string[]>([]);
  const speech = useSpeechRecognition({
    silenceTimeoutMs: 100,
    onResult: (text) => setResults((items) => [...items, text]),
  });
  return (
    <>
      <output data-testid="speech-status">{speech.status}</output>
      <output data-testid="speech-results">{JSON.stringify(results)}</output>
      <output data-testid="speech-error">{speech.errorMessage}</output>
      <button type="button" onClick={speech.start}>
        Start probe
      </button>
      <button type="button" onClick={speech.stop}>
        Stop probe
      </button>
    </>
  );
}

function Harness({ overlay, probe }: { overlay: boolean; probe: boolean }) {
  const [voiceOpen, setVoiceOpen] = useState(overlay);
  if (probe) return <SpeechProbe />;
  return (
    <>
      <button type="button" onClick={() => setVoiceOpen(true)}>
        Abrir voz de teste
      </button>
      <TimeBotChat
        activePath="/dashboard"
        isOpen
        mode="docked"
        isCompactViewport={false}
        titleId="voice-test-title"
        onToggleFullscreen={() => {}}
        onClose={() => {}}
        onOpenVoiceMode={() => setVoiceOpen(true)}
      />
      <VoiceCommandOverlay
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSubmit={(text) => queueVoiceCommand(text)}
      />
    </>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing test root");
const root = createRoot(container);
let generation = 0;
window.voiceHarness = {
  requests,
  threadSyncPayloads,
  setServerThreads: (state): void => {
    serverThreadsState = state;
  },
  setResponseDelay: (milliseconds): void => {
    responseDelay = milliseconds;
  },
  mount: ({
    queued,
    authReady = true,
    overlay = false,
    probe = false,
  } = {}): void => {
    window.voiceAuthReady = authReady;
    if (queued) queueVoiceCommand(queued);
    root.render(
      <StrictMode>
        <Harness key={++generation} overlay={overlay} probe={probe} />
      </StrictMode>,
    );
  },
  queue: (text): void => {
    queueVoiceCommand(text);
  },
  setAuth: (ready): void => {
    window.voiceAuthReady = ready;
    window.dispatchEvent(new Event("test:auth"));
  },
  recognition: {
    result: (text, final): void => engine().result(text, final),
    speechStart: (): void => {
      const current = engine();
      current.onspeechstart?.call(current, new Event("speechstart"));
    },
    speechEnd: (): void => {
      const current = engine();
      current.onspeechend?.call(current, new Event("speechend"));
    },
    end: (): void => {
      const current = engine();
      current.onend?.call(current, new Event("end"));
    },
    error: (code): void => {
      const current = engine();
      current.onerror?.call(
        current,
        Object.assign(new Event("error"), {
          error: code,
          message: "Synthetic error",
        }),
      );
    },
    stats: () => ({
      starts: engines.reduce((sum, item) => sum + item.starts, 0),
      stops: engines.reduce((sum, item) => sum + item.stops, 0),
      instances: engines.length,
    }),
    supported: (value): void => {
      window.SpeechRecognition = value ? SyntheticRecognition : undefined;
    },
  },
};
