import { useNavigate } from "react-router-dom";
import { IconEye } from "@/shared/ui/icons";
import { MascotStepScreen } from "../components/MascotStepScreen";

/** `/kids/setup-conditions`, the first time on this device. Addressed to
 * the adult at the screen, not the kid, about what makes the gaze
 * calibration work well. Right before asking for the camera. */
export default function SetupConditionsPage() {
  const navigate = useNavigate();

  return (
    <MascotStepScreen
      message="Antes de calibrar, ayuda a tu hijo o hija a sentarse a la distancia de un brazo del computador, en un lugar con buena luz donde se le vea bien la cara, sin lentes de sol ni gorra, y sin nadie más dentro del encuadre de la cámara. La calibración toma un momento, ¡un poco de paciencia ayuda mucho!"
      eyebrow="Antes de empezar"
      eyebrowIcon={<IconEye aria-hidden="true" />}
      title="Preparemos el lugar"
      buttonLabel="Siguiente"
      onAdvance={() => navigate("/kids/camera-permission")}
    />
  );
}
