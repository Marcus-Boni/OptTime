/**
 * Guards the onboarding contract.
 *
 * Tour steps point at the UI through `data-tour` anchors. Nothing in the type
 * system connects a selector string to the JSX that carries it, so a renamed or
 * deleted anchor silently turns into a skipped step. This script closes that
 * gap: it fails when a tour targets an anchor that no longer exists.
 *
 * Run with: pnpm verify:onboarding
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CHECKLIST_TASKS } from "../src/lib/onboarding/checklist";
import { TOURS } from "../src/lib/onboarding/tours";

const SOURCE_DIR = "src";
const TARGET_PATTERN = /^\[data-tour="([a-z0-9-]+)"\]$/;
/**
 * Matches the JSX attribute but not the CSS selector `[data-tour="…"]` — the
 * leading bracket is what separates a real anchor from a tour step quoting one.
 * Without that guard `tours.ts` would vouch for its own selectors.
 */
const ANCHOR_PATTERN = /(?<!\[)data-tour="([a-z0-9-]+)"/g;

/**
 * Anchors the sidebar builds from the route (`getNavTourId`), so they never
 * appear as string literals. Keep in sync with the sidebar navigation arrays.
 */
const DERIVED_ANCHORS = new Set([
  "nav-dashboard",
  "nav-time",
  "nav-journey",
  "nav-projects",
  "nav-suggestions",
  "nav-settings",
  "nav-hq",
  "nav-timesheets",
  "nav-team-hours",
  "nav-people",
]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function collectDeclaredAnchors(): Set<string> {
  const anchors = new Set<string>();

  for (const file of collectSourceFiles(SOURCE_DIR)) {
    const content = readFileSync(file, "utf8");
    for (const found of content.matchAll(ANCHOR_PATTERN)) {
      if (found[1]) anchors.add(found[1]);
    }
  }

  return anchors;
}

function main(): void {
  const problems: string[] = [];
  const referenced = new Set<string>();

  for (const tour of TOURS) {
    if (tour.steps.length === 0) {
      problems.push(`tour "${tour.id}" has no steps`);
    }

    for (const step of tour.steps) {
      if (!step.target) continue;

      const anchor = step.target.match(TARGET_PATTERN)?.[1];
      if (!anchor) {
        problems.push(
          `tour "${tour.id}" step "${step.id}" uses a non-contract selector: ${step.target}`,
        );
        continue;
      }

      referenced.add(anchor);
    }
  }

  const declared = collectDeclaredAnchors();

  for (const anchor of referenced) {
    if (!declared.has(anchor) && !DERIVED_ANCHORS.has(anchor)) {
      problems.push(`no element declares data-tour="${anchor}"`);
    }
  }

  for (const task of CHECKLIST_TASKS) {
    if (task.kind === "tour") {
      if (!task.tourId) {
        problems.push(
          `checklist task "${task.id}" is kind "tour" without tourId`,
        );
      } else if (!TOURS.some((tour) => tour.id === task.tourId)) {
        problems.push(
          `checklist task "${task.id}" points at unknown tour "${task.tourId}"`,
        );
      }
    }

    if (task.kind === "signal" && !task.signal) {
      problems.push(
        `checklist task "${task.id}" is kind "signal" without signal`,
      );
    }
  }

  const stepCount = TOURS.reduce((total, tour) => total + tour.steps.length, 0);
  console.log(
    `onboarding: ${TOURS.length} tours, ${stepCount} steps, ${referenced.size} anchors referenced, ${CHECKLIST_TASKS.length} checklist tasks`,
  );

  if (problems.length > 0) {
    console.error("\nOnboarding contract violations:");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("\nSee docs/onboarding.md");
    process.exit(1);
  }

  console.log("onboarding contract OK");
}

main();
