import { useEffect, useState } from "react";
import { withViewTransition } from "./viewTransition";

// How long the save bar takes to slide out. Same as the save-bar-out
// animation in ProfileForm.module.css.
const SAVE_BAR_LEAVE_MS = 220;

/** What's being edited next to what's saved: the open field, whether
 * something changed and the save bar. `onDirtyChange` lets the portal warn
 * before leaving; `otherChanges` adds changes the same bar saves outside
 * these fields (the teacher profile). */
export function useProfileForm<T extends Record<string, string>>(
  initial: () => T,
  onDirtyChange?: (dirty: boolean) => void,
  otherChanges = false,
) {
  const [values, setValues] = useState<T>(initial);
  // The last saved values, to know if something changed and to undo it.
  const [original, setOriginal] = useState<T>(initial);
  const [editing, setEditing] = useState<keyof T | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Only these fields, and then anything the bar saves.
  const fieldsDirty = (Object.keys(values) as (keyof T)[]).some((key) => values[key] !== original[key]);
  const isDirty = fieldsDirty || otherChanges;

  // When the changes go away (discarded or saved) the bar stays on screen a
  // moment longer, so it can slide down instead of vanishing at once.
  const [saveBarShown, setSaveBarShown] = useState(isDirty);
  if (isDirty && !saveBarShown) setSaveBarShown(true);
  const saveBarLeaving = saveBarShown && !isDirty;

  useEffect(() => {
    if (!saveBarLeaving) return;
    const timer = window.setTimeout(() => setSaveBarShown(false), SAVE_BAR_LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [saveBarLeaving]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // When the form goes away, its unsaved changes go with it.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Warns before leaving the app with unsaved changes (closing the tab or
  // reloading). Moving inside the portal is handled by the portal itself.
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function setField(key: keyof T, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // Keeps what was typed. Only the keyboard (Enter) moves the focus back to
  // the pencil, a click outside leaves it wherever the person clicked.
  // `animate` is false when the field closes because a button was pressed
  // somewhere else (see EditingPanel): the field closes at once, so that
  // press reaches its button.
  function finishEditing(restoreFocus = false, animate = true) {
    if (!editing) return;
    const field = String(editing);
    withViewTransition(() => {
      setEditing(null);
      if (restoreFocus) focusEditButton(field);
    }, animate);
  }

  // Always goes back to the saved value, even if the field was already
  // changed and closed before opening it again.
  function cancelEditing() {
    if (!editing) return;
    const field = editing;
    withViewTransition(() => {
      setField(field, original[field]);
      setEditing(null);
      focusEditButton(String(field));
    });
  }

  function startEditing(field: keyof T) {
    withViewTransition(() => setEditing(field));
  }

  function discardChanges() {
    setValues(original);
    setEditing(null);
    setConfirmed(false);
  }

  /** After the server saved: these are now the saved values. */
  function markSaved(saved: T) {
    setValues(saved);
    setOriginal(saved);
    setEditing(null);
    setConfirmed(false);
  }

  /** Same props for every editable row, only the field changes. */
  function rowProps(field: keyof T & string, error: string | null = null) {
    return {
      field,
      editing: editing === field,
      onStartEdit: () => startEditing(field),
      onDone: finishEditing,
      onCancel: cancelEditing,
      error,
    };
  }

  return {
    values,
    original,
    isDirty,
    fieldsDirty,
    confirmed,
    setConfirmed,
    saveBarShown,
    saveBarLeaving,
    setField,
    discardChanges,
    markSaved,
    rowProps,
  };
}

export function editButtonId(field: string): string {
  return `perfil-editar-${field}`;
}

// After closing a field, the focus goes back to its pencil so keyboard
// users don't end up at the top of the page. It waits one frame because
// the pencil only exists again after the next render.
function focusEditButton(field: string) {
  requestAnimationFrame(() => document.getElementById(editButtonId(field))?.focus());
}
