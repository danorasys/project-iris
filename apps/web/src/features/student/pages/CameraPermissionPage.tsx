import { useNavigate } from "react-router-dom";
import { MascotStepScreen } from "../components/MascotStepScreen";

/** This is `/student/camera-permission`. Also addressed to the adult, it
 * sets the expectation that the browser will ask for camera access next,
 * that it must always be allowed, and that the adult should step out of
 * frame once granted. The real permission prompt happens on the next
 * screen (CalibrationPage) when it turns on the gaze engine, this page
 * only prepares the adult for it, it doesn't ask for the camera itself. */
export default function CameraPermissionPage() {
  const navigate = useNavigate();

  return (
    <MascotStepScreen
      message="En un momento el navegador va a pedir acceso a la cámara. Es muy importante otorgarlo siempre, IRIS solo la usa para seguir la mirada, nunca guarda ni comparte video. Cuando lo autorices, aléjate un poco de la pantalla para que tu hijo o hija quede solo o sola frente a la cámara."
      buttonLabel="Siguiente"
      onAdvance={() => navigate("/student/calibration")}
    />
  );
}
