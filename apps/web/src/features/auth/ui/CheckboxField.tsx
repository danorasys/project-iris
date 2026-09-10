import type { ReactNode } from "react";
import styles from "./Fields.module.css";

interface CheckboxFieldProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  required?: boolean;
  error?: string;
}

/** Consent checkbox labeled with a long block of text. The `<label>` wraps
 * the `<input>`, so the whole paragraph is a click/tap target. */
export function CheckboxField({ id, checked, onChange, children, required, error }: CheckboxFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={styles.checkboxWrapper}>
      <label htmlFor={id} className={styles.checkbox}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <p>{children}</p>
      </label>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
