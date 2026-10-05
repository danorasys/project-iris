import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from "react";
import type { Classroom, ClassroomColor } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { TextField } from "@/features/auth/ui/TextField";
import {
  useCreateClassroom,
  useRemoveClassroomLogo,
  useUpdateClassroom,
  useUploadClassroomLogo,
} from "@/shared/api/hooks/useClassroomsApi";
import { IconImage, IconText } from "@/shared/ui/icons";
import { ClassroomAvatar } from "./ClassroomAvatar";
import { CLASSROOM_COLORS } from "./classroomInitials";
import { ImageCropper } from "./ImageCropper";
import styles from "./ClassroomFormDialog.module.css";

const NAME_MAX = 120;
const DESCRIPTION_MAX = 1000;
// Same rules as the server's upload (POST /classrooms/{id}/logo).
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

type AvatarMode = "initials" | "image";

interface Errors {
  name?: string;
  description?: string;
  image?: string;
}

interface ClassroomFormDialogProps {
  /** The classroom to edit. Without it, the dialog creates a new one. */
  classroom?: Classroom;
  onClose: () => void;
  /** After saving, with what to tell the teacher in a toast. */
  onSaved: (classroom: Classroom, message: string) => void;
}

/** The window to create a classroom (HU-73) or edit one (HU-90): its name,
 * its description and its avatar, which is the initials of the name on one
 * of five colors, or the teacher's own picture fitted to the square. */
export function ClassroomFormDialog({ classroom, onClose, onSaved }: ClassroomFormDialogProps) {
  const titleId = useId();
  const editing = classroom !== undefined;
  const [name, setName] = useState(classroom?.name ?? "");
  const [description, setDescription] = useState(classroom?.description ?? "");
  const [color, setColor] = useState<ClassroomColor>(classroom?.color ?? "blue");
  const [mode, setMode] = useState<AvatarMode>(classroom?.logo_file ? "image" : "initials");
  const [file, setFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<Blob | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const create = useCreateClassroom();
  const update = useUpdateClassroom();
  const upload = useUploadClassroomLogo();
  const removeLogo = useRemoveClassroomLogo();
  const saving = create.isPending || update.isPending || upload.isPending || removeLogo.isPending;

  // The name is the first thing to fill in.
  useEffect(() => {
    document.getElementById("clase-name")?.focus();
  }, []);

  // Escape closes it, unless it's in the middle of saving.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    if (!IMAGE_TYPES.includes(picked.type)) {
      setErrors((current) => ({ ...current, image: "Elige una imagen PNG, JPEG, WEBP o GIF." }));
      return;
    }
    if (picked.size > IMAGE_MAX_BYTES) {
      setErrors((current) => ({ ...current, image: "La imagen no puede pesar más de 5 MB." }));
      return;
    }
    setErrors((current) => ({ ...current, image: undefined }));
    setCrop(null);
    setFile(picked);
  }

  function check(): Errors {
    const found: Errors = {};
    if (!name.trim()) found.name = "Escribe el nombre de la clase.";
    else if (name.trim().length > NAME_MAX) found.name = `El nombre puede tener máximo ${NAME_MAX} caracteres.`;
    if (!description.trim()) found.description = "Escribe una descripción de la clase.";
    else if (description.trim().length > DESCRIPTION_MAX)
      found.description = `La descripción puede tener máximo ${DESCRIPTION_MAX} caracteres.`;
    if (mode === "image" && !crop && !classroom?.logo_file) found.image = "Elige la imagen de la clase.";
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const found = check();
    setErrors(found);
    const first = (["name", "description", "image"] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(`clase-${first}`)?.focus();
      return;
    }

    const body = { name: name.trim(), description: description.trim(), color };
    let saved: Classroom;
    try {
      saved = editing
        ? await update.mutateAsync({ classroomId: classroom.id, body })
        : await create.mutateAsync(body);
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
      onSaved(
        saved,
        `${editing ? "Los cambios se guardaron" : "La clase se creó"}, pero la imagen no: ${getAuthErrorMessage(error)}`,
      );
      return;
    }
    onSaved(saved, editing ? "Los cambios de la clase se guardaron." : "La clase se creó.");
  }

  const preview = { id: classroom?.id ?? "nueva", name: name || "Clase", color, logo_file: null };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <form className={styles.card} onSubmit={submit} noValidate>
        <h2 id={titleId} className={styles.title}>
          {editing ? "Editar clase" : "Nueva clase"}
        </h2>

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
        <TextField
          id="clase-description"
          label="Descripción"
          multiline
          rows={3}
          value={description}
          onChange={(value) => {
            setDescription(value);
            setErrors((current) => ({ ...current, description: undefined }));
          }}
          error={errors.description}
          required
          disabled={saving}
          placeholder="De qué trata la clase y para quién es."
        />

        <fieldset className={styles.avatarField} disabled={saving}>
          <legend className={styles.legend}>
            Avatar de la clase<span aria-hidden="true"> *</span>
          </legend>
          <div className={styles.modes} role="radiogroup" aria-label="Tipo de avatar">
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
            <div className={styles.initials}>
              <ClassroomAvatar classroom={preview} size={96} />
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
                  />
                ))}
              </div>
              <p className={styles.hint}>Las letras salen del nombre de la clase.</p>
            </div>
          ) : (
            <div className={styles.image}>
              {file ? (
                <ImageCropper file={file} onChange={setCrop} />
              ) : (
                classroom?.logo_file && (
                  <ClassroomAvatar classroom={{ ...classroom, name: name || classroom.name }} size={120} />
                )
              )}
              <label className={styles.pickButton}>
                {file || classroom?.logo_file ? "Elegir otra imagen" : "Elegir una imagen"}
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

        {submitError && (
          <p role="alert" className={styles.error}>
            {submitError}
          </p>
        )}

        <div className={styles.buttons}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className={styles.saveButton} disabled={saving}>
            {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear clase"}
          </button>
        </div>
      </form>
    </div>
  );
}
