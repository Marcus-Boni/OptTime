/**
 * Deep links into the AI Operator settings.
 *
 * The settings page reads `?tab=` from the URL, so every surface that points
 * users at the operator configuration shares these constants instead of
 * hard-coding the query string.
 */

/** "Operador IA" tab — modes, per-action permissions, voice and weekly digest. */
export const OPERATOR_SETTINGS_PATH = "/dashboard/settings?tab=operator";
