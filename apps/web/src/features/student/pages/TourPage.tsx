import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { getInputMode, type InputMode } from "@/shared/gaze/inputMode";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { MascotStepScreen } from "../components/MascotStepScreen";
import { markTourDone } from "../lib/studentJourney";

// How to choose something, in the words of the way the kid moves.
const HOW_TO_CHOOSE: Record<InputMode, string> = {
  gaze: "Para elegir algo, mira fijo un botón grande. Se va llenando de color y cuando se llena por completo, ¡listo, ya lo elegiste!",
  mouse:
    "Para elegir algo, haz clic en un botón grande. También puedes dejar el puntero quieto encima y se llenará de color.",
  keyboard:
    "Para elegir algo, usa la tecla Tab: pasa de un botón grande a otro. Cuando llegues al que quieres, presiona Enter.",
};

function steps(mode: InputMode): string[] {
  return [
    "¡Hola! Soy IRIS y te voy a acompañar mientras aprendes.",
    HOW_TO_CHOOSE[mode],
    "En tu inicio están tus clases. Tu familia te inscribe en ellas y tu profe prepara las lecciones.",
    "Si algún día quieres ver este recorrido otra vez o cambiar cómo te mueves, entra a Ajustes desde tu inicio.",
  ];
}

/** HU-89: the tour by IRIS, the first time the kid enters (after calibrating
 * with the gaze, or right after the PIN with the mouse or the keyboard). It
 * explains how to choose with the way the kid moves (gaze, mouse or
 * keyboard). It can be seen again from Ajustes, and then goes back there. */
export default function TourPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { session } = useAuth();
  const [step, setStep] = useState(0);
  const lines = steps(getInputMode());
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
        message={lines[step]}
        buttonLabel={isLastStep ? (fromSettings ? "Volver a Ajustes" : "¡Empezar!") : "Siguiente"}
        variant={isLastStep ? "hoja" : "coral"}
        onAdvance={advance}
      />
    </ViewEnter>
  );
}
