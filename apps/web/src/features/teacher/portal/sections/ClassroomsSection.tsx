import { useState } from "react";
import type { Classroom, TeacherClassroom } from "@iris/shared-types";
import { useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { IconClassroom, IconClock } from "@/shared/ui/icons";
import { Highlight, PortalBanner } from "@/shared/ui/portal/PortalBanner";
import { TrayPager } from "@/shared/ui/portal/TrayPager";
import { Toast } from "@/shared/ui/Toast";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { classroomAudience } from "../../classrooms/classroomDetails";
import { ClassroomFormDialog } from "../../classrooms/ClassroomFormDialog";
import { AddTile, ClassTile, TileGrid, TileSearch, TileSteps, TilesToolbar } from "../../classrooms/ClassTiles";
import { searchable, tilesPerPage, useGridColumns } from "../../classrooms/tilePages";
import { ClassroomSpace, type ClassroomView } from "./ClassroomSpace";
import styles from "../portalSection.module.css";

interface ClassroomsSectionProps {
  /** Opens this classroom right away, like when coming back from a lesson. */
  initialClassroomId?: string;
  initialView?: ClassroomView;
  /** Opens the dialog of a new classroom, like from "Nueva clase" in Inicio. */
  startCreating?: boolean;
}

/** "Mis clases" (HU-73), laid out like a kid's "Sus clases" in the Portal
 * de Padres: the banner of Inicio with how many classes and requests there are,
 * and a white panel with the classes as square tiles, "Nueva clase" first,
 * a search box and pages. Each tile shows who the class is for and its
 * students. Picking one opens that classroom (HU-74). The archived ones
 * (HU-105) go after the active ones, faded. */
export function ClassroomsSection({ initialClassroomId, initialView, startCreating = false }: ClassroomsSectionProps) {
  const classrooms = useTeacherClassrooms();
  const [openId, setOpenId] = useState<string | null>(initialClassroomId ?? null);
  const [creating, setCreating] = useState(startCreating);
  // Here and not in the classroom's space, so it stays when going back.
  const [toast, setToast] = useState<string | null>(null);

  function created(classroom: Classroom, message: string) {
    setCreating(false);
    setToast(message);
    setOpenId(classroom.id);
  }

  // The list and a classroom's space are in the same ViewEnter, so going
  // from one to the other plays the entrance. The toast stays out of it.
  if (openId) {
    return (
      <>
        <ViewEnter view={openId} level={1}>
          <ClassroomSpace
            classroomId={openId}
            initialView={openId === initialClassroomId ? initialView : undefined}
            onBack={() => setOpenId(null)}
            onToast={setToast}
          />
        </ViewEnter>
        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      </>
    );
  }

  if (classrooms.isLoading) return <p className={styles.status}>Cargando tus clases…</p>;
  if (classrooms.isError) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar tus clases. Intenta recargar la página.
      </p>
    );
  }

  const all = classrooms.data ?? [];
  const active = all.filter((classroom) => !classroom.archived_at);
  const archived = all.filter((classroom) => classroom.archived_at);
  const pending = active.reduce((total, classroom) => total + classroom.pending_requests, 0);

  return (
    <>
      <ViewEnter view="list">
        <div className={styles.section}>
          {/* The banner of Inicio and Notificaciones: light sky with the rings
              of the iris, "clases" underlined by hand and the counts in
              white pills. */}
          <PortalBanner
            label="Mis clases"
            eyebrow="Mis clases"
            title={
              <>
                Tus <Highlight>clases</Highlight>
              </>
            }
            chips={bannerChips(active.length, archived.length, pending)}
            icon={<IconClassroom width={40} height={40} />}
          />

          {/* The active ones first and the archived after them, faded. */}
          <ClassesPanel classrooms={[...active, ...archived]} onOpen={setOpenId} onCreate={() => setCreating(true)} />

          {creating && <ClassroomFormDialog onClose={() => setCreating(false)} onSaved={created} />}
        </div>
      </ViewEnter>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}

