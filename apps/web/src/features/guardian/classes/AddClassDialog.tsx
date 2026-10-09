import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { ClassroomPreview } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { classroomAudience } from "@/features/teacher/classrooms/classroomDetails";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { ClassroomBanner } from "@/features/teacher/classrooms/ClassroomBanner";
import { TeacherProfileSummary } from "@/features/teacher/profile/TeacherProfileSummary";
import { useClassroomLookup, useRequestEnrollment } from "@/shared/api/hooks/useClassroomsApi";
import { IconArrowDown, IconArrowLeft, IconBook, IconClose, IconTeacher } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import form from "@/shared/ui/profile/ProfileForm.module.css";
import { canAnimate, useModalDialog } from "@/shared/ui/useModalDialog";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { useWithPortalAccess } from "../portalAccess";
import kid from "../sections/MisPequesSection.module.css";
import { checkCode, CODE_MAX_LENGTH, isCompleteCode, normalizeCode } from "./classCode";
import { contentLabel } from "./lessonsLabel";
import styles from "./AddClassDialog.module.css";

// How long the teacher's profile takes to fold up. Same as reveal-close in the CSS.
const COLLAPSE_MS = 240;

interface AddClassDialogProps {
  studentId: string;
  firstName: string;
  onClose: () => void;
  /** The request went out, with the name of the class for the toast. */
  onSent: (classroomName: string) => void;
}

/** HU-40: the floating window to add a class. The mascot asks for the code,
 * "Buscar" waits until it can be one, and a good code shows the class and
 * its teacher (HU-97) before the guardian confirms sending the request. */
