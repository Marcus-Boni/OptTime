import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BklitChartTooltip,
  type BklitTooltipPayloadItem,
} from "@/components/ui/bklit-chart-tooltip";
import { KokonutStepLoader } from "@/components/ui/kokonut-loader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function renderTooltip(item: BklitTooltipPayloadItem): string {
  return renderToStaticMarkup(
    <BklitChartTooltip active label="Segunda-feira" payload={[item]} />,
  );
}

const gradientTooltip = renderTooltip({
  name: "Registrado",
  value: 4,
  color: "url(#daily-gradient)",
  payload: { color: "var(--chart-1)" },
});
assert.ok(
  gradientTooltip.includes("background-color:var(--chart-1)"),
  "SVG paint references must fall back to a solid series color in HTML markers",
);
assert.ok(!gradientTooltip.includes("background-color:url("));
assert.ok(gradientTooltip.includes("Registrado"));
assert.ok(gradientTooltip.includes("4h"));

const solidTooltip = renderTooltip({
  name: "Reuniões",
  value: 1.5,
  color: "var(--chart-5)",
});
assert.ok(solidTooltip.includes("background-color:var(--chart-5)"));

const fallbackTooltip = renderTooltip({
  name: "Registrado",
  value: 0,
  color: "url('#daily-gradient')",
  fill: "none",
});
assert.ok(fallbackTooltip.includes("background-color:var(--primary)"));
assert.ok(fallbackTooltip.includes("0h"));

assert.equal(
  renderToStaticMarkup(<BklitChartTooltip active={false} payload={[]} />),
  "",
);

const meetingsTooltip = renderToStaticMarkup(
  <BklitChartTooltip
    active
    payload={[{ name: "Reuniões", value: 1.5, color: "url(#meetings)" }]}
    colorFormatter={() => "var(--chart-5)"}
    valueFormatter={() => ["1h 30min", "Reuniões"]}
  />,
);
assert.ok(meetingsTooltip.includes("background-color:var(--chart-5)"));
assert.ok(meetingsTooltip.includes("1h 30min"));

const loading = renderToStaticMarkup(
  <KokonutStepLoader
    label="Montando o plano do dia"
    description="Você poderá revisar as sugestões antes de registrar as horas."
  />,
);
assert.equal((loading.match(/aria-live="polite"/g) ?? []).length, 1);
assert.ok(loading.includes("Montando o plano do dia"));
assert.ok(loading.includes("revisar as sugestões"));
assert.ok(
  !/role="progressbar"|aria-valuenow/.test(loading) &&
    !/Etapa|\bOK\b|\d+\/\d+|\d+%|\d+\.\d+s/.test(
      loading.replace(/<[^>]*>/g, " "),
    ),
  "Indeterminate loading must not claim measured progress or completed operations",
);
const status = loading.match(/<output\b[\s\S]*?<\/output>/)?.[0] ?? "";
assert.ok(status.includes("Montando o plano do dia"));
assert.ok(!status.includes("revisar as sugestões"));

const segmentedTabs = renderToStaticMarkup(
  <Tabs defaultValue="week">
    <TabsList variant="pill">
      <TabsTrigger value="day">Dia</TabsTrigger>
      <TabsTrigger value="week">Semana</TabsTrigger>
      <TabsTrigger value="month">Mês</TabsTrigger>
    </TabsList>
  </Tabs>,
);
assert.equal(
  (segmentedTabs.match(/data-slot="tabs-indicator"/g) ?? []).length,
  1,
  "Exactly one active tab indicator pill must render for the active tab",
);
assert.ok(segmentedTabs.includes('data-variant="pill"'));

console.info(
  "Visual components: solid series colors, values, indeterminate status and sliding tabs verified.",
);
