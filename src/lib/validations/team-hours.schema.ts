import { z } from "zod";

/** Calendar day in YYYY-MM-DD, the format stored in `time_entry.date`. */
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const optionalIsoDate = z
  .string()
  .regex(isoDatePattern, "Data no formato YYYY-MM-DD")
  .optional();

/** "all" is what the comboboxes send when no option is selected. */
const optionalId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .optional()
  .transform((value) => (value && value !== "all" ? value : undefined));

const baseFilters = {
  from: optionalIsoDate,
  to: optionalIsoDate,
  projectId: optionalId,
  userId: optionalId,
  /** Free text matched against description, person and project. */
  q: z.string().trim().max(120).optional(),
};

export const teamHoursSummaryQuerySchema = z.object(baseFilters);

export type TeamHoursSummaryQuery = z.infer<typeof teamHoursSummaryQuerySchema>;

export const teamHoursEntriesQuerySchema = z.object({
  ...baseFilters,
  sort: z.enum(["newest", "oldest", "longest"]).default("newest"),
  page: z.coerce.number().int().min(0).max(10_000).default(0),
  /** 500 covers a full PDF export without letting a caller drain the table. */
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
});

export type TeamHoursEntriesQuery = z.infer<typeof teamHoursEntriesQuerySchema>;

export const teamHoursCollaboratorQuerySchema = z.object({
  ...baseFilters,
  userId: z.string().trim().min(1).max(64),
});

export type TeamHoursCollaboratorQuery = z.infer<
  typeof teamHoursCollaboratorQuerySchema
>;

/** Turns URLSearchParams into a plain object, dropping empty values. */
export function searchParamsToObject(
  searchParams: URLSearchParams,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    if (value !== "") {
      result[key] = value;
    }
  }

  return result;
}
