/* OptSolv Time — launch film.
 * Every pixel is a pure function of the frame number: seek(f) sets the whole scene.
 * UI markup mirrors the real components (classes copied from src/components/**). */

const FPS = 30;
const DURATION = 720;

// ─── Math ────────────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  linear: (p) => p,
  outCubic: (p) => 1 - (1 - p) ** 3,
  inCubic: (p) => p ** 3,
  inOutCubic: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  outQuart: (p) => 1 - (1 - p) ** 4,
  outQuint: (p) => 1 - (1 - p) ** 5,
  inOutQuint: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2),
  outExpo: (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  inExpo: (p) => (p <= 0 ? 0 : 2 ** (10 * p - 10)),
  inOutExpo: (p) =>
    p <= 0
      ? 0
      : p >= 1
        ? 1
        : p < 0.5
          ? 2 ** (20 * p - 10) / 2
          : (2 - 2 ** (-20 * p + 10)) / 2,
  outBack: (p) => {
    const s = 1.5;
    return 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
  },
};
/** Eased progress of frame f through [a, b]. */
const P = (f, a, b, ease = E.linear) => ease(clamp((f - a) / (b - a)));
/** Damped spring 0 → 1 that starts at frame a. */
function spring(f, a, stiffness = 170, damping = 16) {
  const t = (f - a) / FPS;
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness);
  const z = damping / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return (
      1 -
      Math.exp(-z * w0 * t) *
        (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t))
    );
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}
/** Keyframe track: [[frame, value, ease?], ...]; the ease applies on the way into a key. */
function track(f, keys) {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1, ease] = keys[i];
    const [f0, v0] = keys[i - 1];
    if (f <= f1)
      return lerp(v0, v1, (ease || E.inOutCubic)(clamp((f - f0) / (f1 - f0))));
  }
  return keys[keys.length - 1][1];
}
/** Bell 0 → 1 → 0 across [a, b]. */
const bump = (f, a, b) => Math.sin(Math.PI * clamp((f - a) / (b - a)));

