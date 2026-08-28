import {
  Bot,
  CheckSquare,
  Clock,
  Compass,
  type LucideIcon,
  Radar,
  Settings,
  Trophy,
} from "lucide-react";
import type { TourIconName } from "@/lib/onboarding/types";

/**
 * Icon lookup for onboarding content.
 *
 * Tour and checklist definitions are plain data (they cross the server/client
 * boundary through the API), so they carry an icon *name* and resolve it here.
 */
export const TOUR_ICONS: Record<TourIconName, LucideIcon> = {
  compass: Compass,
  clock: Clock,
  "check-square": CheckSquare,
  trophy: Trophy,
  bot: Bot,
  radar: Radar,
  settings: Settings,
};

export function resolveTourIcon(name: TourIconName): LucideIcon {
  return TOUR_ICONS[name] ?? Compass;
}
