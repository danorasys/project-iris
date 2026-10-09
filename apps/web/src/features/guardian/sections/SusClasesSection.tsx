import { useState } from "react";
import { Navigate } from "react-router-dom";
import type { FamilyClassroom } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { classroomAudience } from "@/features/teacher/classrooms/classroomDetails";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { ClassroomBanner } from "@/features/teacher/classrooms/ClassroomBanner";
import { formatArrival } from "@/features/utils/formatArrival";
import { useFamilyClassrooms, useLeaveClassroom } from "@/shared/api/hooks/useClassroomsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconCheck, IconClock, IconClose, IconPlus, IconSearch } from "@/shared/ui/icons";
import { TrayPager } from "@/shared/ui/portal/TrayPager";
import { Toast } from "@/shared/ui/Toast";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { AddClassDialog } from "../classes/AddClassDialog";
import { ClassSpace, type ClassOption } from "../classes/ClassSpace";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import styles from "./SusClasesSection.module.css";

// The "Agregar clase" tile counts as one of these, it always goes first.
const TILES_PER_PAGE = 8;

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

// Lowercase and without accents, so "matematicas" finds "Matemáticas".
function searchable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
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
  const totalPages = Math.max(1, Math.ceil(tiles.length / TILES_PER_PAGE));
  const current = Math.min(page, totalPages);
  const shown = tiles.slice((current - 1) * TILES_PER_PAGE, current * TILES_PER_PAGE);

  return (
    <>
      <section className={styles.panel} aria-labelledby="kid-classes-title">
        <div className={styles.toolbar}>
          <h2 id="kid-classes-title" className={styles.panelTitle}>
            {inside.length === 1 ? "1 clase" : `${inside.length} clases`}
          </h2>
          <label className={styles.search}>
            <IconSearch width={18} height={18} aria-hidden="true" />
            <span className={styles.visuallyHidden}>Buscar una clase por su nombre</span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar una clase"
              autoComplete="off"
            />
          </label>
        </div>

        <ul className={styles.grid}>
          {shown.map((tile) =>
            tile === "add" ? (
              <li key="add">
                <button type="button" className={styles.addTile} onClick={onAdd}>
                  <span className={styles.addIcon} aria-hidden="true">
                    <IconPlus width={26} height={26} />
                  </span>
                  Agregar clase
                </button>
              </li>
            ) : (
              <li key={tile.enrollment_id}>
                <ClassTile item={tile} onOpen={() => onOpen(tile.enrollment_id)} />
              </li>
            ),
          )}
        </ul>

        {inside.length === 0 && (
          <p className={styles.emptyText}>
            {firstName} aún no está en ninguna clase. Pídele al docente el código de ingreso y agrégala aquí.
          </p>
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

// One class as a tile: the band of its color with its avatar (or logo)
// hanging from it, its name and who it's for. Opens its space.
function ClassTile({ item, onOpen }: { item: FamilyClassroom; onOpen: () => void }) {
  const audience = classroomAudience(item.area, item.grade, item.area_other);
  return (
    <button
      type="button"
      className={styles.tile}
      onClick={onOpen}
      aria-label={`${item.name}${item.teacher_name ? `, con ${item.teacher_name}` : ""}. Ver la clase`}
    >
      <ClassroomBanner color={item.color} height={60} />
      <span className={styles.tileAvatar}>
        <ClassroomAvatar
          classroom={{ id: item.classroom_id, name: item.name, color: item.color, logo_file: item.logo_file }}
          size={60}
        />
      </span>
      <span className={styles.tileName}>{item.name}</span>
      {audience && <span className={styles.tileMeta}>{audience}</span>}
    </button>
  );
}

const STATUS_LABEL = {
  pendiente: "Esperando respuesta",
  aceptada: "Aceptada",
  rechazada: "No aceptada",
} as const;

// HU-41: every request sent for the kid, newest first, with how it went.
// One still waiting can be cancelled, a rejected one cleared off the list.
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
  const [cancelling, setCancelling] = useState<FamilyClassroom | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) return null;

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
      <h2 id="kid-requests-title" className={styles.panelTitle}>
        Solicitudes enviadas
      </h2>
      {error && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {error}
        </p>
      )}
      <ul className={styles.requests}>
        {requests.map((item) => (
          <li key={item.enrollment_id} className={styles.request}>
            <ClassroomAvatar
              classroom={{ id: item.classroom_id, name: item.name, color: item.color, logo_file: item.logo_file }}
              size={44}
            />
            <div className={styles.requestText}>
              <p className={styles.requestName}>{item.name}</p>
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
                <button type="button" className={styles.linkButton} onClick={() => setCancelling(item)}>
                  Cancelar
                </button>
              )}
              {item.status === "rechazada" && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => void remove(item)}
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

      {cancelling && (
        <ConfirmDialog
          title="Cancelar la solicitud"
          message={`¿Quieres cancelar la solicitud para que ${firstName} se una a "${cancelling.name}"? Le avisaremos al docente.`}
          acceptLabel="Cancelar solicitud"
          cancelLabel="Volver"
          danger
          onAccept={() => {
            const item = cancelling;
            setCancelling(null);
            void remove(item);
          }}
          onCancel={() => setCancelling(null)}
        />
      )}
    </section>
  );
}
