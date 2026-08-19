"use client";

import { useEffect, useRef, useState } from "react";
import {
  actionKey,
  hasExecuted,
  markExecuted,
} from "@/lib/ai/operator/executed-store";
import type { ConfirmableAction } from "@/lib/ai/types";
import { useOperatorPolicy } from "./use-operator-policy";

export interface AutoRunState {
  /** True while the action is about to run (or is running) without a click. */
  isAutoRunning: boolean;
  /** True when the policy delegates this action, for the "auto" badge. */
  willAutoRun: boolean;
}

/**
 * Runs a confirmation card's action without a click when the user delegated
 * that action in the operator settings.
 *
 * Two guards keep it honest: the durable executed-store (a reloaded card must
 * not fire again) and an instance ref (React re-invokes effects on remount).
 */
export function useAutoRunAction(
  action: ConfirmableAction,
  run: () => void | Promise<void>,
): AutoRunState {
  const { permissionFor, isLoading } = useOperatorPolicy();
  const [isAutoRunning, setIsAutoRunning] = useState(false);

  /** Latest callback, so a re-render never fires a stale closure. */
  const runRef = useRef(run);
  const firedRef = useRef(false);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const willAutoRun = !isLoading && permissionFor(action.kind) === "auto";

  useEffect(() => {
    if (!willAutoRun || firedRef.current) return;

    const key = actionKey(action);
    if (hasExecuted(key)) return;

    firedRef.current = true;
    markExecuted(key);
    setIsAutoRunning(true);

    Promise.resolve(runRef.current()).finally(() => setIsAutoRunning(false));
  }, [willAutoRun, action]);

  return { isAutoRunning, willAutoRun };
}