function formatDuration(minutes) {
  if (minutes <= 0) return "0min";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ─── Icons (real lucide-react nodes, see gen-icons.mjs) ──────────────
function ic(name, cls = "size-4", extra = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" ${extra}>${window.ICONS[name]}</svg>`;
}
const LOGO_PATHS = [
  "M20.4456 5.94912L10.1852 0.815186V3.94402L21.1289 9.41962V7.05441C21.1289 6.58606 20.8646 6.1581 20.4456 5.94862V5.94912Z",
  "M14.0962 17.213V15.7062C14.0962 14.9755 13.6647 14.3136 12.9964 14.0189L0.798737 8.63754V11.7664L11.3549 16.0683L11.3589 16.4594L11.3549 16.8504L0.798737 21.1524V24.2812L12.9964 18.8999C13.6647 18.6051 14.0962 17.9432 14.0962 17.2125V17.213Z",
  "M10.1852 32.1041L20.4456 26.9701C20.8641 26.7607 21.1289 26.3327 21.1289 25.8644V23.4991L10.1852 28.9747V32.1041Z",
  "M20.3538 14.368C20.3538 12.7779 19.4421 11.3284 18.0086 10.6401L0.805699 2.37985V5.5087L16.8868 13.1789C17.3322 13.3914 17.6155 13.8408 17.6155 14.3341V18.5857C17.6155 19.079 17.3317 19.5284 16.8868 19.7408L0.805699 27.4111V30.5399L18.0086 22.2796C19.4421 21.5913 20.3538 20.1419 20.3538 18.5518V14.368Z",
];
function logo(w, h, id = "") {
  return `<svg ${id ? `id="${id}"` : ""} width="${w}" height="${h}" viewBox="0 0 22 33" fill="none" xmlns="http://www.w3.org/2000/svg">${LOGO_PATHS.map(
    (d, i) => `<path class="lp lp${i}" d="${d}" fill="#FEF9F6"/>`,
  ).join("")}</svg>`;
}

// ─── Data (illustrative week for one person) ──────────────────────────
const PROJ = {
  core: { name: "OptSolv Core", color: "#f97316" },
  portal: { name: "Portal do Cliente", color: "#3b82f6" },
  data: { name: "Data Hub", color: "#22c55e" },
  hq: { name: "Executive HQ", color: "#8b5cf6" },
};
const SRC = {
  calendar: {
    label: "Calendário",
    icon: "calendarClock",
    ev: "agenda do Outlook",
  },
  teams: {
    label: "Teams real",
    icon: "usersRound",
    ev: "presença real no Teams",
  },
  pr: {
    label: "Pull Request",
    icon: "gitPullRequest",
    ev: "pull request do Azure DevOps",
  },
  commits: { label: "Commits", icon: "gitCommit", ev: "sessão de commits" },
  wi: { label: "Work Item", icon: "clipboardList", ev: "work item vinculado" },
};
const PLAN = [
  {
    p: "core",
    src: "calendar",
    min: 60,
    desc: "Daily e planejamento da Sprint 14",
    ev: "Daily 09:30 · Planning 10:00",
  },
  {
    p: "portal",
    src: "teams",
    min: 60,
    desc: "Alinhamento de escopo com o cliente",
    ev: "Reunião 14:00–15:00",
  },
  {
    p: "core",
    src: "pr",
    min: 90,
    desc: "Revisão do PR de login com Microsoft",
    ev: "PR 2184 revisado",
    wi: 2041,
  },
  {
    p: "core",
    src: "commits",
    min: 150,
    desc: "Correção do fluxo de sessão no SSO",
    ev: "7 commits em feat/sso",
    wi: 2041,
  },
  {
    p: "data",
    src: "wi",
    min: 120,
    desc: "Ajuste no relatório de horas da equipe",
    ev: "Task em andamento",
    wi: 2063,
  },
];
const WEEK = [
  {
    d: 5,
    wd: "seg",
    e: [
      ["core", "Daily e refinamento do backlog", 60],
      ["core", "Implementação do fluxo SSO", 300],
      ["portal", "Ajuste no layout do portal", 120],
    ],
  },
  {
    d: 6,
    wd: "ter",
    e: [
      ["core", "Integração com Microsoft Entra ID", 360],
      ["data", "Revisão das queries do relatório", 120],
    ],
  },
  {
    d: 7,
    wd: "qua",
    e: [
      ["portal", "Discovery com o cliente", 90],
      ["core", "Testes do login corporativo", 270],
      ["data", "Pipeline de exportação", 120],
    ],
  },
  {
    d: 8,
    wd: "qui",
    e: [
      ["core", "Correções do code review", 180],
      ["hq", "Painel de capacidade da equipe", 300],
    ],
  },
  { d: 9, wd: "sex", today: true, e: [] },
];

// ─── Timeline (frames @30fps, 120 BPM → beat = 15f) ──────────────────
const T = {
  drop: 120, // logo reveal, bar 3
  cut: 210, // match cut into the app
  clickFill: 255, // "Preencher meu dia"
  dlgOpen: 257,
  clickLaunch: 345, // "Lançar 5 entradas"
  dlgClose: 352,
  clickSubmit: 450, // "Submeter semana"
  clickApprove: 555, // "Aprovar"
  outro: 615, // closing lockup
};

// ─── Markup builders ─────────────────────────────────────────────────
function chrome(url) {
  return `<div class="flex h-[44px] items-center gap-2 border-b border-white/5 bg-[#111111] px-4">
    <span class="size-3 rounded-full bg-[#ff5f57]"></span><span class="size-3 rounded-full bg-[#febc2e]"></span><span class="size-3 rounded-full bg-[#28c840]"></span>
    <div class="mx-auto flex h-7 w-[520px] items-center justify-center gap-2 rounded-md bg-white/[0.06] font-mono text-[12px] text-white/50">${ic("lock", "size-3")}${url}</div>
    <div class="w-[52px]"></div>
  </div>`;
}

function navItem(icon, label, active, extra = "") {
  return `<div class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${active ? "bg-brand-500/10 text-brand-500" : "text-muted-foreground"}">${ic(icon, `h-5 w-5 ${active ? "text-brand-500" : ""}`)}<span class="flex-1">${label}</span>${extra}</div>`;
}

function avatar(initials, size = "h-8 w-8 text-xs") {
  return `<span class="relative flex ${size} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-brand-700/30 font-semibold text-brand-300 ring-1 ring-white/10">${initials}</span>`;
}

function sidebar({ manager, timer, name, initials, role, active }) {
  const timerCard = timer
    ? `<div class="mx-3 mt-3 mb-2 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3">
        <div class="flex items-center gap-2"><span class="flex h-5 w-5 items-center justify-center rounded-md bg-brand-500">${logo(7, 10.5)}</span><span class="text-xs font-medium uppercase tracking-wider text-brand-500">Timer ativo</span></div>
        <p class="mt-1 font-mono text-xl font-bold tabular-nums text-foreground" data-timer>01:42:15</p>
        <p class="text-xs text-muted-foreground">OptSolv Core</p>
        <div class="mt-2 flex gap-1"><span class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground">${ic("pause", "size-3.5")}Pausar</span><span class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-destructive">${ic("square", "size-3.5")}Parar</span></div>
      </div>`
    : `<div class="h-3"></div>`;
  const pending = `<span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white" data-pending>1</span>`;
  const mgmt = manager
    ? `<div class="my-3 h-px bg-border"></div>
       <p class="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Gestão</p>
       ${navItem("radar", "Central de Gestão", false)}
       ${navItem("checkSquare", "Aprovações", active === "approvals", `<span data-badge>${pending}</span>`)}
       ${navItem("clock", "Horas da Equipe", false)}
       ${navItem("users", "Equipe", false)}`
    : "";
  return `<aside class="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-sidebar">
    <div class="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
      <div class="sb-tile flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 shadow-lg shadow-brand-500/20">${logo(14, 21)}</div>
      <span class="font-display text-lg font-bold text-foreground">OptSolv<span class="font-light text-brand-500"> Time</span></span>
    </div>
    ${timerCard}
    <nav class="flex-1 space-y-1 px-3">
      ${navItem("home", "Dashboard", false)}
      ${navItem("clock", "Registrar Tempo", active === "time")}
      ${navItem("pieChart", "Meu Tempo", false)}
      ${navItem("trophy", "Minha Jornada", false)}
      ${navItem("folder", "Projetos", false)}
      ${navItem("lightbulb", "Sugestões", false)}
      ${navItem("settings", "Configurações", false)}
      ${mgmt}
    </nav>
    <div class="flex items-center gap-3 border-t border-border p-4">
      <span class="relative">${avatar(initials)}<span class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar"></span></span>
      <div class="min-w-0"><p class="truncate text-sm font-medium text-foreground">${name}</p><p class="text-xs text-muted-foreground">${role}</p></div>
    </div>
  </aside>`;
}

function header(crumbs, initials) {
  const chev = ic("chevronRight", "h-3.5 w-3.5 text-muted-foreground/50");
  const parts = crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<span class="font-display text-sm font-semibold text-foreground">${c}</span>`
        : `<span>${c}</span>`,
    )
    .join(chev);
  return `<header class="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
    <div class="flex items-center gap-1.5 text-sm text-muted-foreground">${ic("home", "h-4 w-4")}${chev}${parts}</div>
    <div class="flex items-center gap-2">
      <span class="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-500 px-3 text-sm font-medium text-white">${ic("plus", "size-4")}Novo Registro</span>
      <span class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-input/30 px-3 text-sm font-medium">${ic("hourglass", "size-4")}Com Timer</span>
      <span class="flex size-9 items-center justify-center text-muted-foreground">${ic("search", "size-4")}</span>
      <span class="flex size-9 items-center justify-center text-muted-foreground">${ic("calendarDays", "size-4")}</span>
      <span class="flex size-9 items-center justify-center text-muted-foreground">${ic("sun", "size-4")}</span>
      ${avatar(initials)}
    </div>
  </header>`;
}

function entryCard(p, desc, min, attrs = "") {
  const pr = PROJ[p];
  return `<div ${attrs} class="group overflow-hidden rounded-xl border bg-card/90" style="border-left:3px solid ${pr.color}">
    <div class="flex gap-2 p-2.5">
      <div class="min-w-0 flex-1"><p class="truncate text-[11px] font-semibold text-muted-foreground">${pr.name}</p><p class="mt-0.5 line-clamp-2 text-xs leading-snug text-foreground">${desc}</p></div>
      <div class="flex shrink-0 flex-col items-end gap-1"><span class="rounded-md bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-foreground">${formatDuration(min)}</span></div>
    </div>
  </div>`;
}

function dayColumn(day) {
  const total = day.e.reduce((a, e) => a + e[2], 0);
  const pct = Math.min(100, Math.round((total / 480) * 100));
  const today = !!day.today;
  const entries = today
    ? PLAN.map((it, j) =>
        entryCard(it.p, it.desc, it.min, `data-fri="${j}"`),
      ).join("")
    : day.e.map((e) => entryCard(e[0], e[1], e[2])).join("");
  return `<div class="flex flex-col rounded-2xl border ${today ? "border-brand-500/40 bg-brand-500/[0.02]" : "border-border/60 bg-background/70"}" ${today ? "data-fri-col" : ""}>
    <div class="flex-none rounded-t-2xl px-3 pt-3 pb-2 text-left">
      <div class="flex items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg font-display text-base font-bold ${today ? "bg-brand-500 text-white" : "text-foreground"}">${day.d}</span>
        <span class="text-[10px] font-semibold uppercase tracking-widest ${today ? "text-brand-500" : "text-muted-foreground"}">${day.wd}</span>
      </div>
      <div class="mt-2">
        <div class="flex items-baseline justify-between"><span class="font-mono text-sm font-semibold text-foreground" ${today ? "data-fri-total" : ""}>${formatDuration(total)}</span><span class="text-[10px] text-muted-foreground" ${today ? "data-fri-count" : ""}>${day.e.length} ${day.e.length === 1 ? "item" : "itens"}</span></div>
        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/50"><div class="h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-brand-500"}" style="width:${pct}%" ${today ? "data-fri-bar" : ""}></div></div>
      </div>
    </div>
    <div class="relative flex-1 space-y-1.5 px-2 pt-0.5 pb-1.5">
      ${entries}
      ${today ? `<div data-fri-empty class="absolute inset-x-2 top-0 flex min-h-20 flex-col items-center justify-center text-center"><p class="text-[11px] text-muted-foreground/60">Sem registros</p></div>` : ""}
    </div>
    <div class="flex-none px-2 pt-1 pb-2.5"><div class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2 text-xs text-muted-foreground">${ic("plus", "h-3.5 w-3.5")}<span class="font-medium">Adicionar</span></div></div>
  </div>`;
}

function weekView() {
  return `<section class="overflow-hidden rounded-[28px] border border-border/60 bg-card/90 shadow-sm">
    <div class="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="flex h-9 w-9 items-center justify-center rounded-full border border-input bg-input/30">${ic("chevronLeft", "h-4 w-4")}</span>
          <span class="flex h-9 w-9 items-center justify-center rounded-full border border-input bg-input/30">${ic("chevronRight", "h-4 w-4")}</span>
          <span class="inline-flex h-8 items-center rounded-full px-3 text-sm font-medium">Ir para semana atual</span>
        </div>
        <div>
          <h2 class="font-display text-2xl font-semibold text-foreground">5 out - 9 out 2026</h2>
          <p class="mt-1 text-sm text-muted-foreground">Arraste registros entre os dias para mover ou duplicar.</p>
        </div>
      </div>
      <div class="flex flex-col items-end gap-3">
        <div class="relative flex items-center gap-2">
          <span class="inline-flex items-center justify-center rounded-full border border-transparent bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-500"><span data-week-total>32h</span>&nbsp;na semana</span>
          <span data-submit class="relative inline-flex h-9 items-center rounded-full border border-input bg-input/30 px-4 text-sm font-medium shadow-xs">${ic("send", "mr-2 h-4 w-4", "data-send-icon")}Submeter semana</span>
          <span data-submitted class="absolute right-0 inline-flex items-center justify-center rounded-full border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-600 opacity-0 dark:text-amber-400">Submetida</span>
        </div>
        <div class="flex w-64 flex-col gap-2">
          <div class="flex items-center gap-3">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted/50"><div data-week-bar class="h-full rounded-full bg-brand-500" style="width:80%"></div></div>
            <span data-week-pct class="text-xs font-medium text-muted-foreground">80%</span>
          </div>
          <div class="flex items-center justify-between gap-2"><span class="text-xs text-muted-foreground">Exibir fins de semana</span><span class="inline-flex h-[1.15rem] w-8 items-center rounded-full bg-input/80"><span class="block size-4 rounded-full bg-foreground"></span></span></div>
        </div>
      </div>
    </div>
    <div class="px-5 py-4"><div class="grid grid-cols-5 gap-2.5">${WEEK.map(dayColumn).join("")}</div></div>
  </section>`;
}

function planRow(it, i) {
  const pr = PROJ[it.p];
  const s = SRC[it.src];
  return `<li data-row="${i}" class="space-y-2 rounded-xl border border-border/70 bg-card p-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <span class="size-2.5 shrink-0 rounded-full" style="background:${pr.color}"></span>
        <span class="truncate text-sm font-medium">${pr.name}</span>
        <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">${ic(s.icon, "size-3")}${s.label}</span>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <div class="flex items-center rounded-lg border border-border/60"><span class="flex size-6 items-center justify-center">${ic("minus", "size-3")}</span><span class="min-w-14 text-center font-mono text-xs font-semibold">${formatDuration(it.min)}</span><span class="flex size-6 items-center justify-center">${ic("plus", "size-3")}</span></div>
        <span class="inline-flex h-[1.15rem] w-8 items-center rounded-full bg-primary"><span class="block size-4 translate-x-[calc(100%-2px)] rounded-full bg-primary-foreground"></span></span>
      </div>
    </div>
    <div class="flex h-8 w-full items-center rounded-md border border-input bg-input/30 px-3 text-sm">${it.desc}</div>
    <p class="text-xs text-muted-foreground"><span class="font-medium text-foreground">Evidência:</span> <span class="capitalize">${s.ev}</span> · ${it.ev}${it.wi ? `<span class="ml-1 font-mono">· #${it.wi}</span>` : ""}</p>
  </li>`;
}

function fillDialog() {
  const legend = ["calendar", "teams", "pr", "commits", "wi"]
    .map(
      (k, i) =>
        `<li data-legend="${i}" class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">${ic(SRC[k].icon, "size-2.5")}${SRC[k].label}<span class="font-mono">1</span></li>`,
    )
    .join("");
  return `<div data-overlay class="absolute inset-0 top-[44px] z-40 bg-black/60 opacity-0"></div>
  <div data-dlg class="absolute top-[547px] left-[840px] z-50 w-[672px] -translate-x-1/2 -translate-y-1/2 opacity-0">
    <div data-dlg-panel class="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/40">
      <div class="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-500/15 via-brand-500/5 to-transparent px-6 pt-6 pb-4">
        <div class="absolute -top-24 -right-16 size-48 rounded-full bg-brand-500/20 blur-3xl"></div>
        <div class="relative flex items-start justify-between gap-4">
          <div class="space-y-1.5">
            <span class="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-500 ring-1 ring-brand-500/25 ring-inset">${ic("sparkles", "size-3.5")}Magia do TimeBot</span>
            <h3 class="font-display text-xl font-bold tracking-tight">Preencher meu dia</h3>
            <p class="text-sm text-muted-foreground capitalize">sexta-feira, 9 de outubro</p>
          </div>
          <span class="flex size-8 items-center justify-center text-muted-foreground">${ic("x", "size-4")}</span>
        </div>
        <ul class="relative mt-3 flex flex-wrap items-center gap-1.5">${legend}</ul>
      </div>
      <ul class="space-y-2.5 px-6 py-4">${PLAN.map(planRow).join("")}</ul>
      <div class="shrink-0 space-y-3 border-t border-border/60 px-6 py-4">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs"><span class="text-muted-foreground">Após aplicar: <span data-proj class="font-mono font-semibold text-foreground">8h</span> de 8h</span><span data-proj-pct class="font-mono text-muted-foreground">100%</span></div>
          <div class="relative h-2 w-full overflow-hidden rounded-full bg-primary/20"><div data-proj-bar class="h-full rounded-full bg-brand-500" style="width:100%"></div></div>
        </div>
        <div class="flex justify-end gap-2">
          <span class="inline-flex h-9 items-center rounded-md border border-input bg-input/30 px-4 text-sm font-medium">Fechar</span>
          <span data-launch class="relative inline-flex h-9 items-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-medium text-white">
            <span data-launch-idle class="inline-flex items-center gap-2">${ic("checkCircle2", "size-4")}Lançar 5 entradas (8h)</span>
            <span data-launch-busy class="absolute inset-0 inline-flex items-center justify-center gap-2 opacity-0">${ic("loader", "size-4", "data-spin")}Lançando…</span>
          </span>
        </div>
      </div>
    </div>
  </div>`;
}

