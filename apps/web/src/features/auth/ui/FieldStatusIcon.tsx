import { Check, X } from "lucide-react";
import styles from "./Fields.module.css";

/** How a field was left: well written or with something to fix. */
export type FieldStatus = "valid" | "invalid";

/** The check or the cross on the right of a field, once it's been left.
 * Only a picture: the error text under the field (and aria-invalid) is
 * what tells a screen reader, and the color is never the only clue. */
export function FieldStatusIcon({ status, inline = false }: { status?: FieldStatus; inline?: boolean }) {
  if (!status) return null;
  return (
    // The key plays the little pop again when it goes from one to the other.
    <span
      key={status}
      className={`${styles.statusIcon} ${inline ? styles.statusIconInline : ""}`}
      data-status={status}
      aria-hidden="true"
    >
      {status === "valid" ? <Check size={14} strokeWidth={3.2} /> : <X size={14} strokeWidth={3.2} />}
    </span>
  );
}
