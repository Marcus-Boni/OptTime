import { z } from "zod";
import { CHECKLIST_TASKS } from "@/lib/onboarding/checklist";
import { TOURS } from "@/lib/onboarding/tours";

const tourIdSchema = z.enum(
  TOURS.map((tour) => tour.id) as [string, ...string[]],
);

const taskIdSchema = z.enum(
  CHECKLIST_TASKS.map((task) => task.id) as [string, ...string[]],
);

/**
 * Every mutation the client can request. A discriminated union keeps the route
 * handler exhaustive: adding an action here forces the switch to handle it.
 */
export const onboardingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_tour"), tourId: tourIdSchema }),
  z.object({ action: z.literal("complete_tour"), tourId: tourIdSchema }),
  z.object({
    action: z.literal("dismiss_welcome"),
    startedTour: z.boolean().default(false),
  }),
  z.object({ action: z.literal("complete_task"), taskId: taskIdSchema }),
  z.object({ action: z.literal("uncomplete_task"), taskId: taskIdSchema }),
  z.object({
    action: z.literal("dismiss_hint"),
    hintId: z.string().min(1).max(80),
  }),
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("reset") }),
]);

export type OnboardingActionInput = z.infer<typeof onboardingActionSchema>;