function memberWindow() {
  return `${chrome("opt-time.optsolv.com.br/dashboard/time")}
  <div class="relative flex h-[1006px]">
    ${sidebar({ timer: true, name: "Ana Ribeiro", initials: "AR", role: "member", active: "time" })}
    <div class="flex min-w-0 flex-1 flex-col">
      ${header(["Dashboard", "Registrar Tempo"], "AR")}
      <main class="flex-1 space-y-5 overflow-hidden p-8">
        <section>
          <div class="flex items-center justify-between gap-4">
            <h1 class="font-display text-3xl font-semibold text-foreground">Registro de Tempo</h1>
            <span data-fill class="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-brand-500/40 bg-input/30 px-3 text-sm font-medium text-brand-500">${ic("sparkles", "size-4")}Preencher meu dia</span>
          </div>
          <div class="mt-3 inline-flex h-11 items-center rounded-full border border-white/5 bg-neutral-900/80 p-1">
            <span class="inline-flex h-full items-center gap-2 rounded-full px-5 text-sm font-medium text-muted-foreground">${ic("sun", "h-4 w-4")}Dia</span>
            <span class="inline-flex h-full items-center gap-2 rounded-full bg-neutral-800 px-5 text-sm font-medium text-orange-400 shadow-sm ring-1 ring-white/10">${ic("rows3", "h-4 w-4")}Semana</span>
            <span class="inline-flex h-full items-center gap-2 rounded-full px-5 text-sm font-medium text-muted-foreground">${ic("calendarDays", "h-4 w-4")}Mês</span>
            <span class="inline-flex h-full items-center gap-2 rounded-full px-5 text-sm font-medium text-muted-foreground">${ic("layers", "h-4 w-4")}Semanas</span>
          </div>
        </section>
        ${weekView()}
      </main>
    </div>
    ${fillDialog()}
  </div>
  <div data-dim class="absolute inset-0 bg-black opacity-0"></div>`;
}

function approvalCard(id, initials, name, total, billable, status, hidden) {
  const badge =
    status === "submitted"
      ? `<span data-status-sub class="inline-flex items-center justify-center gap-1 rounded-full border border-blue-300 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-400/40 dark:text-blue-300">${ic("send", "size-3")}Submetido</span>`
      : "";
  return `<div data-card="${id}" class="relative flex items-center gap-4 overflow-hidden rounded-xl border border-border/30 bg-card/80 px-4 py-2.5 shadow-sm ${hidden ? "opacity-0" : ""}">
    <div data-sweep class="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-green-500/0 via-green-500/15 to-green-500/0 opacity-0"></div>
    <div data-new class="absolute inset-0 rounded-xl ring-1 ring-brand-500/60 bg-brand-500/[0.06] opacity-0"></div>
    <div class="relative flex min-w-0 flex-1 items-center gap-3">${avatar(initials)}<div class="min-w-0"><p class="truncate text-sm leading-snug font-medium text-foreground">${name}</p><p class="text-[11px] text-muted-foreground">Semana 41 de 2026</p></div></div>
    <div class="relative flex gap-4 text-xs">
      <div class="text-center"><p class="font-mono text-sm font-semibold">${total}</p><p class="text-[10px] text-muted-foreground">Total</p></div>
      <div class="text-center"><p class="font-mono text-sm font-semibold text-brand-500">${billable}</p><p class="text-[10px] text-muted-foreground">Faturável</p></div>
    </div>
    <div class="relative grid w-[118px] place-items-center">
      <span class="col-start-1 row-start-1">${badge}</span>
      <span data-status-ok class="col-start-1 row-start-1 inline-flex items-center justify-center gap-1 rounded-full border border-green-300 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 opacity-0 dark:border-green-400/40 dark:text-green-300">${ic("checkCircle2", "size-3")}Aprovado</span>
      <span data-ring class="pointer-events-none absolute size-10 rounded-full border-2 border-green-400 opacity-0"></span>
    </div>
    <div class="relative flex shrink-0 gap-1.5">
      <span class="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-xs font-medium">Detalhes</span>
      <span data-actions class="inline-flex gap-1.5">
        <span data-approve class="inline-flex h-8 items-center rounded-md bg-green-600 px-3 text-xs font-medium text-white">${ic("check", "mr-1 h-3.5 w-3.5")}Aprovar</span>
        <span class="inline-flex h-8 items-center rounded-md border border-input bg-input/30 px-3 text-xs font-medium text-destructive">${ic("x", "mr-1 h-3.5 w-3.5")}Rejeitar</span>
      </span>
    </div>
  </div>`;
}

function managerWindow() {
  const tile = (label, value, attr) =>
    `<div class="rounded-xl border border-border/40 bg-card/50 px-4 py-3"><p class="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">${label}</p><p ${attr} class="mt-1 font-mono text-xl font-semibold text-foreground">${value}</p></div>`;
  return `${chrome("opt-time.optsolv.com.br/dashboard/timesheets/approvals")}
  <div class="relative flex h-[1006px]">
    ${sidebar({ manager: true, name: "Rafael Lima", initials: "RL", role: "manager", active: "approvals" })}
    <div class="flex min-w-0 flex-1 flex-col">
      ${header(["Dashboard", "Timesheets", "Aprovações"], "RL")}
      <main class="flex-1 space-y-8 overflow-hidden p-8">
        <div class="space-y-1"><h1 class="font-display text-2xl font-bold text-foreground">Aprovação de Timesheets</h1><p data-sub class="text-sm text-muted-foreground">2 timesheets aguardando aprovação, distribuídos em 1 semana</p></div>
        <div class="grid grid-cols-3 gap-3">${tile("Pendentes", "2", "data-pend")}${tile("Total de Horas", "77h 30min", "data-hours")}${tile("Semanas", "1", "")}</div>
        <div class="space-y-3">
          <div class="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-card/60 px-4 py-2.5">
            ${ic("calendarDays", "h-4 w-4 text-orange-400")}
            <div class="flex flex-1 items-center gap-2"><span class="text-sm font-semibold text-foreground">Semana 41</span><span class="text-xs text-muted-foreground">5 out – 9 out</span></div>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-1.5 text-xs text-muted-foreground">${ic("users", "h-3.5 w-3.5")}<span data-people>2 pessoas</span></div>
              <span class="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-400"><span data-pend-badge>2 pendentes</span></span>
            </div>
          </div>
          <div class="ml-2 space-y-2">
            ${approvalCard("ana", "AR", "Ana Ribeiro", "40h", "36h", "submitted", true)}
            ${approvalCard("bruno", "BC", "Bruno Costa", "39h 30min", "34h", "submitted", false)}
            ${approvalCard("carla", "CM", "Carla Mendes", "38h", "38h", "submitted", false)}
          </div>
        </div>
      </main>
    </div>
  </div>
  <div data-dim class="absolute inset-0 bg-black opacity-0"></div>`;
}

// ─── Screen-space builders ───────────────────────────────────────────
function words(line, gradient = []) {
  return line
    .split(" ")
    .map(
      (w) =>
        `<span class="w"><span class="wi ${gradient.includes(w) ? "gradient-text" : ""}">${w}</span></span>`,
    )
    .join(" ");
}

function eyebrow(icon, text) {
  return `<span class="inline-flex items-center gap-2.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-5 py-2 text-[21px] font-medium text-brand-400">${ic(icon, "size-[22px]")}${text}</span>`;
}

function caption(id, icon, label, lines, extra = "") {
  return `<div id="${id}" class="absolute top-0 left-[120px] flex h-[1080px] w-[720px] flex-col justify-center">
    <div data-eyebrow class="mb-7">${eyebrow(icon, label)}</div>
    <h2 class="font-display text-[84px] leading-[1.02] font-bold tracking-[-0.035em] text-white">${lines.map((l) => `<span class="block">${words(l[0], l[1] || [])}</span>`).join("")}</h2>
    ${extra}
  </div>`;
}

