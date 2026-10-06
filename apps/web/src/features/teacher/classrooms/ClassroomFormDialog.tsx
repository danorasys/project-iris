import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { Classroom, ClassroomArea, ClassroomColor } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { SelectField } from "@/features/auth/ui/SelectField";
import { TextField } from "@/features/auth/ui/TextField";
import {
  useCreateClassroom,
  useRemoveClassroomLogo,
  useUpdateClassroom,
  useUploadClassroomLogo,
} from "@/shared/api/hooks/useClassroomsApi";
import {
  IconArrowRight,
  IconCheck,
  IconClassroom,
  IconClose,
  IconImage,
  IconInfo,
  IconPencil,
  IconText,
} from "@/shared/ui/icons";
import { ClassroomAvatar } from "./ClassroomAvatar";
import { AREA_OTHER_MAX, CLASSROOM_AREAS, CLASSROOM_GRADES, classroomAudience } from "./classroomDetails";
import { CLASSROOM_COLORS, classroomInitials } from "./classroomInitials";
import { ImageCropper } from "./ImageCropper";
import styles from "./ClassroomFormDialog.module.css";

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
// Same rules as the server's upload (POST /classrooms/{id}/logo).
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
// How long the closing animation takes. Same as dialog-out in the CSS.
const LEAVE_MS = 180;
const PREVIEW_SIZE = 88;

type AvatarMode = "initials" | "image";

interface Errors {
  name?: string;
  description?: string;
  area?: string;
  areaOther?: string;
  grade?: string;
  image?: string;
}

interface ClassroomFormDialogProps {
  /** The classroom to edit. Without it, the dialog creates a new one. */
  classroom?: Classroom;
  onClose: () => void;
  /** After saving, with what to tell the teacher in a toast. */
  onSaved: (classroom: Classroom, message: string) => void;
}

