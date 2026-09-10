import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MascotStepScreen } from "../components/MascotStepScreen";

const STEPS = [
  "¡Hola! Te voy a acompañar por IRIS. Aquí todo se maneja con la mirada, sin necesitar el mouse.",
  "Cuando quieras elegir algo, solo mira fijo el botón grande unos segundos y se irá llenando de color. Cuando se llena por completo, ¡listo, ya lo elegiste!",
];

/** Tour guided by IRIS, 2 steps, always the same interaction pattern as
 * the rest of the app, a single "Siguiente" BigChoiceButton. It only
 * covers the dwell-selection mechanic, from here the flow moves into the
 * setup conditions and camera permission screens before the real
 * calibration. */
export default function TourPage() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const isLastStep = step === STEPS.length - 1;

  const advance = () => {
    if (isLastStep) {
      navigate("/student/setup-conditions");
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <MascotStepScreen
      progress={`Paso ${step + 1} de ${STEPS.length}`}
      message={STEPS[step]}
      buttonLabel="Siguiente"
      onAdvance={advance}
    />
  );
}