const FRAGS = [
  {
    t: "Daily · Sprint 14",
    m: "Agenda do Outlook · 09:30",
    d: "15min",
    i: "calendarClock",
    c: "#f97316",
    x: -650,
    y: -290,
    z: -150,
    r: -6,
  },
  {
    t: "PR #2184 · Login Microsoft",
    m: "Azure DevOps · revisão",
    d: "1h 30min",
    i: "gitPullRequest",
    c: "#f97316",
    x: 640,
    y: -320,
    z: -420,
    r: 5,
  },
  {
    t: "Chamada no Teams",
    m: "Chamada direta · 15:10",
    d: "25min",
    i: "phoneCall",
    c: "#3b82f6",
    x: 700,
    y: 250,
    z: -60,
    r: -4,
  },
  {
    t: "7 commits em feat/sso",
    m: "Sessão de commits",
    d: "2h 30min",
    i: "gitCommit",
    c: "#f97316",
    x: -760,
    y: 230,
    z: -560,
    r: 7,
  },
  {
    t: "Reunião com o cliente",
    m: "Presença real no Teams",
    d: "1h",
    i: "usersRound",
    c: "#3b82f6",
    x: -330,
    y: 390,
    z: 160,
    r: 3,
  },
  {
    t: "AB#2063 · Relatório de horas",
    m: "Work item vinculado",
    d: "2h",
    i: "clipboardList",
    c: "#22c55e",
    x: 330,
    y: -430,
    z: -900,
    r: -3,
  },
  {
    t: "Proposta_v3.docx",
    m: "Documento no OneDrive",
    d: "40min",
    i: "fileText",
    c: "#8b5cf6",
    x: -170,
    y: -470,
    z: -1250,
    r: 4,
  },
  {
    t: "Code review · PR #2179",
    m: "Azure DevOps",
    d: "45min",
    i: "gitPullRequest",
    c: "#f97316",
    x: 860,
    y: -20,
    z: -1150,
    r: -6,
  },
  {
    t: "Planning · Sprint 14",
    m: "Agenda do Outlook · 10:00",
    d: "1h",
    i: "calendarClock",
    c: "#f97316",
    x: -930,
    y: -40,
    z: -1050,
    r: 5,
  },
  {
    t: "Bug AB#2041",
    m: "Work item vinculado",
    d: "50min",
    i: "clipboardList",
    c: "#22c55e",
    x: 380,
    y: 470,
    z: -380,
    r: -5,
  },
];

function fragCard(fr, i) {
  return `<div data-frag="${i}" class="frag rounded-2xl border border-white/10 bg-[#171717] p-4 shadow-2xl shadow-black/60" style="border-left:3px solid ${fr.c}">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/70">${ic(fr.i, "size-5")}</div>
      <div class="min-w-0 flex-1"><p class="truncate text-[15px] font-semibold text-white">${fr.t}</p><p class="truncate text-[12px] text-white/45">${fr.m}</p></div>
      <span class="shrink-0 rounded-md bg-white/5 px-2 py-1 font-mono text-[13px] font-bold text-white/80">${fr.d}</span>
    </div>
  </div>`;
}

function clockDigits() {
  // Rolling seconds: 57 → 58 → 59 → 00, minutes 59 → 00, hours 17 → 18.
  const roll = (id, vals) =>
    `<span class="relative inline-block h-[1.2em] overflow-hidden"><span data-roll="${id}" class="flex flex-col">${vals.map((v) => `<span class="block h-[1.2em] leading-[1.2em]">${v}</span>`).join("")}</span></span>`;
  return `${roll("h", ["17", "18"])}<span class="leading-[1.2em]">:</span>${roll("m", ["59", "00"])}<span class="leading-[1.2em]">:</span>${roll("s", ["57", "58", "59", "00"])}`;
}

function build() {
  document.getElementById("frame").innerHTML = `
  <div id="bg" class="layer">
    <div id="glowA" class="absolute h-[1500px] w-[1500px] rounded-full" style="background:radial-gradient(circle, rgba(249,115,22,0.16) 0%, rgba(249,115,22,0.05) 35%, rgba(249,115,22,0) 65%)"></div>
    <div id="glowB" class="absolute h-[1100px] w-[1100px] rounded-full" style="background:radial-gradient(circle, rgba(234,88,12,0.12) 0%, rgba(234,88,12,0) 62%)"></div>
    <div id="glowC" class="absolute h-[900px] w-[900px] rounded-full" style="background:radial-gradient(circle, rgba(59,130,246,0.07) 0%, rgba(59,130,246,0) 62%)"></div>
  </div>

  <div id="hook" class="layer hook-persp">
    ${FRAGS.map(fragCard).join("")}
  </div>
  <div id="hookText" class="layer flex flex-col items-center justify-center">
    <div id="clock" class="mb-9 flex items-start gap-4 leading-[1.2em] font-mono text-[26px] font-medium tracking-[0.28em] text-white/45">
      <span class="leading-[1.2em]">SEXTA-FEIRA</span><span class="leading-[1.2em] text-white/25">·</span><span id="clockTime" class="inline-flex items-start leading-[1.2em] tracking-[0.12em] tabular-nums">${clockDigits()}</span>
    </div>
    <h1 class="text-center font-display text-[124px] leading-[1.0] font-bold tracking-[-0.04em] text-white">
      <span class="block">${words("Onde foram")}</span>
      <span class="block">${words("suas 40 horas?", ["40", "horas?"])}</span>
    </h1>
  </div>

  <div id="fx" class="layer">
    <div id="flash" class="absolute inset-0 opacity-0" style="background:radial-gradient(circle at 50% 50%, rgba(255,214,170,0.9) 0%, rgba(249,115,22,0.45) 18%, rgba(249,115,22,0) 55%)"></div>
    <div id="ring" class="absolute top-[540px] left-[960px] rounded-full border-[3px] border-brand-400 opacity-0"></div>
    <div id="streak" class="absolute top-[538px] left-0 h-[4px] w-[1920px] opacity-0" style="background:linear-gradient(90deg, rgba(255,170,100,0) 0%, rgba(255,200,150,0.95) 50%, rgba(255,170,100,0) 100%); filter: blur(1.5px)"></div>
  </div>

  <div id="stage" class="layer">
    <div id="winA" class="win">${memberWindow()}</div>
    <div id="winB" class="win">${managerWindow()}</div>
  </div>

  <div id="scrim" class="layer opacity-0" style="background:linear-gradient(90deg, rgba(10,10,10,0.97) 0%, rgba(10,10,10,0.94) 34%, rgba(10,10,10,0.72) 44%, rgba(10,10,10,0.25) 54%, rgba(10,10,10,0) 62%)"></div>

  <div id="plane" class="absolute top-0 left-0 opacity-0">
    <div id="planeTrail"></div>
    <div id="planeIcon" class="flex size-[64px] items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_0_60px_rgba(249,115,22,0.7)]">${ic("send", "size-8")}</div>
  </div>

  <div id="captions" class="layer">
    ${caption(
      "cap1",
      "sparkles",
      "Preencher meu dia",
      [["Seu dia,"], ["montado sozinho.", ["montado", "sozinho."]]],
      `<div data-chips class="mt-9 flex flex-wrap items-center gap-3">
        <span class="text-[24px] text-white/55">a partir do</span>
        ${[
          ["calendarClock", "Outlook"],
          ["usersRound", "Teams"],
          ["gitPullRequest", "Azure DevOps"],
        ]
          .map(
            ([i, l]) =>
              `<span data-chip class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[22px] font-medium text-white/85">${ic(i, "size-[20px] text-brand-400")}${l}</span>`,
          )
          .join("")}
      </div>`,
    )}
    ${caption("cap2", "send", "Submeter semana", [["Semana fechada"], ["em um clique.", ["um", "clique."]]])}
    ${caption("cap3", "checkSquare", "Aprovação do gestor", [["Aprovada."], ["Zero planilhas.", ["Zero", "planilhas."]]])}
  </div>

  <div id="lockup" class="layer">
    <div id="tile" class="absolute top-0 left-0 flex h-[150px] w-[150px] items-center justify-center rounded-[47px] bg-brand-500" style="box-shadow:0 30px 120px rgba(249,115,22,0.55), inset 0 1px 1px rgba(255,255,255,0.35)">
      <div id="tileSheen" class="absolute inset-0 overflow-hidden rounded-[47px]"><div class="absolute -inset-y-10 w-[60px] rotate-[20deg] bg-white/40 blur-md" id="tileSheenBar"></div></div>
      ${logo(66, 99, "tileLogo")}
    </div>
    <div id="wordmark" class="absolute top-[480px] left-0 font-display text-[112px] font-bold tracking-[-0.03em] whitespace-nowrap text-white">OptSolv<span class="font-normal text-brand-500"> Time</span></div>
    <p id="revealSub" class="absolute top-[610px] left-0 w-[1920px] text-center text-[38px] text-white/60">${words("Registro e aprovação de horas.")}</p>
  </div>

  <div id="outro" class="layer flex flex-col items-center justify-center">
    <div id="outroBrand" class="flex items-center gap-7">
      <div id="outroTile" class="relative flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-[33px] bg-brand-500" style="box-shadow:0 24px 90px rgba(249,115,22,0.5), inset 0 1px 1px rgba(255,255,255,0.35)">${logo(46, 69)}
        <div id="outroSheen" class="absolute -inset-y-6 w-[40px] rotate-[20deg] bg-white/45 blur-md"></div>
      </div>
      <div class="font-display text-[78px] font-bold tracking-[-0.03em] text-white">OptSolv<span class="font-normal text-brand-500"> Time</span></div>
    </div>
    <h2 id="tagline" class="mt-16 text-center font-display text-[80px] leading-[1.06] font-bold tracking-[-0.035em] text-white">
      <span class="block">${words("Suas horas, organizadas com")}</span>
      <span class="block">${words("precisão cirúrgica.", ["precisão", "cirúrgica."])}</span>
    </h2>
    <div id="pill" class="mt-16 inline-flex items-center gap-5 rounded-full border border-white/10 bg-white/[0.04] py-3.5 pr-7 pl-4">
      <span class="inline-flex items-center gap-3 rounded-full bg-white/[0.06] px-4 py-2 text-[22px] text-white/80"><span class="ms-logo"><span style="background:#f25022"></span><span style="background:#7fba00"></span><span style="background:#00a4ef"></span><span style="background:#ffb900"></span></span>Entre com sua conta Microsoft</span>
      <span class="font-mono text-[26px] font-medium text-brand-400">opt-time.optsolv.com.br</span>
    </div>
  </div>

  <div id="cursor" class="absolute top-0 left-0 opacity-0">
    <div id="ripple" class="absolute -top-[40px] -left-[40px] h-[80px] w-[80px] rounded-full border-2 border-white/80 opacity-0"></div>
    <svg id="arrow" width="34" height="44" viewBox="0 0 34 44" style="filter: drop-shadow(0 6px 10px rgba(0,0,0,0.55)); transform-origin: 3px 3px">
      <path d="M3 3 L3 36 L11.5 28.3 L17 41 L23 38.4 L17.6 26 L29 26 Z" fill="#ffffff" stroke="#0a0a0a" stroke-width="2.2" stroke-linejoin="round"/>
    </svg>
  </div>

  <div id="vignette" class="layer" style="background:radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)"></div>
  <div id="grain" class="layer"></div>
  `;
}

