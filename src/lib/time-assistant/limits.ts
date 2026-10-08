/**
 * Limits shared by the "Preencher meu dia" flows.
 *
 * Kept apart from `day-plan.ts` on purpose: the apply route only needs this
 * number, and importing it from the engine would pull the Azure DevOps client,
 * the Graph layer and the AI provider into that route's bundle.
 */

/** How far back a day may be planned or filled, in days. Matches manual entry. */
export const MAX_BACKFILL_DAYS = 30;
