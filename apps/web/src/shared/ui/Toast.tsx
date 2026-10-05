import { useEffect, useRef, useState } from "react";
import { IconCheck } from "@/shared/ui/icons";
import styles from "./Toast.module.css";

// How long the closing animation takes. Same as toast-out in Toast.module.css.
const LEAVE_MS = 240;

interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** How long it stays on screen, in ms, before it starts to go away. */
  durationMs?: number;
}

/** A small message after saving something. It slides in, stays a few
 * seconds and slides out. `role="status"` makes screen readers say it too. */
export function Toast({ message, onDismiss, durationMs = 3500 }: ToastProps) {
  const [leaving, setLeaving] = useState(false);
  // The parents pass a new function on every render; keeping the latest one
  // here stops a re-render from restarting the closing timer.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);

  // Once it starts to leave, it's removed when the animation is over. With
  // less motion asked for there is no animation, so it goes at once.
  useEffect(() => {
    if (!leaving) return;
    const lessMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => dismiss.current(), lessMotion ? 0 : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <div className={leaving ? `${styles.toast} ${styles.leaving}` : styles.toast} role="status" aria-live="polite">
      {/* A white circle with a green check, so it stands out on the dark blue. */}
      <span className={styles.badge} aria-hidden="true">
        <IconCheck width={16} height={16} strokeWidth={3} className={styles.icon} />
      </span>
      <span>{message}</span>
    </div>
  );
}