// ─── Grain: deterministic noise, one plate per output frame ───────────
const GRAIN = [];
function buildGrain() {
  const host = document.getElementById("grain");
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let k = 0; k < 6; k++) {
    const c = document.createElement("canvas");
    c.width = 960;
    c.height = 540;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(960, 540);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    c.style.opacity = "0";
    host.appendChild(c);
    GRAIN.push(c);
  }
}

// ─── Measurement + projection ─────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const M = {}; // window-local centers of things the camera and cursor aim at
let winA;
let winB;

function localRect(win, el) {
  const r0 = win.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    x: r.left - r0.left + r.width / 2,
    y: r.top - r0.top + r.height / 2,
    w: r.width,
    h: r.height,
  };
}

function measure() {
  winA.style.transform = "none";
  winB.style.transform = "none";
  M.sbTile = localRect(winA, $(".sb-tile", winA));
  M.fill = localRect(winA, $("[data-fill]", winA));
  M.dlg = localRect(winA, $("[data-dlg-panel]", winA));
  M.launch = localRect(winA, $("[data-launch]", winA));
  M.submit = localRect(winA, $("[data-submit]", winA));
  M.sendIcon = localRect(winA, $("[data-send-icon]", winA));
  M.friCol = localRect(winA, $("[data-fri-col]", winA));
  M.rows = $$("[data-row]", winA).map((el) => localRect(winA, el));
  M.fri = $$("[data-fri]", winA).map((el) => localRect(winA, el));
  M.ana = localRect(winB, $('[data-card="ana"]', winB));
  M.approve = localRect(winB, $('[data-card="ana"] [data-approve]', winB));
  M.anaStatus = localRect(winB, $('[data-card="ana"] [data-status-ok]', winB));
  M.list = localRect(winB, $('[data-card="bruno"]', winB));
}

const PERSP = new DOMMatrix();
PERSP.m34 = -1 / 2400;
const PROJ_M = new DOMMatrix()
  .translate(960, 540)
  .multiply(PERSP)
  .translate(-960, -540);

function camMatrix(c) {
  return new DOMMatrix()
    .translate(c.fx, c.fy)
    .translate(c.sx - c.fx, c.sy - c.fy, c.z || 0)
    .rotateAxisAngle(1, 0, 0, c.rx)
    .rotateAxisAngle(0, 1, 0, c.ry)
    .scale(c.s, c.s, 1)
    .translate(-c.fx, -c.fy);
}
/** Screen position of a window-local point under camera c. */
function project(c, x, y) {
  const q = PROJ_M.multiply(camMatrix(c)).transformPoint(
    new DOMPoint(x, y, 0, 1),
  );
  return [q.x / q.w, q.y / q.w];
}
function applyCam(el, c) {
  el.style.transformOrigin = `${c.fx}px ${c.fy}px`;
  el.style.transform = `translate3d(${c.sx - c.fx}px, ${c.sy - c.fy}px, ${c.z || 0}px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale(${c.s})`;
}
/** Interpolate camera keys {f, fx, fy, sx, sy, s, rx, ry, e}. */
function camAt(f, keys) {
  const fields = ["fx", "fy", "sx", "sy", "s", "rx", "ry", "z"];
  const out = {};
  for (const k of fields)
    out[k] = track(
      f,
      keys.map((key) => [key.f, key[k] ?? 0, key.e]),
    );
  return out;
}

// ─── Cameras ─────────────────────────────────────────────────────────
function camKeysA() {
  const mid = {
    x: (M.submit.x + M.friCol.x) / 2 - 40,
    y: (M.submit.y + M.friCol.y) / 2 - 30,
  };
  return [
    { f: 204, fx: 840, fy: 525, sx: 960, sy: 548, s: 1.12, rx: 0, ry: 0 },
    {
      f: 233,
      fx: 840,
      fy: 525,
      sx: 960,
      sy: 548,
      s: 0.985,
      rx: 0,
      ry: 0,
      e: E.outQuart,
    },
    {
      f: 253,
      fx: M.fill.x,
      fy: M.fill.y,
      sx: 1330,
      sy: 330,
      s: 1.6,
      rx: 5,
      ry: -10,
      e: E.inOutQuint,
    },
    {
      f: 266,
      fx: M.fill.x,
      fy: M.fill.y,
      sx: 1330,
      sy: 330,
      s: 1.64,
      rx: 5,
      ry: -10,
      e: E.linear,
    },
    {
      f: 292,
      fx: M.dlg.x,
      fy: M.dlg.y,
      sx: 1260,
      sy: 540,
      s: 1.04,
      rx: 4,
      ry: -12,
      e: E.inOutQuint,
    },
    {
      f: 318,
      fx: M.dlg.x,
      fy: M.dlg.y,
      sx: 1260,
      sy: 540,
      s: 1.08,
      rx: 4,
      ry: -12,
      e: E.linear,
    },
    {
      f: 340,
      fx: M.launch.x,
      fy: M.launch.y,
      sx: 1390,
      sy: 650,
      s: 1.8,
      rx: 3,
      ry: -9,
      e: E.inOutQuint,
    },
    {
      f: 352,
      fx: M.launch.x,
      fy: M.launch.y,
      sx: 1390,
      sy: 650,
      s: 1.84,
      rx: 3,
      ry: -9,
      e: E.linear,
    },
    {
      f: 386,
      fx: mid.x,
      fy: mid.y,
      sx: 1330,
      sy: 520,
      s: 1.3,
      rx: 6,
      ry: -13,
      e: E.inOutQuint,
    },
    {
      f: 446,
      fx: mid.x,
      fy: mid.y,
      sx: 1330,
      sy: 520,
      s: 1.38,
      rx: 6,
      ry: -13,
      e: E.linear,
    },
    {
      f: 456,
      fx: mid.x,
      fy: mid.y,
      sx: 1310,
      sy: 525,
      s: 1.36,
      rx: 6,
      ry: -13,
      e: E.outCubic,
    },
    {
      f: 488,
      fx: mid.x,
      fy: mid.y,
      sx: 520,
      sy: 545,
      s: 0.64,
      rx: 3,
      ry: 22,
      e: E.inOutCubic,
    },
    {
      f: 520,
      fx: mid.x,
      fy: mid.y,
      sx: -420,
      sy: 560,
      s: 0.58,
      rx: 3,
      ry: 30,
      e: E.inCubic,
    },
  ];
}
function camKeysB() {
  const anaFocus = { x: M.ana.x + 120, y: M.ana.y + 40 };
  return [
    {
      f: 456,
      fx: anaFocus.x,
      fy: anaFocus.y,
      sx: 2650,
      sy: 560,
      s: 0.6,
      rx: 3,
      ry: -30,
    },
    {
      f: 488,
      fx: anaFocus.x,
      fy: anaFocus.y,
      sx: 1440,
      sy: 548,
      s: 0.66,
      rx: 3,
      ry: -22,
      e: E.outCubic,
    },
    {
      f: 514,
      fx: anaFocus.x,
      fy: anaFocus.y,
      sx: 1290,
      sy: 610,
      s: 1.16,
      rx: 4,
      ry: -12,
      e: E.inOutCubic,
    },
    {
      f: 524,
      fx: anaFocus.x,
      fy: anaFocus.y,
      sx: 1290,
      sy: 610,
      s: 1.2,
      rx: 4,
      ry: -12,
      e: E.linear,
    },
    {
      f: 546,
      fx: M.approve.x - 60,
      fy: M.approve.y,
      sx: 1260,
      sy: 600,
      s: 1.95,
      rx: 3,
      ry: -8,
      e: E.inOutQuint,
    },
    {
      f: 598,
      fx: M.approve.x - 140,
      fy: M.approve.y,
      sx: 1300,
      sy: 590,
      s: 1.82,
      rx: 3,
      ry: -9,
      e: E.outCubic,
    },
    {
      f: 616,
      fx: M.approve.x - 140,
      fy: M.approve.y,
      sx: 1300,
      sy: 590,
      s: 2.6,
      rx: 3,
      ry: -9,
      e: E.inCubic,
    },
  ];
}

