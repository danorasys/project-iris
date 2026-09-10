import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { IconEye, IconEyeOff } from "@/shared/ui/icons";
import styles from "./Fields.module.css";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  multiline?: false;
}

interface TextareaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "id"> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  multiline: true;
}

/** Labeled text field with an inline error announced to screen readers
 * (`role="alert"` plus `aria-describedby`), used across every auth form.
 * `multiline` switches it to a `<textarea>` for the optional support
 * condition field. */
export function TextField(props: TextFieldProps | TextareaFieldProps) {
  const { id, label, value, onChange, error, required } = props;
  const errorId = `${id}-error`;
  const isPassword = !props.multiline && props.type === "password";
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {props.multiline ? (
        <textarea
          id={id}
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={props.onBlur}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          rows={props.rows ?? 3}
          disabled={props.disabled}
          placeholder={props.placeholder}
        />
      ) : (
        <div className={isPassword ? styles.inputWithIcon : undefined}>
          <input
            id={id}
            className={styles.input}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={props.onBlur}
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            type={isPassword ? (showPassword ? "text" : "password") : props.type}
            autoComplete={props.autoComplete}
            placeholder={props.placeholder}
            inputMode={props.inputMode}
            min={props.min}
            max={props.max}
          />
          {isPassword && (
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          )}
        </div>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
