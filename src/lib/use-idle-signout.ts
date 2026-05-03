import { useEffect, useRef } from "react";

const IDLE_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;

type Options = {
  thresholdMs: number;
  enabled: boolean;
  onIdle: () => void;
};

export function useIdleSignOut({ thresholdMs, enabled, onIdle }: Options) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlerRef = useRef(onIdle);

  useEffect(() => {
    handlerRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled || thresholdMs <= 0) {
      return;
    }

    function reset() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        handlerRef.current();
      }, thresholdMs);
    }

    reset();
    for (const event of IDLE_EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        reset();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      for (const event of IDLE_EVENTS) {
        window.removeEventListener(event, reset);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, thresholdMs]);
}
