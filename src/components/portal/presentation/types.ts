import type { PortalSnapshot } from "@/types/hq";

export type SlideId =
  | "cover"
  | "highlights"
  | "metrics"
  | "team"
  | "next_steps";

export interface SlideMeta {
  id: SlideId;
  index: number;
  title: string;
  shortTitle: string;
}

export interface PresentationDeckProps {
  snapshot: PortalSnapshot;
  onClose: () => void;
}

export interface SlideProps {
  snapshot: PortalSnapshot;
  isDeliverablesMode: boolean;
  onNavigate?: (index: number) => void;
}
