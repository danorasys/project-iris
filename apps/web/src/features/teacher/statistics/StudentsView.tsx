import { useState } from "react";
import { TileSearch } from "@/features/teacher/classrooms/ClassTiles";
import { IconArrowLeft } from "@/shared/ui/icons";
import { KidProgressList, type KidProgress } from "./StatisticsParts";
import { findKids } from "./statisticsView";
import portal from "../portal/portalSection.module.css";
import styles from "./StatisticsPanel.module.css";

/** Every kid with how far they got, best first, and a box to find one by
 * name. Each one opens their own results. The same list for the whole
 * class and for one lesson; each kid keeps their place while searching. */
export function StudentsView({
  title,
  items,
  backLabel,
  onBack,
  onOpen,
}: {
  title: string;
  /** Already in order, best first. */
  items: KidProgress[];
  backLabel: string;
  onBack: () => void;
  onOpen: (studentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const ranked = items.map((item, index) => ({ ...item, rank: index + 1 }));
  const found = findKids(
    ranked.map((item) => ({ ...item.kid, item })),
    query,
  ).map(({ item }) => item);

  return (
    <>
      <button type="button" className={portal.backButton} onClick={onBack}>
        <IconArrowLeft width={18} height={18} />
        {backLabel}
      </button>

      <section aria-labelledby="stats-students-title" className={`${portal.panel} ${styles.card} ${styles.rise}`}>
        <div className={styles.studentsHead}>
          <div>
            <h2 id="stats-students-title" className={styles.studentsTitle}>
              {title}
            </h2>
            <p className={portal.rowMeta}>
              {items.length === 1 ? "1 estudiante" : `${items.length} estudiantes`}, del más avanzado al que menos.
              Abre uno para ver sus resultados.
            </p>
          </div>
          <TileSearch
            value={query}
            onChange={setQuery}
            label="Buscar un estudiante por su nombre"
            placeholder="Buscar un estudiante"
          />
        </div>

        {found.length === 0 ? (
          <p className={portal.rowMeta}>Ningún estudiante se llama así.</p>
        ) : (
          <KidProgressList onSelect={onOpen} items={found} />
        )}
      </section>
    </>
  );
}