// Same check as ConfirmDialog: no animation when the person asked for less
// motion, or where the browser can't tell (the tests).
function canAnimate(): boolean {
  return typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The window to create (HU-73) or edit (HU-90) a class: name, description,
 * area and grade (HU-100) and avatar, with a live preview of its card in
 * "Mis clases" on the left. Drawn on <body>, the app behind stays inert. */
export function ClassroomFormDialog({ classroom, onClose, onSaved }: ClassroomFormDialogProps) {
  const titleId = useId();
  const introId = useId();
  const editing = classroom !== undefined;
  const [name, setName] = useState(classroom?.name ?? "");
  const [description, setDescription] = useState(classroom?.description ?? "");
  const [color, setColor] = useState<ClassroomColor>(classroom?.color ?? "blue");
  const [area, setArea] = useState<ClassroomArea | "">(classroom?.area ?? "");
  const [areaOther, setAreaOther] = useState(classroom?.area_other ?? "");
  const [grade, setGrade] = useState<number | null>(classroom?.grade ?? null);
  const [mode, setMode] = useState<AvatarMode>(classroom?.logo_file ? "image" : "initials");
  const [file, setFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<Blob | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const create = useCreateClassroom();
  const update = useUpdateClassroom();
  const upload = useUploadClassroomLogo();
  const removeLogo = useRemoveClassroomLogo();
  const saving = create.isPending || update.isPending || upload.isPending || removeLogo.isPending;

  // Plays the closing animation, then does what was chosen.
  function close(then: () => void) {
    if (leaving) return;
    if (!canAnimate()) {
      then();
      return;
    }
    setLeaving(true);
    window.setTimeout(then, LEAVE_MS);
  }

  // Freezes the app behind while it's open, and gives the focus back to
  // the button that opened it when it closes. The name is the first thing
  // to fill in.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.getElementById("root");
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    document.getElementById("clase-name")?.focus();
    return () => {
      if (app) app.inert = wasInert;
      if (before?.isConnected) before.focus();
    };
  }, []);

  // Escape closes it, unless it's in the middle of saving.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) close(onClose);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // The preview shows the crop from a temporary URL, freed when a new
  // crop replaces it or the dialog closes.
  useEffect(() => {
    if (!cropUrl) return;
    return () => URL.revokeObjectURL(cropUrl);
  }, [cropUrl]);

  function takeCrop(blob: Blob) {
    setCrop(blob);
    setCropUrl(URL.createObjectURL(blob));
  }

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    if (!IMAGE_TYPES.includes(picked.type)) {
      setErrors((current) => ({
        ...current,
        image: "Elige una imagen PNG, JPEG, WEBP o GIF.",
      }));
      return;
    }
    if (picked.size > IMAGE_MAX_BYTES) {
      setErrors((current) => ({
        ...current,
        image: "La imagen no puede pesar más de 5 MB.",
      }));
      return;
    }
    setErrors((current) => ({ ...current, image: undefined }));
    setCrop(null);
    setCropUrl(null);
    setFile(picked);
  }

  function check(): Errors {
    const found: Errors = {};
    if (!name.trim()) found.name = "Escribe el nombre de la clase.";
    else if (name.trim().length > NAME_MAX) found.name = `El nombre puede tener máximo ${NAME_MAX} caracteres.`;
    if (!description.trim()) found.description = "Escribe una descripción de la clase.";
    else if (description.trim().length > DESCRIPTION_MAX)
      found.description = `La descripción puede tener máximo ${DESCRIPTION_MAX} caracteres.`;
    if (!area) found.area = "Elige el área de la clase.";
    else if (area === "other" && !areaOther.trim()) found.areaOther = "Escribe cuál es el área de la clase.";
    if (grade === null) found.grade = "Elige el grado de la clase.";
    if (mode === "image" && !crop && !classroom?.logo_file) found.image = "Elige la imagen de la clase.";
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const found = check();
    setErrors(found);
    const first = (["name", "description", "area", "areaOther", "grade", "image"] as const).find(
      (field) => found[field],
    );
    if (first) {
      document.getElementById(`clase-${first}`)?.focus();
      return;
    }

    // check() already made sure area and grade are there.
    const body = {
      name: name.trim(),
      description: description.trim(),
      color,
      area: area as ClassroomArea,
      area_other: area === "other" ? areaOther.trim() : null,
      grade: grade as number,
    };
    let saved: Classroom;
    try {
      saved = editing ? await update.mutateAsync({ classroomId: classroom.id, body }) : await create.mutateAsync(body);
    } catch (error) {
      setSubmitError(getAuthErrorMessage(error));
      return;
    }

    // The picture goes after the classroom exists. If it fails, the
    // classroom is still saved and the teacher can try again from "Editar".
    try {
      if (mode === "image" && crop) {
        saved = await upload.mutateAsync({
          classroomId: saved.id,
          file: new File([crop], "logo.png", { type: "image/png" }),
        });
      } else if (mode === "initials" && saved.logo_file) {
        saved = await removeLogo.mutateAsync(saved.id);
      }
    } catch (error) {
      const message = `${editing ? "Los cambios se guardaron" : "La clase se creó"}, pero la imagen no: ${getAuthErrorMessage(error)}`;
      close(() => onSaved(saved, message));
      return;
    }
    const done = saved;
    close(() => onSaved(done, editing ? "Los cambios de la clase se guardaron." : "La clase se creó."));
  }

  // What the card in "Mis clases" will show: the new crop, the picture it
  // already has, or the initials on the picked color.
  const previewName = name.trim() || (editing ? classroom.name : "");
  let previewAvatar = (
    <ClassroomAvatar
      classroom={{
        id: "nueva",
        name: previewName || "Clase",
        color,
        logo_file: null,
      }}
      size={PREVIEW_SIZE}
    />
  );
  if (mode === "image" && cropUrl) {
    previewAvatar = (
      <img src={cropUrl} alt="" className={styles.previewImage} width={PREVIEW_SIZE} height={PREVIEW_SIZE} />
    );
  } else if (mode === "image" && classroom?.logo_file) {
    previewAvatar = <ClassroomAvatar classroom={classroom} size={PREVIEW_SIZE} />;
  }

  const pickedColor = CLASSROOM_COLORS.find((option) => option.value === color);
  const audience = classroomAudience(area || null, grade, areaOther.trim());
  const descriptionLength = description.trim().length;

  return createPortal(
    <div
      className={leaving ? `${styles.backdrop} ${styles.leaving}` : styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={introId}
    >
      <form className={styles.card} onSubmit={submit} noValidate>
        {/* Light header with the board in rings, like ConfirmDialog. */}
        <header className={styles.header}>
          <span className={styles.badge} aria-hidden="true">
            {editing ? <IconPencil width={26} height={26} /> : <IconClassroom width={28} height={28} />}
          </span>
          <div className={styles.headerText}>
            <p className={styles.eyebrow}>Mis clases</p>
            <h2 id={titleId} className={styles.title}>
              {editing ? "Editar clase" : "Nueva clase"}
            </h2>
            <p id={introId} className={styles.intro}>
              {editing
                ? "Cambia el nombre, la descripción o el avatar de la clase."
                : "Ponle un nombre, cuenta de qué trata y elige cómo se verá."}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => close(onClose)}
            disabled={saving}
            aria-label="Cerrar"
          >
            <IconClose width={20} height={20} />
          </button>
        </header>

        <div className={styles.body}>
          {/* The live preview, the same card of "Mis clases". */}
          <aside className={styles.previewColumn} aria-label="Vista previa">
            <div className={styles.previewSticky}>
              <p className={styles.previewLabel}>Así se verá en Mis clases</p>
              <div className={styles.previewCard} aria-hidden="true">
                <span className={styles.previewRing}>{previewAvatar}</span>
                <span className={previewName ? styles.previewName : `${styles.previewName} ${styles.previewEmpty}`}>
                  {previewName || "Nombre de la clase"}
                </span>
                {audience && <span className={styles.previewAudience}>{audience}</span>}
                <span className={styles.previewAction}>
                  Entrar a la clase
                  <IconArrowRight width={16} height={16} />
                </span>
              </div>
              {!editing && (
                <p className={styles.note}>
                  <IconInfo width={18} height={18} aria-hidden="true" />
                  <span>
                    Al crearla, IRIS le da un código de ingreso. Compártelo con las familias de tus estudiantes para que
                    se unan.
                  </span>
                </p>
              )}
            </div>
          </aside>

          <div className={styles.fields}>
            <section className={styles.step} aria-labelledby={`${titleId}-datos`}>
              <h3 id={`${titleId}-datos`} className={styles.stepTitle}>
                <span className={styles.stepNumber} aria-hidden="true">
                  1
                </span>
                Datos de la clase
              </h3>
              <div className={styles.counted}>
                <TextField
                  id="clase-name"
                  label="Nombre de la clase"
                  value={name}
                  onChange={(value) => {
                    setName(value);
                    setErrors((current) => ({ ...current, name: undefined }));
                  }}
                  error={errors.name}
                  required
                  maxLength={NAME_MAX}
                  disabled={saving}
                />
                <span className={styles.counter} aria-hidden="true">
                  {name.trim().length}/{NAME_MAX}
                </span>
              </div>
              <div className={styles.counted}>
                <TextField
                  id="clase-description"
                  label="Descripción"
                  multiline
                  rows={4}
                  value={description}
                  onChange={(value) => {
                    setDescription(value);
                    setErrors((current) => ({
                      ...current,
                      description: undefined,
                    }));
                  }}
                  error={errors.description}
                  required
                  disabled={saving}
                  placeholder="Cuenta de qué trata la clase y qué aprenderán tus estudiantes en ella."
                />
                <span
                  className={
                    descriptionLength > DESCRIPTION_MAX ? `${styles.counter} ${styles.counterOver}` : styles.counter
                  }
                  aria-hidden="true"
                >
                  {descriptionLength}/{DESCRIPTION_MAX}
                </span>
              </div>
            </section>

            {/* The area of Ley 115 (or "Otra") and one grade, so families see how
                the class fits with school. */}
            <section className={styles.step} aria-labelledby={`${titleId}-para-quien`}>
              <h3 id={`${titleId}-para-quien`} className={styles.stepTitle}>
                <span className={styles.stepNumber} aria-hidden="true">
                  2
                </span>
                ¿De qué es y para quién?
              </h3>
              <p className={styles.stepHint}>
                Ayuda a las familias a ubicar la clase junto a lo que sus peques ven en el colegio.
              </p>
              <SelectField
                id="clase-area"
                label="Área"
                value={area}
                onChange={(value) => {
                  setArea(value as ClassroomArea);
                  setErrors((current) => ({ ...current, area: undefined }));
                }}
                options={[{ value: "", label: "Elige el área", disabled: true }, ...CLASSROOM_AREAS]}
                error={errors.area}
                required
                disabled={saving}
              />
              {/* Only with "Otra": then the teacher writes which area it is. */}
              {area === "other" && (
                <TextField
                  id="clase-areaOther"
                  label="¿Cuál área?"
                  value={areaOther}
                  onChange={(value) => {
                    setAreaOther(value);
                    setErrors((current) => ({ ...current, areaOther: undefined }));
                  }}
                  error={errors.areaOther}
                  required
                  maxLength={AREA_OTHER_MAX}
                  disabled={saving}
                />
              )}
              <fieldset
                className={styles.grades}
                disabled={saving}
                aria-invalid={Boolean(errors.grade) || undefined}
                aria-describedby={errors.grade ? "clase-grade-error" : undefined}
              >
                <legend className={styles.gradesLegend}>
                  Grado<span aria-hidden="true"> *</span>
                </legend>
                <div className={styles.gradeOptions}>
                  {CLASSROOM_GRADES.map((option, index) => (
                    <label key={option.value} className={styles.gradeOption}>
                      <input
                        // The first one takes the focus when no grade was picked.
                        id={index === 0 ? "clase-grade" : undefined}
                        type="radio"
                        name="clase-grade"
                        checked={grade === option.value}
                        onChange={() => {
                          setGrade(option.value);
                          setErrors((current) => ({ ...current, grade: undefined }));
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                {errors.grade && (
                  <p id="clase-grade-error" role="alert" className={styles.error}>
                    {errors.grade}
                  </p>
                )}
              </fieldset>
            </section>

            <fieldset className={styles.step} disabled={saving}>
              <legend className={styles.stepTitle}>
                <span className={styles.stepNumber} aria-hidden="true">
                  3
                </span>
                <span>
                  Avatar de la clase<span aria-hidden="true"> *</span>
                </span>
              </legend>

              {/* Two options on a track, the white thumb slides to the picked one. */}
              <div
                className={mode === "image" ? `${styles.modes} ${styles.modesImage}` : styles.modes}
                role="radiogroup"
                aria-label="Tipo de avatar"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === "initials"}
                  className={mode === "initials" ? `${styles.mode} ${styles.modeActive}` : styles.mode}
                  onClick={() => setMode("initials")}
                >
                  <IconText width={18} height={18} /> Iniciales y color
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === "image"}
                  className={mode === "image" ? `${styles.mode} ${styles.modeActive}` : styles.mode}
                  onClick={() => setMode("image")}
                >
                  <IconImage width={18} height={18} /> Imagen propia
                </button>
              </div>

              {mode === "initials" ? (
                <div className={styles.option}>
                  <p className={styles.optionText}>
                    Las letras <strong className={styles.letters}>{classroomInitials(previewName || "Clase")}</strong>{" "}
                    salen del nombre. Elige el color:
                  </p>
                  <div className={styles.colors} role="radiogroup" aria-label="Color del avatar">
                    {CLASSROOM_COLORS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={color === option.value}
                        aria-label={option.label}
                        title={option.label}
                        className={`${styles.swatch} ${styles[option.value]} ${color === option.value ? styles.swatchActive : ""}`}
                        onClick={() => setColor(option.value)}
                      >
                        {color === option.value && <IconCheck width={18} height={18} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                  <p className={styles.colorName}>{pickedColor?.label}</p>
                </div>
              ) : (
                <div className={styles.option}>
                  {file && <ImageCropper file={file} onChange={takeCrop} />}
                  {/* The real file input stays for keyboards and screen readers, unseen. */}
                  <label className={file || classroom?.logo_file ? styles.pickButton : styles.dropZone}>
                    {!file && !classroom?.logo_file && (
                      <span className={styles.dropIcon} aria-hidden="true">
                        <IconImage width={26} height={26} />
                      </span>
                    )}
                    <span className={styles.dropTitle}>
                      {file || classroom?.logo_file ? "Elegir otra imagen" : "Elegir una imagen"}
                    </span>
                    {!file && !classroom?.logo_file && (
                      <span className={styles.dropHint}>PNG, JPEG, WEBP o GIF, hasta 5 MB.</span>
                    )}
                    <input
                      id="clase-image"
                      type="file"
                      accept={IMAGE_TYPES.join(",")}
                      className={styles.fileInput}
                      onChange={pickImage}
                    />
                  </label>
                  {errors.image && (
                    <p role="alert" className={styles.error}>
                      {errors.image}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          </div>
        </div>

        {/* Always at the bottom, so the buttons never scroll away. */}
        <footer className={styles.footer}>
          {submitError && (
            <p role="alert" className={styles.error}>
              {submitError}
            </p>
          )}
          <div className={styles.buttons}>
            <button type="button" className={styles.cancelButton} onClick={() => close(onClose)} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.saveButton} disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear clase"}
            </button>
          </div>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
