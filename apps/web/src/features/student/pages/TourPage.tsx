import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { MascotStepScreen } from "../components/MascotStepScreen";
import { markTourDone } from "../lib/studentJourney";

// What IRIS tells the kid the first time.
const LINES = [
  "¡Hola! Soy IRIS y te voy a acompañar mientras aprendes.",
  "Para elegir algo, mira fijo un botón grande. El círculo azul se va llenando y cuando se llena por completo, ¡listo, ya lo elegiste!",
  "En tu inicio están tus clases. Tu familia te inscribe en ellas y tu profe prepara las lecciones.",
  "Si algún día quieres ver este recorrido otra vez, entra a Ajustes desde tu inicio.",
];

/** HU-89: the tour by IRIS, the first time the kid enters (right after the
 * PIN; the calibration was before picking the profile). It explains how to
 * choose with the eyes. It can be seen again from Ajustes, and then goes
 * back there. */
export default function TourPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { session } = useAuth();
  const [step, setStep] = useState(0);
  const lines = LINES;
  const fromSettings = (state as { from?: string } | null)?.from === "settings";
  const isLastStep = step === lines.length - 1;

  const advance = () => {
    if (!isLastStep) {
      setStep((s) => s + 1);
      return;
    }
    if (session) markTourDone(session.subjectId);
    navigate(fromSettings ? "/student/settings" : "/student/home", { replace: true });
  };

  return (
    <ViewEnter view={step} level={step}>
      <MascotStepScreen
        progress={`Paso ${step + 1} de ${lines.length}`}
        title="Te presento IRIS"
        message={lines[step]}
        buttonLabel={isLastStep ? (fromSettings ? "Volver a Ajustes" : "¡Empezar!") : "Siguiente"}
        onAdvance={advance}
      />
    </ViewEnter>
  );
}
