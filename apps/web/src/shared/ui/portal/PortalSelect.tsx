import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import fieldStyles from "@/features/auth/ui/Fields.module.css";
import { IconArrowDown, IconCheck } from "@/shared/ui/icons";
import styles from "./PortalSelect.module.css";

interface PortalSelectOption {
  value: string;
  label: string;
}

interface PortalSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly PortalSelectOption[];
  onChange: (value: string) => void;
  /** Shown while nothing is picked, like "Elige el área". */
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

/** Room the list keeps from the edges of the window. */
const EDGE = 16;
/** Below this much room under the button, the list opens upwards. */
const MIN_BELOW = 220;
const MAX_HEIGHT = 300;

// Under the button, or over it when there's no room below.
function placeUnder(button: HTMLElement): CSSProperties {
  const box = button.getBoundingClientRect();
  const below = window.innerHeight - box.bottom - EDGE;
  const above = box.top - EDGE;
  const up = below < MIN_BELOW && above > below;
  return {
    left: box.left,
    width: box.width,
    maxHeight: Math.min(MAX_HEIGHT, (up ? above : below) - 8),
    ...(up ? { bottom: window.innerHeight - box.top + 8 } : { top: box.bottom + 8 }),
  };
}

/** A select that looks like the panel: the list opens on a white card, since
 * the browser's own list can't be styled. The card is fixed (a dialog that
 * scrolls doesn't cut it) and opens upwards when there's no room below.
 * Inside a dialog it's drawn there, because a modal hides the rest from
 * screen readers. The keyboard works like the WAI-ARIA "select-only combobox". */
export function PortalSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Elige una opción",
  error,
  required,
  disabled,
}: PortalSelectProps) {
  const listId = useId();
  const errorId = `${id}-error`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const [host, setHost] = useState<Element | null>(null);
  // The option the arrows are on while the list is open.
  const [active, setActive] = useState(0);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const optionId = (index: number) => `${listId}-option-${index}`;

  // A click anywhere outside the field and the list closes it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Moves the list along when the dialog scrolls or the window changes size.
  useEffect(() => {
    if (!open) return;
    function measure() {
      if (buttonRef.current) setPlace(placeUnder(buttonRef.current));
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // Keeps the option the arrows are on in sight inside the list.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, listId]);

  function openAt(index: number) {
    const button = buttonRef.current;
    if (!button) return;
    setPlace(placeUnder(button));
    setHost(button.closest('[role="dialog"]') ?? document.body);
    setActive(Math.min(Math.max(index, 0), options.length - 1));
    setOpen(true);
  }

  function pick(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  }

  // The first option after the active one that starts with that letter.
  function findByLetter(letter: string) {
    const from = open ? active + 1 : selectedIndex + 1;
    for (let step = 0; step < options.length; step++) {
      const index = (from + step) % options.length;
      if (options[index]?.label.toLowerCase().startsWith(letter.toLowerCase())) return index;
    }
    return -1;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const start = selectedIndex >= 0 ? selectedIndex : 0;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openAt(event.key === "ArrowUp" && selectedIndex < 0 ? options.length - 1 : start);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        openAt(event.key === "Home" ? 0 : options.length - 1);
      } else if (event.key.length === 1 && /\S/.test(event.key)) {
        const found = findByLetter(event.key);
        if (found >= 0) openAt(found);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => Math.min(current + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (event.altKey) pick(active);
        else setActive((current) => Math.max(current - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(active);
        break;
      case "Escape":
        // Only the list closes, not the dialog it's in.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        pick(active);
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const found = findByLetter(event.key);
          if (found >= 0) setActive(found);
        }
    }
  }

  return (
    <div className={fieldStyles.field} ref={wrapperRef}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        className={`${fieldStyles.input} ${styles.trigger}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? styles.value : styles.placeholder}>{selected?.label ?? placeholder}</span>
        <span className={styles.chevron} data-open={open} aria-hidden="true">
          <IconArrowDown width={16} height={16} />
        </span>
      </button>

      {open &&
        host &&
        createPortal(
          // A mouse down on the list would take the focus from the button.
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-labelledby={id}
            className={styles.list}
            style={place}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === selectedIndex}
                className={styles.option}
                data-active={index === active}
                onPointerMove={() => setActive(index)}
                onClick={() => pick(index)}
              >
                <span>{option.label}</span>
                {index === selectedIndex && <IconCheck width={18} height={18} className={styles.check} />}
              </li>
            ))}
          </ul>,
          host,
        )}

      {error && (
        <p id={errorId} className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