// The classes as square tiles, like a kid's "Sus clases": the count and a
// search box on top, "Nueva clase" first, pages when they don't fit, and
// the steps to start while there are none.
function ClassesPanel({
  classrooms,
  onOpen,
  onCreate,
}: {
  classrooms: TeacherClassroom[];
  onOpen: (classroomId: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [gridRef, columns] = useGridColumns();

  const found = query.trim()
    ? classrooms.filter((c) => searchable(c.name).includes(searchable(query.trim())))
    : classrooms;
  const tiles: (TeacherClassroom | "add")[] = ["add", ...found];
  const perPage = tilesPerPage(columns);
  const totalPages = Math.max(1, Math.ceil(tiles.length / perPage));
  const current = Math.min(page, totalPages);
  const shown = tiles.slice((current - 1) * perPage, current * perPage);

  return (
    <section className={styles.panel} aria-labelledby="teacher-classes-title">
      <TilesToolbar titleId="teacher-classes-title" title={classesTitle(classrooms)}>
        <TileSearch
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          label="Buscar una de tus clases por su nombre"
        />
      </TilesToolbar>

      <TileGrid gridRef={gridRef}>
        {shown.map((tile) =>
          tile === "add" ? (
            <li key="add">
              <AddTile label="Nueva clase" onClick={onCreate} />
            </li>
          ) : (
            <li key={tile.id}>
              <TeacherClassTile classroom={tile} onOpen={() => onOpen(tile.id)} />
            </li>
          ),
        )}
      </TileGrid>

      {classrooms.length === 0 && (
        <TileSteps
          titleId="no-classes-title"
          title="Todavía no tienes clases"
          steps={[
            'Toca "Nueva clase" y escribe su nombre, área y grado.',
            "Comparte su código de ingreso con las familias de tus estudiantes.",
            "Acepta las solicitudes que te lleguen en Miembros y tu clase empezará a llenarse.",
          ]}
        />
      )}
      {classrooms.length > 0 && found.length === 0 && (
        <p className={styles.emptyText} role="status">
          Ninguna de tus clases se llama así.
        </p>
      )}

      <TrayPager page={current} totalPages={totalPages} onChange={setPage} label="Páginas de clases" />
    </section>
  );
}

// One class with its students under it and, in blue, the requests waiting.
function TeacherClassTile({ classroom, onOpen }: { classroom: TeacherClassroom; onOpen: () => void }) {
  const archived = Boolean(classroom.archived_at);
  const students = studentsLabel(classroom.student_count);
  const waiting = classroom.pending_requests;
  return (
    <ClassTile
      classroom={classroom}
      meta={classroomAudience(classroom.area, classroom.grade, classroom.area_other)}
      archived={archived}
      label={`${classroom.name}${archived ? ", archivada" : ""}: ${students}${
        waiting > 0 ? `, ${waiting} en espera` : ""
      }. Ver la clase`}
      onOpen={onOpen}
    >
      <span className={styles.tileCount}>
        {students}
        {waiting > 0 && (
          <span className={styles.tileWaiting}>
            <IconClock width={13} height={13} aria-hidden="true" />
            {waiting} en espera
          </span>
        )}
      </span>
    </ClassTile>
  );
}

// "4 clases", and the archived ones and the requests waiting when there are.
function bannerChips(active: number, archived: number, pending: number): string[] {
  const chips = [active === 1 ? "1 clase" : `${active} clases`];
  if (archived > 0) chips.push(archived === 1 ? "1 archivada" : `${archived} archivadas`);
  if (pending > 0) chips.push(pending === 1 ? "1 solicitud pendiente" : `${pending} solicitudes pendientes`);
  return chips;
}

function studentsLabel(count: number): string {
  if (count === 0) return "Sin estudiantes";
  return count === 1 ? "1 estudiante" : `${count} estudiantes`;
}

// "4 clases · 1 archivada", like the title of a kid's classes.
function classesTitle(classrooms: TeacherClassroom[]): string {
  const archived = classrooms.filter((c) => c.archived_at).length;
  const active = classrooms.length - archived;
  const count = active === 1 ? "1 clase" : `${active} clases`;
  if (archived === 0) return count;
  return `${count} · ${archived === 1 ? "1 archivada" : `${archived} archivadas`}`;
}