// ─── Cursor ──────────────────────────────────────────────────────────
function cursorSegments(camA, camB) {
  return [
    {
      a: 238,
      b: 252,
      click: T.clickFill,
      cam: camA,
      pt: () => [M.fill.x - 30, M.fill.y + 4],
      start: [1500, 960],
    },
    {
      a: 318,
      b: 340,
      click: T.clickLaunch,
      cam: camA,
      pt: () => [M.launch.x + 10, M.launch.y + 4],
    },
    {
      a: 420,
      b: 447,
      click: T.clickSubmit,
      cam: camA,
      pt: () => [M.submit.x + 20, M.submit.y + 3],
    },
    {
      a: 524,
      b: 552,
      click: T.clickApprove,
      cam: camB,
      pt: () => [M.approve.x + 6, M.approve.y + 3],
    },
  ];
}
function cursorPos(f, segs) {
  const live = (seg, fr) => project(seg.cam(fr), ...seg.pt());
  const frozen = (seg) => live(seg, seg.click + 8);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const next = segs[i + 1];
    const start = i === 0 ? s.start : frozen(segs[i - 1]);
    if (f < s.a) return start;
    if (f <= s.b) {
      const p = E.inOutCubic(clamp((f - s.a) / (s.b - s.a)));
      const end = live(s, f);
      const arc = Math.sin(Math.PI * p) * 60;
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const len = Math.hypot(dx, dy) || 1;
      return [
        lerp(start[0], end[0], p) + (-dy / len) * arc,
        lerp(start[1], end[1], p) + (dx / len) * arc,
      ];
    }
    if (f <= s.click + 8) return live(s, f);
    if (!next || f < next.a) return frozen(s);
  }
  return frozen(segs[segs.length - 1]);
}

// ─── Seek helpers ────────────────────────────────────────────────────
function setT(el, tf, op) {
  if (!el) return;
  if (tf !== undefined) el.style.transform = tf;
  if (op !== undefined) el.style.opacity = String(op);
}

/** Word-mask reveal for a block: words rise from their line box. */
function revealWords(container, f, start, stagger = 3, dur = 22) {
  const ws = $$(".wi", container);
  ws.forEach((w, i) => {
    const p = P(f, start + i * stagger, start + i * stagger + dur, E.outExpo);
    w.style.transform = `translateY(${(1 - p) * 112}%)`;
    w.style.filter = p < 1 ? `blur(${(1 - p) * 8}px)` : "none";
    w.style.opacity = String(clamp(p * 1.6));
  });
}
function hideBlock(el, f, a, b) {
  const p = P(f, a, b, E.inCubic);
  el.style.opacity = String(1 - p);
  el.style.transform = `translateY(${-28 * p}px)`;
  el.style.filter = p > 0 ? `blur(${p * 10}px)` : "none";
}

let CAM_A;
let CAM_B;
let SEGS;
const fmt2 = (n) => String(n).padStart(2, "0");

