import { useNavigate } from "react-router-dom";
import { MascotStepScreen } from "../components/MascotStepScreen";

/** This is `/student/setup-conditions`. Purely informational, addressed
 * to the adult present at the screen, not the student, about the physical
 * conditions that make gaze calibration work well. Comes right after the
 * tour and right before asking for camera permission. */
export default function SetupConditionsPage() {
  const navigate = useNavigate();

  return (
    <MascotStepScreen
      message="Antes de calibrar, ayuda a tu hijo o hija a sentarse a la distancia de un brazo del computador, en un lugar con buena luz donde se le vea bien la cara, sin lentes de sol ni gorra, y sin nadie más dentro del encuadre de la cámara. La calibración toma un momento, ¡un poco de paciencia ayuda mucho!"
      buttonLabel="Siguiente"
      onAdvance={() => navigate("/student/camera-permission")}
    />
  );
}
