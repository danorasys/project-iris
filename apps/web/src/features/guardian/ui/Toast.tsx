import { useEffect } from "react";
import { IconCheck } from "@/shared/ui/icons";
import styles from "./Toast.module.css";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. */
  durationMs?: number;
}

/** A small floating message that shows up after saving something
 * successfully. It closes itself after a few seconds, and screen readers
 * announce it right away thanks to `role="status"` and `aria-live`, not
 * just people who can see it. */
export function Toast({ message, onDismiss, durationMs = 3500 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <IconCheck width={20} height={20} className={styles.icon} />
      <span>{message}</span>
    </div>
  );
}
