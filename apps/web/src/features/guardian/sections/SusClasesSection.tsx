import { useState } from "react";
import { Navigate } from "react-router-dom";
import type { FamilyClassroom } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { classroomAudience } from "@/features/teacher/classrooms/classroomDetails";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import {
  AddTile,
  ArchivedTag,
  ClassTile,
  TileGrid,
  TileSearch,
  TileSteps,
  TilesToolbar,
} from "@/features/teacher/classrooms/ClassTiles";
import { searchable, tilesPerPage, useGridColumns } from "@/features/teacher/classrooms/tilePages";
import { formatArrival } from "@/features/utils/formatArrival";
import { useFamilyClassrooms, useLeaveClassroom } from "@/shared/api/hooks/useClassroomsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconCheck, IconClock, IconClose } from "@/shared/ui/icons";
import { TrayPager } from "@/shared/ui/portal/TrayPager";
import { Toast } from "@/shared/ui/Toast";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { AddClassDialog } from "../classes/AddClassDialog";
import { ClassSpace, type ClassOption } from "../classes/ClassSpace";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import styles from "./SusClasesSection.module.css";

// Requests are rows, so fewer per page keeps the panel short.
const REQUESTS_PER_PAGE = 5;

interface SusClasesSectionProps {
  studentId: string;
  firstName: string;
  /** The enrollment of the class open (its space), null for the list. */
  openId: string | null;
  /** The option open inside that class. */
  option: ClassOption | null;
  onOpen: (enrollmentId: string | null) => void;
  onOption: (option: ClassOption | null) => void;
}

/** "Sus clases" in a kid's space (EP-07): the classes they're in as square
 * tiles with "Agregar clase" first (HU-39, HU-40), a search box and pages,
 * every request sent with how it went (HU-41), and the space of each class
 * (HU-42). Where it is lives in StudentSpace, so its back button walks out
 * one step at a time. */
