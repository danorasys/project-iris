import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useClassroomDetail,
  useResolveRequest,
  useClassroomRequests,
  useUpdateClassroom,
  useUploadClassroomLogo,
} from "@/shared/api/hooks/useClassroomsApi";
import { useClassroomLessons } from "@/shared/api/hooks/useLessonsApi";
import { ApiError } from "@/shared/api/httpClient";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { IconSchool, IconUndo } from "@/shared/ui/icons";
import styles from "./ClassroomDetailPage.module.css";

/** `/teacher/classrooms/:classroomId`, the classroom's detail page. Entry
 * code, pending requests (accept/reject), enrolled students, and lessons.
 * `useClassroomRequests`'s polling is separate from the dashboard's, here
 * we need the full list of requests, not just the pending count. */
export default function ClassroomDetailPage() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();

  const classroomQuery = useClassroomDetail(classroomId);
  const requestsQuery = useClassroomRequests(classroomId, { refetchInterval: 30_000 });
  const lessonsQuery = useClassroomLessons(classroomId);
  const resolveRequest = useResolveRequest();
  const updateClassroom = useUpdateClassroom();
  const uploadLogo = useUploadClassroomLogo();

  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [infoError, setInfoError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const resolve = (enrollmentId: string, decision: "aceptar" | "rechazar") => {
    if (!classroomId) return;
    setProcessingRequestId(enrollmentId);
    resolveRequest.mutate(
      { classroomId, enrollmentId, decision },
      { onSettled: () => setProcessingRequestId(null) }
    );
  };

  const handleSaveInfo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!classroomId) return;
    setInfoError(null);
    updateClassroom.mutate(
      { classroomId, body: { name: editName.trim(), description: editDescription.trim() } },
      {
        onSuccess: () => setEditingInfo(false),
        onError: (err) => {
          setInfoError(err instanceof ApiError ? err.message : "No se pudo guardar. Intenta de nuevo.");
        },
      }
    );
  };

  const selectLogo = () => logoInputRef.current?.click();

  const handleLogoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !classroomId) return;
    setLogoError(null);
    uploadLogo.mutate(
      { classroomId, file },
      {
        onError: (err) => {
          setLogoError(err instanceof ApiError ? err.message : "No se pudo actualizar el logo. Intenta de nuevo.");
        },
      }
    );
  };

  if (classroomQuery.isLoading) {
    return (
      <main className={styles.page}>
        <p>Cargando aula…</p>
      </main>
    );
  }

  if (classroomQuery.isError || !classroomQuery.data) {
    return (
      <main className={styles.page}>
        <button type="button" className={styles.back} onClick={() => navigate("/teacher/home")}>
          <IconUndo width={18} height={18} />
          Volver al panel
        </button>
        <p className={styles.error} role="alert">
          No se pudo cargar esta aula. Puede que ya no exista o que no tengas acceso.
        </p>
      </main>
    );
  }

  const classroom = classroomQuery.data;
  const acceptedStudents = classroom.students.filter((student) => student.status === "aceptada");

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={() => navigate("/teacher/home")}>
        <IconUndo width={18} height={18} />
        Volver al panel
      </button>

      <div className={styles.classroomHeader}>
        <div className={styles.logoColumn}>
          {classroom.logo_url ? (
            <img src={classroom.logo_url} alt="" className={styles.logo} />
          ) : (
            <div className={styles.logoPlaceholder} aria-hidden="true">
              <IconSchool width={32} height={32} />
            </div>
          )}
          <button type="button" className={styles.textLink} onClick={selectLogo} disabled={uploadLogo.isPending}>
            {uploadLogo.isPending ? "Subiendo…" : "Cambiar logo"}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className={styles.fileInput}
            onChange={handleLogoSelected}
          />
          {logoError && (
            <p className={styles.error} role="alert">
              {logoError}
            </p>
          )}
        </div>

        {editingInfo ? (
          <form className={styles.editInfoForm} onSubmit={handleSaveInfo}>
            <div className={styles.field}>
              <label htmlFor="nombre-aula-editable">Nombre del aula</label>
              <input
                id="nombre-aula-editable"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                maxLength={80}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="descripcion-aula-editable">Descripción</label>
              <textarea
                id="descripcion-aula-editable"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                required
                maxLength={500}
                rows={3}
              />
            </div>
            {infoError && (
              <p className={styles.error} role="alert">
                {infoError}
              </p>
            )}
            <div className={styles.editInfoActions}>
              <button
                type="button"
                className={styles.textLink}
                onClick={() => setEditingInfo(false)}
                disabled={updateClassroom.isPending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={updateClassroom.isPending || !editName.trim() || !editDescription.trim()}
              >
                {updateClassroom.isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.classroomInfo}>
            <h1>{classroom.name}</h1>
            <p>{classroom.description}</p>
            <p className={styles.entryCode}>
              Código de ingreso: <strong>{classroom.enrollment_code}</strong>
            </p>
            <button
              type="button"
              className={styles.textLink}
              onClick={() => {
                setEditName(classroom.name);
                setEditDescription(classroom.description);
                setInfoError(null);
                setEditingInfo(true);
              }}
            >
              Editar nombre y descripción
            </button>
          </div>
        )}
      </div>

      <section className={styles.section} aria-labelledby="titulo-solicitudes">
        <div className={styles.sectionHeader}>
          <h2 id="titulo-solicitudes">Solicitudes pendientes</h2>
        </div>

        {requestsQuery.isLoading && <p>Cargando solicitudes…</p>}
        {requestsQuery.isError && (
          <p className={styles.error} role="alert">
            No se pudieron cargar las solicitudes.
          </p>
        )}
        {requestsQuery.data && requestsQuery.data.length === 0 && (
          <p className={styles.empty}>No hay solicitudes pendientes por ahora.</p>
        )}
        {requestsQuery.data && requestsQuery.data.length > 0 && (
          <ul className={styles.requestList}>
            {requestsQuery.data.map((request) => (
              <li key={request.enrollment_id} className={styles.request}>
                <div className={styles.requestInfo}>
                  <StudentAvatarImage avatarId={request.student_avatar_id} size="small" />
                  <div>
                    <p className={styles.studentName}>{request.student_first_name}</p>
                    <p className={styles.guardianDetail}>
                      Tutor: {request.guardian_name} · {request.guardian_contact}
                    </p>
                  </div>
                </div>
                <div className={styles.requestActions}>
                  <button
                    type="button"
                    className={styles.accept}
                    disabled={processingRequestId === request.enrollment_id}
                    onClick={() => resolve(request.enrollment_id, "aceptar")}
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    className={styles.reject}
                    disabled={processingRequestId === request.enrollment_id}
                    onClick={() => resolve(request.enrollment_id, "rechazar")}
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="titulo-estudiantes">
        <div className={styles.sectionHeader}>
          <h2 id="titulo-estudiantes">Estudiantes inscritos ({acceptedStudents.length})</h2>
        </div>
        {acceptedStudents.length === 0 ? (
          <p className={styles.empty}>Todavía no hay estudiantes aceptados en esta aula.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Estudiante</th>
              </tr>
            </thead>
            <tbody>
              {acceptedStudents.map((student) => (
                <tr key={student.enrollment_id}>
                  <td className={styles.studentRow}>
                    <StudentAvatarImage avatarId={student.avatar_id} size="small" />
                    {student.first_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section} aria-labelledby="titulo-lecciones">
        <div className={styles.sectionHeader}>
          <h2 id="titulo-lecciones">Lecciones</h2>
          {classroomId && (
            <Link to={`/teacher/classrooms/${classroomId}/lessons/create`} className={styles.primaryButton}>
              + Crear lección
            </Link>
          )}
        </div>

        {lessonsQuery.isLoading && <p>Cargando lecciones…</p>}
        {lessonsQuery.isError && (
          <p className={styles.error} role="alert">
            No se pudieron cargar las lecciones.
          </p>
        )}
        {lessonsQuery.data && lessonsQuery.data.length === 0 && (
          <p className={styles.empty}>Esta aula todavía no tiene lecciones.</p>
        )}
        {lessonsQuery.data && lessonsQuery.data.length > 0 && (
          <ul className={styles.lessonList}>
            {lessonsQuery.data.map((lesson) => (
              <li key={lesson.id} className={styles.lesson}>
                <Link to={`/teacher/classrooms/${classroomId}/lessons/${lesson.id}/edit`} className={styles.lessonLink}>
                  {lesson.title}
                </Link>
                <span
                  className={`${styles.lessonStatus} ${
                    lesson.status === "publicada" ? styles.statusPublished : styles.statusDraft
                  }`}
                >
                  {lesson.status === "publicada" ? "Publicada" : "Borrador"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
