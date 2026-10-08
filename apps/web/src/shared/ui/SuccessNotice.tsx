import { useEffect, useState } from "react";
import { IconCheck, IconClose } from "./icons";
import styles from "./SuccessNotice.module.css";

// Same length as the notice-out animation in the CSS.
const LEAVE_MS = 280;

interface SuccessNoticeProps {
  title: string;
  message: string;
  onClose: () => void;
}

/** Floating card at the top of the screen that confirms something went
 * well, like a password change. It stays until the person closes it, so
 * there's time to read it, and screen readers announce it when it shows up. */
export function SuccessNotice({ title, message, onClose }: SuccessNoticeProps) {
  const [leaving, setLeaving] = useState(false);

  // The X first plays the "going up" animation and only then removes it.
  // Without animations (reduced motion) it closes right away.
  function close() {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setLeaving(true);
  }

  // Closes when the animation is over. A timer and not animationend, because
  // that event doesn't always arrive (a tab in the background, for example).
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onClose, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onClose]);

  return (
    <div className={leaving ? `${styles.notice} ${styles.leaving}` : styles.notice} role="status" aria-live="polite">
      <span className={styles.icon} aria-hidden="true">
        <IconCheck width={20} height={20} />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.message}>{message}</p>
      </div>
      <button type="button" className={styles.close} onClick={close} aria-label="Cerrar mensaje">
        <IconClose width={18} height={18} />
      </button>
    </div>
  );
}