export function SusClasesSection({ studentId, firstName, openId, option, onOpen, onOption }: SusClasesSectionProps) {
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      {/* The list, a class and its options are levels 0, 1 and 2. */}
      <ViewEnter
        view={option ? `${openId}:${option}` : (openId ?? "list")}
        level={option ? 2 : openId ? 1 : 0}
        className={styles.section}
      >
        {openId ? (
          <ClassSpace
            enrollmentId={openId}
            firstName={firstName}
            option={option}
            onOption={onOption}
            onLeft={(name) => {
              onOpen(null);
              setToast(`${firstName} ya no está en "${name}". Le avisamos al docente.`);
            }}
            onToast={setToast}
          />
        ) : (
          <ClassesHome studentId={studentId} firstName={firstName} onOpen={onOpen} onAdd={() => setAdding(true)} />
        )}
      </ViewEnter>

      {adding && (
        <AddClassDialog
          studentId={studentId}
          firstName={firstName}
          onClose={() => setAdding(false)}
          onSent={(name) => {
            setAdding(false);
            setToast(`Solicitud enviada a "${name}". Te avisaremos cuando el docente responda.`);
          }}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}

interface ClassesHomeProps {
  studentId: string;
  firstName: string;
  onOpen: (enrollmentId: string) => void;
  onAdd: () => void;
}

function ClassesHome({ studentId, firstName, onOpen, onAdd }: ClassesHomeProps) {
  const family = useFamilyClassrooms();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [gridRef, columns] = useGridColumns();

  // Nothing typed to keep here, a closed portal just goes to the code screen.
  if (isPortalAccessRequired(family.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (family.isLoading) return <p className={styles.status}>Cargando sus clases…</p>;
  if (family.isError) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar sus clases. Intenta recargar la página.
      </p>
    );
  }

  const own = (family.data ?? []).filter((c) => c.student_id === studentId);
  const inside = own.filter((c) => c.status === "aceptada");
  const found = query.trim() ? inside.filter((c) => searchable(c.name).includes(searchable(query.trim()))) : inside;

  // "Agregar clase" goes first on the first page, then the classes.
  const tiles: (FamilyClassroom | "add")[] = ["add", ...found];
  const perPage = tilesPerPage(columns);
  const totalPages = Math.max(1, Math.ceil(tiles.length / perPage));
  const current = Math.min(page, totalPages);
  const shown = tiles.slice((current - 1) * perPage, current * perPage);

  return (
    <>
      <section className={styles.panel} aria-labelledby="kid-classes-title">
        <TilesToolbar titleId="kid-classes-title" title={classesTitle(inside)}>
          <TileSearch
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            label="Buscar una clase por su nombre"
          />
        </TilesToolbar>

        <TileGrid gridRef={gridRef}>
          {shown.map((tile) =>
            tile === "add" ? (
              <li key="add">
                <AddTile label="Agregar clase" onClick={onAdd} />
              </li>
            ) : (
              <li key={tile.enrollment_id}>
                <KidClassTile item={tile} onOpen={() => onOpen(tile.enrollment_id)} />
              </li>
            ),
          )}
        </TileGrid>

        {/* While the kid has no class: how to join the first one, in the
            same order the family does it. */}
        {inside.length === 0 && (
          <TileSteps
            titleId="no-classes-title"
            title={`${firstName} aún no está en ninguna clase`}
            steps={[
              "Pídele al docente el código de ingreso de su clase.",
              'Toca "Agregar clase" y escribe el código.',
              "Cuando el docente acepte la solicitud, la clase aparecerá aquí.",
            ]}
          />
        )}
        {inside.length > 0 && found.length === 0 && (
          <p className={styles.emptyText} role="status">
            Ninguna clase de {firstName} se llama así.
          </p>
        )}

        <TrayPager page={current} totalPages={totalPages} onChange={setPage} label="Páginas de clases" />
      </section>

      <SentRequests requests={own} firstName={firstName} onOpen={onOpen} />
    </>
  );
}

// One of the kid's classes, with its teacher in the words read aloud.
function KidClassTile({ item, onOpen }: { item: FamilyClassroom; onOpen: () => void }) {
  return (
    <ClassTile
      classroom={{ id: item.classroom_id, name: item.name, color: item.color, logo_file: item.logo_file }}
      meta={classroomAudience(item.area, item.grade, item.area_other)}
      archived={Boolean(item.archived_at)}
      label={`${item.name}${item.teacher_name ? `, con ${item.teacher_name}` : ""}${item.archived_at ? ", archivada" : ""}. Ver la clase`}
      onOpen={onOpen}
    />
  );
}

const STATUS_LABEL = {
  pendiente: "Esperando respuesta",
  aceptada: "Aceptada",
  rechazada: "No aceptada",
} as const;

type RequestFilter = "todas" | FamilyClassroom["status"];

// The buttons above the list, in this order.
const FILTERS: { value: RequestFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "pendiente", label: "Esperando respuesta" },
  { value: "aceptada", label: "Aceptadas" },
  { value: "rechazada", label: "No aceptadas" },
];

// HU-41: every request sent for the kid, newest first, with how it went.
// One still waiting can be cancelled, a rejected one cleared off the list,
// both only after confirming.
// With many of them, the filters by state and the pages keep it short.
function SentRequests({
  requests,
  firstName,
  onOpen,
}: {
  requests: FamilyClassroom[];
  firstName: string;
  onOpen: (enrollmentId: string) => void;
}) {
  const withPortalAccess = useWithPortalAccess();
  const leave = useLeaveClassroom();
  const [confirming, setConfirming] = useState<FamilyClassroom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestFilter>("todas");
  const [page, setPage] = useState(1);

  if (requests.length === 0) return null;

  const counts = {
    todas: requests.length,
    pendiente: requests.filter((r) => r.status === "pendiente").length,
    aceptada: requests.filter((r) => r.status === "aceptada").length,
    rechazada: requests.filter((r) => r.status === "rechazada").length,
  };
  const filtered = filter === "todas" ? requests : requests.filter((r) => r.status === filter);
  // Cancelling the last one of a page leaves the page empty, so it steps back.
  const totalPages = Math.max(1, Math.ceil(filtered.length / REQUESTS_PER_PAGE));
  const current = Math.min(page, totalPages);
  const shown = filtered.slice((current - 1) * REQUESTS_PER_PAGE, current * REQUESTS_PER_PAGE);

  function choose(value: RequestFilter) {
    setFilter(value);
    setPage(1);
  }

  async function remove(item: FamilyClassroom) {
    setError(null);
    try {
      await withPortalAccess(() => leave.mutateAsync(item.enrollment_id));
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="kid-requests-title">
      <TilesToolbar titleId="kid-requests-title" title="Solicitudes enviadas">
        <div className={styles.filters} role="group" aria-label="Ver las solicitudes por estado">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={styles.filter}
              onClick={() => choose(value)}
              aria-pressed={filter === value}
              disabled={counts[value] === 0 && filter !== value}
            >
              {label} <span className={styles.filterCount}>{counts[value]}</span>
            </button>
          ))}
        </div>
      </TilesToolbar>
      {error && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {error}
        </p>
      )}
      {shown.length === 0 && (
        <p className={styles.emptyText} role="status">
          No quedan solicitudes en este estado.
        </p>
      )}
      <ul className={styles.requests}>
        {shown.map((item) => (
          <li key={item.enrollment_id} className={styles.request}>
            <ClassroomAvatar
              classroom={{ id: item.classroom_id, name: item.name, color: item.color, logo_file: item.logo_file }}
              size={44}
            />
            <div className={styles.requestText}>
              <p className={styles.requestName}>
                {item.name}
                {item.archived_at && item.status === "aceptada" && <ArchivedTag label="Clase archivada" />}
              </p>
              <p className={styles.requestMeta}>
                {item.teacher_name ? `Con ${item.teacher_name} · ` : ""}
                Enviada el {formatArrival(item.requested_at)}
              </p>
            </div>
            <span className={`${styles.statusPill} ${styles[item.status]}`}>
              {item.status === "pendiente" && <IconClock width={14} height={14} aria-hidden="true" />}
              {item.status === "aceptada" && <IconCheck width={14} height={14} aria-hidden="true" />}
              {item.status === "rechazada" && <IconClose width={14} height={14} aria-hidden="true" />}
              {STATUS_LABEL[item.status]}
            </span>
            <div className={styles.requestAction}>
              {item.status === "aceptada" && (
                <button type="button" className={styles.linkButton} onClick={() => onOpen(item.enrollment_id)}>
                  Ver clase
                </button>
              )}
              {item.status === "pendiente" && (
                <button type="button" className={styles.linkButton} onClick={() => setConfirming(item)}>
                  Cancelar
                </button>
              )}
              {item.status === "rechazada" && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setConfirming(item)}
                  disabled={leave.isPending}
                  aria-label={`Quitar "${item.name}" de la lista`}
                >
                  Quitar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <TrayPager page={current} totalPages={totalPages} onChange={setPage} label="Páginas de solicitudes" />

      {confirming && (
        <ConfirmDialog
          {...(confirming.status === "rechazada"
            ? {
                title: "Quitar la solicitud",
                message: `¿Quieres quitar la solicitud no aceptada de "${confirming.name}" de la lista de ${firstName}? El docente no recibirá ningún aviso.`,
                acceptLabel: "Quitar solicitud",
              }
            : {
                title: "Cancelar la solicitud",
                message: `¿Quieres cancelar la solicitud para que ${firstName} se una a "${confirming.name}"? Le avisaremos al docente.`,
                acceptLabel: "Cancelar solicitud",
              })}
          cancelLabel="Volver"
          danger
          onAccept={() => {
            const item = confirming;
            setConfirming(null);
            void remove(item);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  );
}

// "11 clases · 1 archivada": the same count as the kid's header, which leaves
// the archived ones out (HU-106), and those apart, since they're still here.
function classesTitle(inside: FamilyClassroom[]): string {
  const archived = inside.filter((c) => c.archived_at).length;
  const active = inside.length - archived;
  const count = active === 1 ? "1 clase" : `${active} clases`;
  if (archived === 0) return count;
  return `${count} · ${archived === 1 ? "1 archivada" : `${archived} archivadas`}`;
}