export function AddClassDialog({ studentId, firstName, onClose, onSent }: AddClassDialogProps) {
  const titleId = useId();
  const { ref, leaving, close } = useModalDialog<HTMLDivElement>();
  const withPortalAccess = useWithPortalAccess();
  const lookup = useClassroomLookup();
  const request = useRequestEnrollment();
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<ClassroomPreview | null>(null);
  const [showTeacher, setShowTeacher] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = checkCode(code);
  const busy = lookup.isPending || request.isPending;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function cancel() {
    if (!busy) close(onClose);
  }

  // Esc closes it, unless something is on its way.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!isCompleteCode(code) || busy) return;
    setError(null);
    try {
      setPreview(await withPortalAccess(() => lookup.mutateAsync(normalizeCode(code))));
      setShowTeacher(false);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  async function send() {
    if (!preview || busy) return;
    setError(null);
    try {
      await withPortalAccess(() => request.mutateAsync({ studentId, enrollmentCode: normalizeCode(code) }));
      close(() => onSent(preview.name));
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  function otherCode() {
    setPreview(null);
    setError(null);
    setCode("");
  }

  return createPortal(
    <div ref={ref} className={leaving ? `${styles.backdrop} ${styles.leaving}` : styles.backdrop}>
      <div
        className={preview ? `${styles.card} ${styles.cardWide}` : styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.top}>
          {preview ? (
            <button type="button" className={styles.backLink} onClick={otherCode} disabled={busy}>
              <IconArrowLeft width={16} height={16} />
              Usar otro código
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={styles.closeButton} onClick={cancel} aria-label="Cerrar" disabled={busy}>
            <IconClose width={20} height={20} />
          </button>
        </div>

        <h2 id={titleId} className={styles.title}>
          {preview ? "¿Es esta la clase?" : `Agregar una clase para ${firstName}`}
        </h2>

        {/* Going to the class and back plays the entrance, forward and back. */}
        <ViewEnter view={preview ? "preview" : "code"} level={preview ? 1 : 0} className={styles.body}>
          {!preview ? (
            <form className={styles.codeForm} onSubmit={search} noValidate>
              <Mascot mood={lookup.isPending ? "thinking" : "happy"} size="medium" wide>
                Escribe el código que te compartió el docente y te muestro su clase.
              </Mascot>

              {/* The field with its own notes, close together. */}
              <div className={styles.field}>
                <label htmlFor={`${titleId}-code`} className={styles.label}>
                  Código de la clase
                </label>
                <input
                  ref={inputRef}
                  id={`${titleId}-code`}
                  className={styles.codeInput}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError(null);
                  }}
                  maxLength={CODE_MAX_LENGTH + 4}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${titleId}-error` : undefined}
                />

                {!checks.allowed && code.trim() !== "" && (
                  <p className={styles.hint}>Solo letras, números y los símbolos # $ % & * + ? @.</p>
                )}

                {error && (
                  <p id={`${titleId}-error`} role="alert" className={styles.error}>
                    {error}
                  </p>
                )}
              </div>

              <div className={styles.actions}>
                <button type="button" className={form.secondaryButton} onClick={cancel} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className={form.primaryButton} disabled={!isCompleteCode(code) || busy}>
                  {lookup.isPending ? "Buscando…" : "Buscar clase"}
                </button>
              </div>
            </form>
          ) : (
            <ClassPreview
              preview={preview}
              firstName={firstName}
              showTeacher={showTeacher}
              onToggleTeacher={() => setShowTeacher((shown) => !shown)}
              error={error}
              sending={request.isPending}
              onCancel={cancel}
              onSend={() => void send()}
            />
          )}
        </ViewEnter>
      </div>
    </div>,
    document.body,
  );
}

interface ClassPreviewProps {
  preview: ClassroomPreview;
  firstName: string;
  showTeacher: boolean;
  onToggleTeacher: () => void;
  error: string | null;
  sending: boolean;
  onCancel: () => void;
  onSend: () => void;
}

// The class found: its avatar, name, who teaches it and what it's about,
// the teacher's profile on demand, and the question before sending.
function ClassPreview({
  preview,
  firstName,
  showTeacher,
  onToggleTeacher,
  error,
  sending,
  onCancel,
  onSend,
}: ClassPreviewProps) {
  const teacher = preview.teacher;
  const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}` : null;
  const audience = classroomAudience(preview.area, preview.grade, preview.area_other);
  const lessons =
    preview.published_lessons === null ? null : contentLabel(preview.published_units, preview.published_lessons);
  const [collapsing, setCollapsing] = useState(false);
  const expanded = showTeacher && !collapsing;
  const profileId = useId();
  const foldTimer = useRef<number | undefined>(undefined);

  // If the window closes in the middle of the fold, the timer goes with it.
  useEffect(() => () => window.clearTimeout(foldTimer.current), []);

  // Opening just shows it (the CSS unfolds it). Closing first plays the
  // fold, then takes it away; at once if the person wants less motion.
  function toggleTeacher() {
    if (!showTeacher) {
      onToggleTeacher();
      return;
    }
    if (collapsing) return;
    if (!canAnimate()) {
      onToggleTeacher();
      return;
    }
    setCollapsing(true);
    foldTimer.current = window.setTimeout(() => {
      setCollapsing(false);
      onToggleTeacher();
    }, COLLAPSE_MS);
  }

  return (
    <div className={styles.preview}>
      {/* The class as the teacher sees it: the band of its color with the
          avatar hanging from it, and its details beside it. */}
      <div className={styles.classHead}>
        <ClassroomBanner color={preview.color} height={84} />
        <div className={styles.classRow}>
          <span className={styles.classAvatar}>
            <ClassroomAvatar
              classroom={{
                id: preview.classroom_id,
                name: preview.name,
                color: preview.color,
                logo_file: preview.logo_file,
              }}
              size={72}
            />
          </span>
          <div className={styles.classText}>
            <p className={styles.className}>{preview.name}</p>
            {audience && <p className={styles.classMeta}>{audience}</p>}
            <p className={styles.classMeta}>
              <IconTeacher width={15} height={15} aria-hidden="true" />
              {teacherName ? `Con ${teacherName}` : "Docente no disponible por ahora"}
            </p>
            {lessons && (
              <p className={styles.classMeta}>
                <IconBook width={15} height={15} aria-hidden="true" />
                {lessons}
              </p>
            )}
            {/* What the teacher wrote about the class, with the same look as
                the lines above and a label that says what it is. */}
            <p className={styles.classDescription}>
              <span className={styles.descriptionLabel}>Descripción:</span> {preview.description}
            </p>
          </div>
        </div>
      </div>

      {teacher && (
        <>
          {/* Same row as the options of the portal, opening the profile below. */}
          <button
            type="button"
            className={`${kid.optionRow} ${styles.teacherRow}`}
            onClick={toggleTeacher}
            aria-expanded={expanded}
            aria-controls={showTeacher ? profileId : undefined}
          >
            <span className={kid.optionIcon} aria-hidden="true">
              <IconTeacher width={20} height={20} />
            </span>
            <span className={kid.optionText}>
              <span className={kid.optionTitle}>
                {expanded ? "Ocultar el perfil del docente" : "Ver el perfil del docente"}
              </span>
              <span className={kid.optionHint}>Su presentación, sus estudios y su experiencia.</span>
            </span>
            <IconArrowDown width={18} height={18} className={styles.teacherArrow} aria-hidden="true" />
          </button>
          {showTeacher && (
            <div
              id={profileId}
              className={collapsing ? `${styles.teacherReveal} ${styles.teacherRevealClosing}` : styles.teacherReveal}
            >
              <div className={styles.teacherRevealInner}>
                <TeacherProfileSummary
                  profile={teacher}
                  institution={teacher.institution}
                  title={`Perfil de ${teacherName}`}
                  note="Esta información la escribió el docente en su perfil."
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* The last question before sending, at the end of the window. */}
      <div className={styles.confirm}>
        <p className={styles.confirmText}>
          ¿Seguro que quieres enviar la solicitud para que <strong>{firstName}</strong> se una a esta clase? El docente
          la revisará y te avisaremos cuando responda.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={form.secondaryButton} onClick={onCancel} disabled={sending}>
            Cancelar
          </button>
          <button type="button" className={form.primaryButton} onClick={onSend} disabled={sending}>
            {sending ? "Enviando…" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}
