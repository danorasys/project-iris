import type { ReactNode } from "react";
import type { Classroom } from "@iris/shared-types";
import { IconArchive, IconClassroom, IconPlus, IconSearch } from "@/shared/ui/icons";
import { ClassroomAvatar } from "./ClassroomAvatar";
import { ClassroomBanner } from "./ClassroomBanner";
import styles from "./ClassTiles.module.css";

// The classes as square tiles, the same in the teacher's "Mis clases" and
// in a kid's "Sus clases": a title with a search box, the grid with the
// "add" tile first, each class with its band and avatar, and the steps to
// follow while there are none.

// The line on top of a panel: its small gray title and, on the right, the
// search box or the filters.
export function TilesToolbar({ titleId, title, children }: { titleId: string; title: string; children?: ReactNode }) {
  return (
    <div className={styles.toolbar}>
      <h2 id={titleId} className={styles.panelTitle}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// A soft pill that turns blue while typing.
export function TileSearch({
  value,
  onChange,
  label,
  placeholder = "Buscar una clase",
}: {
  value: string;
  onChange: (value: string) => void;
  /** What a screen reader hears, the box only shows the placeholder. */
  label: string;
  placeholder?: string;
}) {
  return (
    <label className={styles.search}>
      <IconSearch width={18} height={18} aria-hidden="true" />
      <span className={styles.visuallyHidden}>{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </label>
  );
}

export function TileGrid({
  gridRef,
  children,
}: {
  gridRef: (grid: HTMLUListElement | null) => (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <ul ref={gridRef} className={styles.grid}>
      {children}
    </ul>
  );
}

// Adding is set apart: a dashed blue border and a round plus.
export function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.addTile} onClick={onClick}>
      <span className={styles.addIcon} aria-hidden="true">
        <IconPlus width={26} height={26} />
      </span>
      {label}
    </button>
  );
}

// One class: the band of its color with its avatar (or logo) hanging from
// it, its name and who it's for. An archived one fades and says so. Each
// portal adds its own line under it, if it needs one.
export function ClassTile({
  classroom,
  meta,
  archived,
  label,
  onOpen,
  children,
}: {
  classroom: Pick<Classroom, "id" | "name" | "color" | "logo_file">;
  /** Who it's for, like "Matemáticas · 2.°". */
  meta: string | null;
  archived: boolean;
  /** The whole tile in words, for screen readers. */
  label: string;
  onOpen: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className={styles.tile} onClick={onOpen} aria-label={label}>
      <ClassroomBanner color={classroom.color} height={60} className={archived ? styles.faded : undefined} />
      <span className={styles.tileAvatar}>
        <ClassroomAvatar classroom={classroom} size={60} />
      </span>
      <span className={styles.tileName}>{classroom.name}</span>
      {meta && <span className={styles.tileMeta}>{meta}</span>}
      {children}
      {archived && <ArchivedTag label="Archivada" />}
    </button>
  );
}

// A quiet gray tag, never alarming (HU-106).
export function ArchivedTag({ label }: { label: string }) {
  return (
    <span className={styles.archivedTag}>
      <IconArchive width={13} height={13} aria-hidden="true" />
      {label}
    </span>
  );
}

// While there are no classes: a pale box with what to do, step by step.
export function TileSteps({ titleId, title, steps }: { titleId: string; title: string; steps: string[] }) {
  return (
    <section className={styles.steps} aria-labelledby={titleId}>
      <span className={styles.stepsIcon} aria-hidden="true">
        <IconClassroom width={22} height={22} />
      </span>
      <div className={styles.stepsBody}>
        <h3 id={titleId} className={styles.stepsTitle}>
          {title}
        </h3>
        <ol className={styles.stepsList}>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
