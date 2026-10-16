import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGazeSourceOptional } from "@/shared/gaze/useGazeSource";
import type { GazeEngineState } from "@/shared/gaze/GazeSource";
import { IconEye } from "@/shared/ui/icons";
import { KidHeader, KidMessage, KidPage } from "@/shared/ui/kid/KidKit";
import { markDeviceReady } from "../lib/studentJourney";

// Time given to the real engine to calibrate before saying the camera
// isn't answering. Generous on purpose since EyeGestures runs its own
// calibration (25 points) at the kid's pace, and we just wait for it.
const ENGINE_WAIT_TIMEOUT_MS = 180_000;

type Phase = "engine_calibrating" | "engine_error" | "ready";

function phaseOf(state: GazeEngineState | undefined): Phase {
  if (state === "error") return "engine_error";
  // Without an engine (only the mouse, in dev) there's nothing to calibrate.
  if (state === undefined || state === "ready") return "ready";
  return "engine_calibrating";
}

/** `/kids/calibration` (before picking the profile, with the tutor's
 * session) and `/student/calibration` (from Ajustes). The calibration is
 * EyeGestures' own: its instructions and its red circles, drawn by the
 * library over this screen. IRIS only waits for it to end and then says
 * so. From Ajustes it asks EyeGestures to calibrate again. */
export default function CalibrationPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const source = useGazeSourceOptional();
  // From Ajustes the engine is already calibrated: it's done again.
  const again = !pathname.startsWith("/kids") && source?.getEngineState?.() === "ready";
  const [phase, setPhase] = useState<Phase>(() =>
    again ? "engine_calibrating" : phaseOf(source?.getEngineState?.() ?? undefined),
  );
  // Before the profiles, they come next; from Ajustes, back home.
  const next = pathname.startsWith("/kids") ? "/kids/profiles" : "/student/home";

  // The real engine doesn't start just by entering, it starts here, on
  // purpose, since its calibration takes over the whole screen.
  useEffect(() => {
    if (again) source?.recalibrate?.();
    else source?.activateEngine?.();
    // Only when this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (!source?.subscribeEngineState) return;
    return source.subscribeEngineState((state: GazeEngineState) => {
      if (state === "ready") {
        // Next time the camera setup is skipped and it goes straight to calibrating.
        markDeviceReady();
        setPhase("ready");
      } else if (state === "error") setPhase("engine_error");
    });
  }, [source]);

  // If the engine doesn't calibrate in time (camera denied, no camera), say so.
  useEffect(() => {
    if (phase !== "engine_calibrating") return;
    const timer = setTimeout(() => {
      setPhase((current) => (current === "engine_calibrating" ? "engine_error" : current));
    }, ENGINE_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Without the camera it still goes on: EyeGestures turns off and the
  // mouse moves the gaze cursor (see EyesFirstGazeSource).
  const goOn = () => {
    if (phase !== "ready") source?.stopEngine?.();
    navigate(next, { replace: true });
  };

  if (phase === "engine_calibrating") {
    return (
      <KidPage back={{ label: "Continuar sin cámara", onSelect: goOn }}>
        <KidHeader eyebrow="Calibración" icon={<IconEye aria-hidden="true" />} title="Calibremos tus ojos" />
        <KidMessage mood="thinking">
          Activa tu cámara y sigue las instrucciones en pantalla: mira cada círculo rojo hasta que cambie de lugar.
          Nos vamos a tardar un momento.
        </KidMessage>
      </KidPage>
    );
  }

  if (phase === "engine_error") {
    return (
      <KidPage
        back={{ label: "Intentar de nuevo", onSelect: () => window.location.reload() }}
        next={{ label: "Continuar", onSelect: goOn }}
      >
        <KidHeader eyebrow="Calibración" icon={<IconEye aria-hidden="true" />} title="No vemos tu cámara" />
        <KidMessage mood="thinking">
          No pudimos activar tu cámara. Puede que necesite permiso o que este computador no tenga una. Revísala e
          inténtalo de nuevo, o continúa por ahora.
        </KidMessage>
      </KidPage>
    );
  }

  return (
    <KidPage next={{ label: "Continuar", onSelect: goOn }}>
      <KidHeader eyebrow="Calibración" icon={<IconEye aria-hidden="true" />} title="¡Muy bien!" />
      <KidMessage mood="celebrating">
        Ya sé cómo miras. El círculo azul va donde miras: déjalo quieto sobre algo hasta que se llene y lo eliges.
      </KidMessage>
    </KidPage>
  );
}
