import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateClassroom } from "@/shared/api/hooks/useClassroomsApi";
import { ApiError } from "@/shared/api/httpClient";
import { IconUndo } from "@/shared/ui/icons";
import styles from "./CreateClassroomPage.module.css";

/** `/teacher/classrooms/create`, a conventional mouse/keyboard form for creating
 * a new classroom. Once created, the backend generates the 7-digit entry
 * code, we navigate straight to the detail page so the teacher can see it
 * and share it. */
export default function CreateClassroomPage() {
  const navigate = useNavigate();
  const createClassroom = useCreateClassroom();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    createClassroom.mutate(
      { name: name.trim(), description: description.trim() },
      {
        onSuccess: (classroom) => navigate(`/teacher/classrooms/${classroom.id}`),
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : "No se pudo crear el aula. Intenta de nuevo.");
        },
      }
    );
  };

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={() => navigate("/teacher/home")}>
        <IconUndo width={18} height={18} />
        Volver al panel
      </button>

      <div className={styles.header}>
        <h1>Crear aula</h1>
        <p>Dale un nombre y una breve descripción — luego podrás compartir el código de ingreso con tus estudiantes.</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="nombre-aula">Nombre del aula</label>
          <input
            id="nombre-aula"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Ej. 3ro A"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="descripcion-aula">Descripción</label>
          <textarea
            id="descripcion-aula"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={500}
            rows={4}
            placeholder="¿De qué trata esta aula?"
          />
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className={styles.submit}
          disabled={createClassroom.isPending || !name.trim() || !description.trim()}
        >
          {createClassroom.isPending ? "Creando…" : "Crear aula"}
        </button>
      </form>
    </main>
  );
}
