import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { IconEye, IconSliders, IconSparkle } from "@/shared/ui/icons";
import { KidCard, KidCards, KidHeader, KidPage } from "@/shared/ui/kid/KidKit";
import { getDwellDurationMs } from "../lib/dwellPreferences";

/** `/student/settings`, the kid's Ajustes: see the tour again (HU-89) and
 * calibrate the eyes again, when the circle isn't following them well. The
 * kid always moves with the eyes, so there's nothing to choose about it. */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;

  return (
    <KidPage back={{ label: "Volver al inicio", onSelect: () => navigate("/student/home") }} dwellDurationMs={dwellDurationMs}>
      <KidHeader
        eyebrow="Ajustes"
        icon={<IconSliders aria-hidden="true" />}
        title="Tus ajustes"
        subtitle="¿Qué quieres hacer?"
      />
      <KidCards>
        <KidCard
          title="Ver el recorrido otra vez"
          icon={<IconSparkle />}
          tone="orange"
          onSelect={() => navigate("/student/tour", { state: { from: "settings" } })}
          dwellDurationMs={dwellDurationMs}
        />
        <KidCard
          title="Calibrar mis ojos otra vez"
          subtitle="Si el círculo azul no sigue bien tu mirada"
          icon={<IconEye />}
          tone="blue"
          order={1}
          onSelect={() => navigate("/student/calibration")}
          dwellDurationMs={dwellDurationMs}
        />
      </KidCards>
    </KidPage>
  );
}
