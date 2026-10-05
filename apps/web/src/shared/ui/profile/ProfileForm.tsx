import { useEffect, useId, useRef, type ReactNode } from "react";
import { CheckboxField } from "@/features/auth/ui/CheckboxField";
import { IconInfo, IconPencil } from "@/shared/ui/icons";
import { editButtonId } from "./useProfileForm";
import { transitionName } from "./viewTransition";
import styles from "./ProfileForm.module.css";

// The pieces every editable profile shares (Mi perfil of the guardian and of
// the teacher, and the data of each kid), so all of them look and behave
// exactly the same.

/** How to edit, shown under the title of the first card of each profile.
 * One text for both, so they always say the same. */
export const EDIT_HINT =
  "Toca el lápiz o haz doble clic sobre un dato para cambiarlo. Al terminar, haz clic fuera de la casilla o pulsa Cancelar si cambias de decisión. Para que tus cambios queden guardados, pulsa \"Guardar cambios\" en la barra que aparecerá en la parte inferior.";

interface CardProps {
  id: string;
  icon: ReactNode;
  title: string;
  hint?: string;
  muted?: boolean;
  children: ReactNode;
}

export function Card({ id, icon, title, hint, muted = false, children }: CardProps) {
  return (
    <section
      className={muted ? `${styles.card} ${styles.cardMuted}` : styles.card}
      aria-labelledby={id}
      style={{ viewTransitionName: transitionName("profile-card", id) }}
    >
      <header className={styles.cardHeader}>
        <span className={styles.cardIcon} aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2 id={id} className={styles.cardTitle}>
            {title}
          </h2>
          {hint && <p className={styles.cardHint}>{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

interface EditableRowProps {
  field: string;
  label: string;
  displayValue: ReactNode;
  editing: boolean;
  onStartEdit: () => void;
  onDone: (restoreFocus?: boolean, animate?: boolean) => void;
  onCancel: () => void;
  error: string | null;
  children: ReactNode;
}

/** A value with a pencil. The pencil or a double click opens it to edit.
 * The closed row and the open panel share a transition name, so the browser
 * animates one growing into the other (see withViewTransition). */
export function EditableRow({
  field,
  label,
  displayValue,
  editing,
  onStartEdit,
  onDone,
  onCancel,
  error,
  children,
}: EditableRowProps) {
  const name = transitionName("profile-field", field);
  if (editing) {
    return (
      <EditingPanel name={name} onDone={onDone} onCancel={onCancel}>
        {children}
      </EditingPanel>
    );
  }
  return (
    <div
      className={error ? `${styles.field} ${styles.fieldInvalid}` : styles.field}
      style={{ viewTransitionName: name }}
      onDoubleClick={onStartEdit}
    >
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldValueRow}>
        <span className={styles.fieldValue}>{displayValue}</span>
        <button
          type="button"
          id={editButtonId(field)}
          className={styles.editButton}
          onClick={onStartEdit}
          aria-label={`Editar ${label.toLowerCase()}`}
          aria-describedby={error ? `${editButtonId(field)}-error` : undefined}
        >
          <IconPencil width={16} height={16} />
        </button>
      </div>
      {error && (
        <span id={`${editButtonId(field)}-error`} role="alert" className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}

// What can be pressed on the page. See onPointerDown in EditingPanel.
const CONTROLS = "button, a, input, select, textarea, label, [role='button'], [role='radio'], [role='checkbox']";

// The field while it's being edited. Clicking outside, Tab or Enter keep the
// change; Cancelar or Esc put back the saved value.
function EditingPanel({
  name,
  onDone,
  onCancel,
  children,
}: {
  name: string;
  onDone: (restoreFocus?: boolean, animate?: boolean) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // pointerdown and not blur: in some browsers clicking a button doesn't
    // focus it, so a blur would close the panel before Cancelar is clicked.
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element;
      if (panelRef.current?.contains(target)) return;
      // Pressing a button (Descartar, Guardar, another pencil) closes the
      // field without the animation. The animation starts on the press and
      // the browser then loses the click, so the button needed a second one.
      const onControl = target.closest?.(CONTROLS) != null;
      onDone(false, !onControl);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onDone]);

  return (
    <div
      ref={panelRef}
      className={styles.fieldEditing}
      style={{ viewTransitionName: name }}
      onBlur={(event) => {
        // Only when the focus goes somewhere else on the page (Tab).
        const next = event.relatedTarget;
        if (next && !panelRef.current?.contains(next)) onDone(false);
      }}
      onKeyDown={(event) => {
        // A text area keeps its Enter, that's how it gets a new line.
        const inTextArea = event.target instanceof HTMLTextAreaElement;
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && !inTextArea && !(event.target instanceof HTMLButtonElement)) {
          // Without this, Enter would try to submit the whole form.
          event.preventDefault();
          onDone(true);
        }
      }}
    >
      <div className={styles.fieldEditingInput}>{children}</div>
      <button type="button" className={styles.cancelEditingButton} onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}

export function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  // It has a name too, so it slides when a row above it opens.
  const name = transitionName("profile-row", useId());
  return (
    <div className={`${styles.field} ${styles.fieldReadOnly}`} style={{ viewTransitionName: name }}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}

interface SaveBarProps {
  /** The id of the <form> it saves. The bar goes at the end of the section,
   * outside the form, so it keeps floating while the whole section scrolls;
   * its save button reaches the form through this id. */
  formId: string;
  shown: boolean;
  /** Sliding out: it can't be used and screen readers already skip it. */
  leaving: boolean;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  hasErrors: boolean;
  error: string | null;
  saving: boolean;
  onDiscard: () => void;
}

/** The bar at the bottom that only shows up when something changed, with
 * the declaration, "Descartar" and "Guardar cambios". It goes last in the
 * section (not inside the `<form>`), so it floats over every card while
 * scrolling; "Guardar cambios" submits the form named by `formId`. */
export function SaveBar({
  formId,
  shown,
  leaving,
  confirmed,
  onConfirmedChange,
  hasErrors,
  error,
  saving,
  onDiscard,
}: SaveBarProps) {
  if (!shown) return null;
  return (
    <div
      className={leaving ? `${styles.saveBar} ${styles.saveBarLeaving}` : styles.saveBar}
      role={leaving ? undefined : "region"}
      aria-label={leaving ? undefined : "Cambios sin guardar"}
      aria-hidden={leaving || undefined}
      inert={leaving}
    >
      <div className={styles.saveBarText}>
        <p className={styles.saveBarTitle}>Tienes cambios sin guardar</p>
        {/* If this sentence changes, also change PROFILE_DECLARATION_VERSION
            in identity-service, so each saved change keeps which one was accepted. */}
        <CheckboxField id="perfil-declaro-veraz" checked={confirmed} onChange={onConfirmedChange}>
          Declaro que la información que modifiqué es correcta y veraz.
        </CheckboxField>
        {hasErrors && (
          <p className={styles.fixNotice}>
            <span className={styles.fixNoticeIcon} aria-hidden="true">
              <IconInfo width={16} height={16} />
            </span>
            <span>
              Corrige los datos <strong>marcados en rojo</strong> para poder guardar.
            </span>
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
      <div className={styles.saveBarButtons}>
        <button type="button" className={styles.secondaryButton} onClick={onDiscard}>
          Descartar
        </button>
        <button
          type="submit"
          form={formId}
          className={styles.primaryButton}
          disabled={!confirmed || hasErrors || saving}
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