function seek(f) {
  const frameIdx = Math.floor(f + 1e-6);

  // ── Background glows ──
  const gA = $("#glowA");
  const hookGlow = track(f, [
    [0, 0.55],
    [100, 0.95, E.inCubic],
    [120, 1.25, E.inExpo],
    [160, 0.85, E.outCubic],
    [200, 0.8],
  ]);
  const gax = track(f, [
    [0, 210],
    [200, 210],
    [260, 700, E.inOutCubic],
    [600, 760],
    [640, 210, E.inOutCubic],
  ]);
  const gay = track(f, [
    [0, -210],
    [200, -210],
    [260, -520, E.inOutCubic],
    [600, -480],
    [640, -300, E.inOutCubic],
  ]);
  setT(
    gA,
    `translate(${gax + Math.sin(f / 70) * 30}px, ${gay + Math.cos(f / 90) * 20}px)`,
    hookGlow,
  );
  setT(
    $("#glowB"),
    `translate(${-200 + Math.sin(f / 80) * 40}px, ${520 + Math.cos(f / 60) * 30}px)`,
    track(f, [
      [0, 0.4],
      [120, 0.9],
      [600, 0.9],
      [650, 0.5],
    ]),
  );
  setT(
    $("#glowC"),
    `translate(${1300 + Math.cos(f / 75) * 40}px, ${560 + Math.sin(f / 85) * 30}px)`,
    track(f, [
      [0, 0],
      [210, 0],
      [260, 1],
      [600, 1],
      [640, 0],
    ]),
  );

  // ── Hook: fragments of the week drifting in depth ──
  const hookOn = f < 124;
  $("#hook").style.visibility = hookOn ? "" : "hidden";
  if (hookOn) {
    const dolly = track(f, [
      [0, -120],
      [96, 230, E.linear],
    ]);
    const implode = P(f, 94, 118, E.inExpo);
    FRAGS.forEach((fr, i) => {
      const el = $(`[data-frag="${i}"]`);
      const appear = P(f, 2 + i * 3.2, 22 + i * 3.2, E.outCubic);
      const drift = Math.sin(f / 40 + i) * 12;
      let x = fr.x + drift;
      let y = fr.y + Math.cos(f / 47 + i * 2) * 10;
      let z = fr.z + dolly;
      x = lerp(x, 0, implode);
      y = lerp(y, 0, implode);
      z = lerp(z, -380, implode);
      const rot =
        fr.r + Math.sin(f / 55 + i) * 1.5 + implode * (i % 2 ? 40 : -40);
      const sc = lerp(1, 0.35, implode);
      const depthBlur = clamp(Math.abs(z - 40) / 95, 0, 11);
      const depthDim = clamp(1 - Math.max(0, -z - 300) / 1500, 0.35, 1);
      el.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateZ(${rot}deg) rotateY(${fr.x > 0 ? -8 : 8}deg) scale(${sc})`;
      el.style.filter = `blur(${lerp(depthBlur, 2, implode)}px)`;
      el.style.opacity = String(appear * depthDim * (1 - P(f, 108, 119)));
    });
  }

  const hookText = $("#hookText");
  hookText.style.visibility = f < 120 ? "" : "hidden";
  if (f < 120) {
    revealWords($("#hookText h1"), f, 6, 4, 24);
    const out = P(f, 92, 110, E.inExpo);
    $("#hookText h1").style.transform =
      `scale(${(1 + 0.035 * P(f, 0, 95, E.outCubic)) * (1 - 0.06 * out)})`;
    $("#hookText h1").style.filter = out > 0 ? `blur(${out * 16}px)` : "none";
    $("#hookText h1").style.opacity = String(1 - out);
    // Clock: one tick per second, 17:59:57 → 18:00:00 at the third tick.
    const tick = (n) => P(f, n * 30 - 1, n * 30 + 7, E.outBack);
    const sRoll = tick(1) + tick(2) + tick(3);
    $('[data-roll="s"]').style.transform = `translateY(${-sRoll * 1.2}em)`;
    $('[data-roll="m"]').style.transform = `translateY(${-tick(3) * 1.2}em)`;
    $('[data-roll="h"]').style.transform = `translateY(${-tick(3) * 1.2}em)`;
    const clock = $("#clock");
    clock.style.opacity = String(P(f, 0, 14, E.outCubic) * (1 - out));
    clock.style.transform = `translateY(${(1 - P(f, 0, 18, E.outExpo)) * 14}px)`;
    $("#clockTime").style.color =
      f >= 90 ? `rgba(251,146,60,${0.6 + 0.4 * bump(f, 90, 104)})` : "";
  }

  // ── Drop FX ──
  setT(
    $("#flash"),
    undefined,
    0.85 * Math.exp(-Math.max(0, f - T.drop) / 5) * (f >= T.drop ? 1 : 0) +
      0.25 * P(f, 104, 120, E.inExpo) * (f < T.drop ? 1 : 0),
  );
  const ringP = P(f, T.drop, T.drop + 34, E.outExpo);
  const ringR = 40 + ringP * 1100;
  const ring = $("#ring");
  ring.style.width = ring.style.height = `${ringR * 2}px`;
  ring.style.marginLeft = ring.style.marginTop = `${-ringR}px`;
  ring.style.opacity = String(
    f >= T.drop ? 0.7 * (1 - P(f, T.drop, T.drop + 34)) : 0,
  );
  ring.style.borderWidth = `${lerp(6, 1, ringP)}px`;
  const st = $("#streak");
  st.style.opacity = String(f >= T.drop ? Math.exp(-(f - T.drop) / 7) : 0);
  st.style.transform = `scaleX(${lerp(0.3, 1.25, P(f, T.drop, T.drop + 16, E.outExpo))})`;

  // ── Reveal lockup: tile, wordmark, subtitle; then the tile flies into the sidebar ──
  const tile = $("#tile");
  const wm = $("#wordmark");
  const lockOn = f >= T.drop && f < 240;
  $("#lockup").style.visibility = lockOn ? "" : "hidden";
  if (lockOn) {
    const wmW = wm.offsetWidth;
    const gap = 40;
    const rowW = 150 + gap + wmW;
    const finalTileCx = 960 - rowW / 2 + 75;
    const slide = P(f, 128, 152, E.inOutQuint);
    let cx = lerp(960, finalTileCx, slide);
    let cy = 480;
    const pop = spring(f, T.drop, 200, 13);
    let size = 150 * lerp(0.25, 1, pop);
    const rot = lerp(-25, 0, spring(f, T.drop, 120, 12));
    let glow = 1;
    // Match cut: fly to the sidebar tile of the member window.
    const fly = P(f, 204, 232, E.inOutExpo);
    if (fly > 0) {
      const tgt = project(camAt(f, CAM_A), M.sbTile.x, M.sbTile.y);
      const s = camAt(f, CAM_A).s;
      cx = lerp(cx, tgt[0], fly);
      cy = lerp(cy, tgt[1], fly);
      size = lerp(size, 32 * s, fly);
      glow = 1 - fly;
    }
    tile.style.transform = `translate(${cx - 75}px, ${cy - 75}px) scale(${size / 150}) rotate(${rot}deg)`;
    tile.style.opacity = String(f < 232 ? 1 : 1 - P(f, 232, 235));
    tile.style.boxShadow = `0 30px 120px rgba(249,115,22,${0.55 * glow}), inset 0 1px 1px rgba(255,255,255,${0.35 * glow})`;
    $$("#tileLogo .lp").forEach((p, i) => {
      const pp = P(f, T.drop + 2 + i * 3, T.drop + 16 + i * 3, E.outExpo);
      p.style.transform = `translateX(${(1 - pp) * -10}px)`;
      p.style.opacity = String(pp);
    });
    const sheen = P(f, 160, 186, E.inOutCubic);
    $("#tileSheenBar").style.transform =
      `translateX(${lerp(-120, 240, sheen)}px)`;
    // Wordmark slides out from behind the tile.
    const wmLeft = finalTileCx + 75 + gap;
    const wp = P(f, 132, 158, E.outExpo);
    wm.style.left = `${wmLeft}px`;
    wm.style.clipPath = `inset(-20% ${(1 - wp) * 100}% -30% 0)`;
    wm.style.transform = `translate(${(1 - wp) * -60}px, -50%)`;
    const exit = P(f, 196, 206, E.inCubic);
    wm.style.opacity = String(1 - exit);
    wm.style.filter = exit > 0 ? `blur(${exit * 12}px)` : "none";
    revealWords($("#revealSub"), f, 138, 3, 20);
    $("#revealSub").style.opacity = String(1 - exit);
    $("#revealSub").style.filter = exit > 0 ? `blur(${exit * 10}px)` : "none";
  }

  // ── Member window (A) ──
  const camA = camAt(f, CAM_A);
  const aOn = f >= 206 && f < 524;
  winA.style.visibility = aOn ? "" : "hidden";
  if (aOn) {
    applyCam(winA, camA);
    winA.style.opacity = String(
      P(f, 206, 223, E.outCubic) * (1 - P(f, 500, 522, E.inCubic)),
    );
    $("[data-dim]", winA).style.opacity = String(
      0.42 * P(f, 458, 490, E.inOutCubic),
    );
    // Live timer in the sidebar.
    const secs = 6135 + Math.floor(f / FPS);
    $("[data-timer]", winA).textContent =
      `${fmt2(Math.floor(secs / 3600))}:${fmt2(Math.floor((secs % 3600) / 60))}:${fmt2(secs % 60)}`;
    // Fill button: hover + press.
    const fill = $("[data-fill]", winA);
    const hovF = f >= 252 && f < 262;
    fill.style.background = hovF ? "rgba(249,115,22,0.12)" : "";
    fill.style.transform = `scale(${1 - 0.05 * bump(f, T.clickFill, T.clickFill + 8)})`;
    // Dialog.
    const open = P(f, T.dlgOpen, T.dlgOpen + 10, E.outCubic);
    const close = P(f, T.dlgClose, T.dlgClose + 12, E.inCubic);
    $("[data-overlay]", winA).style.opacity = String(
      open * (1 - P(f, T.dlgClose, T.dlgClose + 18)),
    );
    const dlg = $("[data-dlg]", winA);
    dlg.style.opacity = String(open);
    $("[data-dlg-panel]", winA).style.transform =
      `scale(${lerp(0.95, 1, open) - 0.03 * close})`;
    $("[data-dlg-panel]", winA).style.opacity = String(1 - close);
    dlg.style.visibility =
      f >= T.dlgOpen && f < T.dlgClose + 14 ? "" : "hidden";
    $$("[data-legend]", winA).forEach((el, i) => {
      const p = P(f, 264 + i * 3, 274 + i * 3, E.outBack);
      el.style.transform = `scale(${lerp(0.6, 1, p)})`;
      el.style.opacity = String(clamp(p));
    });
    $$("[data-row]", winA).forEach((el, i) => {
      const p = P(f, 268 + i * 5, 280 + i * 5, E.outCubic);
      const lift = P(f, T.dlgClose + 2 + i * 3, T.dlgClose + 5 + i * 3);
      el.style.transform = `translateY(${(1 - p) * 10}px)`;
      el.style.opacity = String(p * (1 - lift));
    });
    const projMin = 480 * P(f, 286, 318, E.inOutCubic);
    $("[data-proj]", winA).textContent = formatDuration(
      Math.round(projMin / 30) * 30,
    );
    $("[data-proj-pct]", winA).textContent =
      `${Math.round((projMin / 480) * 100)}%`;
    $("[data-proj-bar]", winA).style.width = `${(projMin / 480) * 100}%`;
    const launch = $("[data-launch]", winA);
    const hovL = f >= 336 && f < 352;
    launch.style.background = hovL ? "#ea580c" : "";
    launch.style.transform = `scale(${1 - 0.05 * bump(f, T.clickLaunch, T.clickLaunch + 8)})`;
    const busy = f >= T.clickLaunch + 2 ? 1 : 0;
    $("[data-launch-idle]", winA).style.opacity = String(1 - busy);
    $("[data-launch-busy]", winA).style.opacity = String(busy);
    $("[data-spin]", winA).style.transform =
      `rotate(${(f - T.clickLaunch) * 24}deg)`;

    // Entries fly from the dialog rows into Friday's column.
    let landed = 0;
    let landedCount = 0;
    $$("[data-fri]", winA).forEach((el, i) => {
      const a = T.dlgClose + 2 + i * 3;
      const p = P(f, a, a + 22, E.inOutQuint);
      const r = M.rows[i];
      const c = M.fri[i];
      const s0 = 1.35;
      el.style.position = "relative";
      el.style.zIndex = "60";
      el.style.transform = `translate(${(r.x - c.x) * (1 - p)}px, ${(r.y - c.y) * (1 - p)}px) scale(${lerp(s0, 1, p)})`;
      el.style.opacity = String(f >= a ? clamp((f - a) / 3) : 0);
      el.style.boxShadow =
        p > 0 && p < 1
          ? `0 ${20 * (1 - p)}px 40px rgba(0,0,0,${0.5 * (1 - p)})`
          : "";
      if (p >= 1) {
        landed += PLAN[i].min;
        landedCount++;
      }
    });
    $("[data-fri-empty]", winA).style.opacity = String(
      1 - P(f, T.dlgClose + 2, T.dlgClose + 8),
    );
    // Counters ease toward the landed amount for a smooth count-up.
    const friMin = Math.min(480, landed);
    $("[data-fri-total]", winA).textContent = formatDuration(friMin);
    $("[data-fri-count]", winA).textContent =
      `${landedCount} ${landedCount === 1 ? "item" : "itens"}`;
    const friBar = $("[data-fri-bar]", winA);
    const friPct = (friMin / 480) * 100;
    friBar.style.width = `${friPct}%`;
    friBar.style.background = friPct >= 100 ? "#10b981" : "#f97316";
    const weekMin = 32 * 60 + friMin;
    $("[data-week-total]", winA).textContent = formatDuration(weekMin);
    const weekPct = weekMin / 2400;
    const wb = $("[data-week-bar]", winA);
    wb.style.width = `${weekPct * 100}%`;
    wb.style.background = weekPct >= 1 ? "#10b981" : "#f97316";
    $("[data-week-pct]", winA).textContent = `${Math.round(weekPct * 100)}%`;
    // Submit → Submetida.
    const sub = $("[data-submit]", winA);
    const hovS = f >= 444 && f < 452;
    sub.style.background = hovS ? "rgba(255,255,255,0.12)" : "";
    const subOut = P(f, T.clickSubmit + 2, T.clickSubmit + 9, E.inCubic);
    sub.style.transform = `scale(${(1 - 0.05 * bump(f, T.clickSubmit, T.clickSubmit + 6)) * lerp(1, 0.85, subOut)})`;
    sub.style.opacity = String(1 - subOut);
    const subIn = spring(f, T.clickSubmit + 7, 260, 16);
    const subd = $("[data-submitted]", winA);
    subd.style.opacity = String(clamp(subIn));
    subd.style.transform = `scale(${lerp(0.7, 1, subIn)})`;
    $("[data-send-icon]", winA).style.opacity =
      f >= T.clickSubmit + 2 ? "0" : "1";
  }

  // ── Manager window (B) ──
  const camB = camAt(f, CAM_B);
  const bOn = f >= 456 && f < 618;
  winB.style.visibility = bOn ? "" : "hidden";
  if (bOn) {
    applyCam(winB, camB);
    winB.style.opacity = String(
      P(f, 456, 472) * (1 - P(f, 600, 616, E.inCubic)),
    );
    const ana = $('[data-card="ana"]', winB);
    const arrive = P(f, 506, 518, E.outCubic);
    ana.style.opacity = String(arrive);
    ana.style.transform = `translateY(${(1 - arrive) * -10}px)`;
    $("[data-new]", ana).style.opacity = String(
      f >= 506 ? 1 - P(f, 522, 556) : 0,
    );
    const arrived = f >= 510;
    const approved = f >= T.clickApprove + 4;
    const pend = arrived ? (approved ? 2 : 3) : 2;
    $("[data-pend]", winB).textContent = String(pend);
    $("[data-pend-badge]", winB).textContent = `${pend} pendentes`;
    $("[data-people]", winB).textContent = `${arrived ? 3 : 2} pessoas`;
    $("[data-hours]", winB).textContent =
      arrived && !approved ? "117h 30min" : "77h 30min";
    $("[data-sub]", winB).textContent =
      `${pend} timesheets aguardando aprovação, distribuídos em 1 semana`;
    $("[data-badge] [data-pending]", winB).textContent = String(pend);
    const appr = $("[data-approve]", ana);
    const hovA = f >= 550 && f < 558;
    appr.style.background = hovA ? "#15803d" : "";
    appr.style.transform = `scale(${1 - 0.06 * bump(f, T.clickApprove, T.clickApprove + 7)})`;
    const actOut = P(f, T.clickApprove + 5, T.clickApprove + 14, E.inCubic);
    $("[data-actions]", ana).style.opacity = String(1 - actOut);
    const ok = spring(f, T.clickApprove + 3, 300, 15);
    $("[data-status-sub]", ana).style.opacity = String(
      1 - P(f, T.clickApprove + 2, T.clickApprove + 6),
    );
    const okEl = $("[data-status-ok]", ana);
    okEl.style.opacity = String(clamp(ok * 1.4));
    okEl.style.transform = `scale(${lerp(0.6, 1, ok)})`;
    const ringP2 = P(f, T.clickApprove + 3, T.clickApprove + 24, E.outCubic);
    const ringEl = $("[data-ring]", ana);
    ringEl.style.opacity = String(
      f >= T.clickApprove + 3 ? 0.9 * (1 - ringP2) : 0,
    );
    ringEl.style.transform = `scale(${lerp(0.6, 3.2, ringP2)})`;
    const sw = P(f, T.clickApprove + 3, T.clickApprove + 26, E.inOutCubic);
    const sweep = $("[data-sweep]", ana);
    sweep.style.opacity = String(
      f >= T.clickApprove + 3
        ? 1 - P(f, T.clickApprove + 18, T.clickApprove + 34)
        : 0,
    );
    sweep.style.transform = `translateX(${lerp(-100, 100, sw)}%)`;
    $("[data-dim]", winB).style.opacity = "0";
  }

  // ── Paper plane: from "Submeter semana" to the manager's queue ──
  const plane = $("#plane");
  const pa = T.clickSubmit + 3;
  const pb = 508;
  const planeOn = f >= pa && f <= pb + 2;
  plane.style.visibility = planeOn ? "" : "hidden";
  if (planeOn) {
    const p0 = project(camAt(pa, CAM_A), M.sendIcon.x, M.sendIcon.y);
    const p2 = project(camB, M.anaStatus.x, M.anaStatus.y);
    const p1 = [p0[0] + 240, Math.max(120, Math.min(p0[1], p2[1]) - 220)];
    const bez = (u) => [
      (1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0],
      (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1],
    ];
    const u = E.inOutCubic(clamp((f - pa) / (pb - pa)));
    const [x, y] = bez(u);
    const [x2, y2] = bez(Math.min(1, u + 0.01));
    const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + 45;
    const sc =
      lerp(0.5, 1, P(f, pa, pa + 8, E.outBack)) *
      lerp(1, 0.4, P(f, pb - 8, pb, E.inCubic));
    plane.style.transform = `translate(${x - 32}px, ${y - 32}px)`;
    $("#planeIcon").style.transform = `rotate(${ang}deg) scale(${sc})`;
    plane.style.opacity = String(1 - P(f, pb - 3, pb + 1));
  }

  // ── Captions + scrim ──
  const scrimA =
    P(f, 238, 258, E.outCubic) * (1 - P(f, 456, 474, E.inOutCubic));
  const scrimB = P(f, 500, 516, E.outCubic) * (1 - P(f, 596, 610));
  setT($("#scrim"), undefined, Math.max(scrimA, scrimB));
  const c1 = $("#cap1");
  const c2 = $("#cap2");
  const c3 = $("#cap3");
  c1.style.visibility = f >= 240 && f < 366 ? "" : "hidden";
  c2.style.visibility = f >= 374 && f < 470 ? "" : "hidden";
  c3.style.visibility = f >= 508 && f < 612 ? "" : "hidden";
  if (f >= 240 && f < 366) {
    const eb = P(f, 242, 258, E.outExpo);
    $("[data-eyebrow]", c1).style.cssText =
      `opacity:${eb};transform:translateY(${(1 - eb) * 16}px)`;
    revealWords($("h2", c1), f, 246, 4, 24);
    $$("[data-chip]", c1).forEach((el, i) => {
      const p = P(f, 266 + i * 5, 282 + i * 5, E.outBack);
      el.style.opacity = String(clamp(p));
      el.style.transform = `translateY(${(1 - p) * 14}px) scale(${lerp(0.9, 1, p)})`;
    });
    const lab = P(f, 262, 276, E.outCubic);
    $("[data-chips] > span:first-child", c1).style.opacity = String(lab);
    hideBlock(c1, f, 352, 364);
  }
  if (f >= 374 && f < 470) {
    const eb = P(f, 376, 392, E.outExpo);
    $("[data-eyebrow]", c2).style.cssText =
      `opacity:${eb};transform:translateY(${(1 - eb) * 16}px)`;
    revealWords($("h2", c2), f, 380, 4, 24);
    hideBlock(c2, f, 456, 468);
  }
  if (f >= 508 && f < 612) {
    const eb = P(f, 510, 526, E.outExpo);
    $("[data-eyebrow]", c3).style.cssText =
      `opacity:${eb};transform:translateY(${(1 - eb) * 16}px)`;
    const lines = $$("h2 > span", c3);
    revealWords(lines[0], f, T.clickApprove + 1, 4, 22);
    revealWords(lines[1], f, T.clickApprove + 8, 4, 22);
    hideBlock(c3, f, 594, 606);
  }

  // ── Cursor ──
  const cur = $("#cursor");
  const curOn = f >= 236 && f < 600;
  cur.style.visibility = curOn ? "" : "hidden";
  if (curOn) {
    const [x, y] = cursorPos(f, SEGS);
    cur.style.transform = `translate(${x}px, ${y}px)`;
    cur.style.opacity = String(P(f, 236, 246) * (1 - P(f, 584, 596)));
    let press = 0;
    let rip = null;
    for (const c of [
      T.clickFill,
      T.clickLaunch,
      T.clickSubmit,
      T.clickApprove,
    ]) {
      press = Math.max(press, bump(f, c - 2, c + 6));
      if (f >= c && f < c + 20) rip = (f - c) / 20;
    }
    $("#arrow").style.transform = `scale(${1 - 0.16 * press})`;
    const rp = $("#ripple");
    if (rip !== null) {
      const e = E.outCubic(rip);
      rp.style.opacity = String(0.75 * (1 - rip));
      rp.style.transform = `scale(${lerp(0.15, 1.1, e)})`;
    } else rp.style.opacity = "0";
  }

  // ── Outro ──
  const outro = $("#outro");
  const oOn = f >= T.outro - 4;
  outro.style.visibility = oOn ? "" : "hidden";
  if (oOn) {
    outro.style.transform = `scale(${lerp(1, 1.035, P(f, T.outro, DURATION, E.outCubic))})`;
    const brand = $("#outroBrand");
    const bp = P(f, T.outro, T.outro + 22, E.outExpo);
    brand.style.opacity = String(bp);
    brand.style.transform = `translateY(${(1 - bp) * 30}px)`;
    brand.style.filter = bp < 1 ? `blur(${(1 - bp) * 12}px)` : "none";
    const tp = spring(f, T.outro, 220, 14);
    $("#outroTile").style.transform =
      `scale(${lerp(0.4, 1, tp)}) rotate(${lerp(-20, 0, spring(f, T.outro, 140, 12))}deg)`;
    const lines = $$("#tagline > span");
    revealWords(lines[0], f, T.outro + 8, 3, 24);
    revealWords(lines[1], f, T.outro + 20, 4, 24);
    const pp = P(f, T.outro + 34, T.outro + 54, E.outExpo);
    const pill = $("#pill");
    pill.style.opacity = String(pp);
    pill.style.transform = `translateY(${(1 - pp) * 20}px)`;
    $("#outroSheen").style.transform =
      `translateX(${lerp(-90, 200, P(f, 668, 690, E.inOutCubic))}px) rotate(20deg)`;
  }

  // ── Grain: one plate per output frame (constant across motion-blur subframes) ──
  GRAIN.forEach((c, i) => {
    c.style.opacity = i === frameIdx % GRAIN.length ? "0.055" : "0";
  });
}

async function init() {
  build();
  buildGrain();
  winA = $("#winA");
  winB = $("#winB");
  await document.fonts.ready;
  await Promise.all(
    [
      "400 16px Sora",
      "700 16px Sora",
      "400 16px 'DM Sans'",
      "500 16px 'DM Sans'",
      "700 16px 'JetBrains Mono'",
    ].map((f) => document.fonts.load(f)),
  );
  await Promise.all(
    [...document.images].map((img) => img.decode().catch(() => {})),
  );
  measure();
  CAM_A = camKeysA();
  CAM_B = camKeysB();
  SEGS = cursorSegments(
    (fr) => camAt(fr, CAM_A),
    (fr) => camAt(fr, CAM_B),
  );
  seek(0);
  window.__ready = true;
}

const PROBES = [
  "#winA",
  "#winB",
  "#tile",
  "#plane",
  "#cursor",
  "[data-frag]",
  "[data-fri]",
  "#wordmark",
  "#hookText h1",
  "#outroBrand",
  "#tagline",
  "#pill",
  "[data-dlg-panel]",
  "[data-card='ana']",
];
function probeRects() {
  const out = [];
  for (const sel of PROBES) {
    for (const el of $$(sel)) {
      let vis = true;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (
          cs.visibility === "hidden" ||
          cs.display === "none" ||
          Number(cs.opacity) < 0.05
        ) {
          vis = false;
          break;
        }
      }
      const r = el.getBoundingClientRect();
      out.push(vis ? [r.left, r.top, r.right, r.bottom] : null);
    }
  }
  return out;
}
/** Largest on-screen corner travel (px) across a 180° shutter centred on frame f. */
window.motion = (f) => {
  seek(f - 0.25);
  const a = probeRects();
  seek(f + 0.25);
  const b = probeRects();
  let m = 0;
  a.forEach((ra, i) => {
    const rb = b[i];
    if (!ra || !rb) return;
    for (let k = 0; k < 4; k++) {
      const v = Math.min(Math.abs(ra[k] - rb[k]), 1200);
      const onScreen =
        k % 2 === 0 ? ra[k] > -50 && ra[k] < 1970 : ra[k] > -50 && ra[k] < 1130;
      if (onScreen) m = Math.max(m, v);
    }
  });
  return m;
};
window.seek = seek;
window.DURATION = DURATION;
window.T = T;
init();
