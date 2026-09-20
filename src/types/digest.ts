import type { DigestPresentation } from "@/lib/digest/presenter";
import type { DigestAudience, DigestNarrative } from "@/lib/digest/types";

/**
 * Shape of `GET /api/digest/preview`.
 *
 * Lives here rather than next to the route so the modal, the settings card and
 * any future surface read the same contract instead of re-declaring it.
 */
export interface DigestPreviewResponse {
  audience: DigestAudience;
  available: boolean;
  /** Why there is nothing to show, when `available` is false. */
  reason?: string;
  narrative?: DigestNarrative;
  presentation?: DigestPresentation;
  lastSent?: { period: string; status: string; at: string } | null;
}
