"use client";

import React, { useEffect, useState } from "react";

export interface MachineCountdownTimerProps {
  initialSeconds: number | null;
  isRunning: boolean;
  isPaused: boolean;
}

export function formatCountdownSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  const clock = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${clock} (${safe} s)`;
}

/**
 * Smooth client-side 1-second countdown timer for running and paused machine cycles.
 * Keyed by active cycle identity so state initializes cleanly without synchronous effect state updates.
 */
export function MachineCountdownTimer({
  initialSeconds,
  isRunning,
  isPaused,
}: MachineCountdownTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() =>
    initialSeconds !== null && Number.isFinite(initialSeconds)
      ? Math.max(0, Math.round(initialSeconds))
      : null,
  );

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isRunning]);

  if ((!isRunning && !isPaused) || remainingSeconds === null) {
    return <>—</>;
  }

  return <>{formatCountdownSeconds(remainingSeconds)}</>;
}
