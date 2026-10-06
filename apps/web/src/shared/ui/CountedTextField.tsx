import { TextField } from "@/features/auth/ui/TextField";
import styles from "./CountedTextField.module.css";

interface CountedTextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  /** A short tip under the field, like how to write the purpose. */
  hint?: string;
}

/** A text field with its character counter on the label's line, like the
 * ones of the new class window. Single line fields can't go over the limit;
 * a long text can, then the counter turns red and the form says so. */
export function CountedTextField({
  id,
  label,
  value,
  onChange,
  max,
  error,
  required,
  disabled,
  multiline = false,
  rows = 3,
  hint,
}: CountedTextFieldProps) {
  const length = value.trim().length;
  return (
    <div className={styles.counted}>
      {multiline ? (
        <TextField
          id={id}
          label={label}
          multiline
          rows={rows}
          value={value}
          onChange={onChange}
          error={error}
          required={required}
          disabled={disabled}
        />
      ) : (
        <TextField
          id={id}
          label={label}
          value={value}
          onChange={onChange}
          error={error}
          required={required}
          disabled={disabled}
          maxLength={max}
        />
      )}
      <span className={length > max ? `${styles.counter} ${styles.counterOver}` : styles.counter} aria-hidden="true">
        {length}/{max}
      </span>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
