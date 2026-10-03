import { toggleSupportCondition, type SupportConditionOption } from "@/features/utils/supportCondition";
import styles from "./Fields.module.css";

interface SupportConditionsFieldProps {
  id: string;
  label: string;
  /** The catalog, in the order it is shown. */
  options: readonly SupportConditionOption[];
  /** The ids of the chosen conditions. */
  value: readonly number[];
  onChange: (value: number[]) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

/** The conditions of a kid as a list of checkboxes, because a kid can have
 * more than one. Used in the registration and in the parents' portal, so
 * both follow the same rule (see toggleSupportCondition). */
export function SupportConditionsField({
  id,
  label,
  options,
  value,
  onChange,
  error,
  required,
  disabled,
}: SupportConditionsFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    // tabIndex lets the form move the focus here when nothing was chosen.
    <fieldset
      id={id}
      className={styles.checkGroup}
      tabIndex={-1}
      disabled={disabled}
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      aria-invalid={Boolean(error) || undefined}
    >
      <legend className={styles.label}>
        {label}
        {required && " *"}
      </legend>
      <p id={hintId} className={styles.checkGroupHint}>
        Puedes marcar una o varias.
      </p>
      <div className={styles.checkGroupOptions}>
        {options.map((option) => (
          <label key={option.id} className={styles.checkOption}>
            <input
              type="checkbox"
              checked={value.includes(option.id)}
              onChange={() => onChange(toggleSupportCondition(value, option.id, options))}
            />
            <span>{option.name}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
