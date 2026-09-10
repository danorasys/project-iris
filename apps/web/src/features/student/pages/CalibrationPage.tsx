import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { IrisMark } from "@/shared/ui/IrisMark";
import { useAuth } from "@/shared/auth/AuthContext";
import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import { useGazeSourceOptional } from "@/shared/gaze/GazeSourceContext";
import { activateManualFallback, type GazeEngineState } from "@/shared/gaze/GazeSource";
import { calculateAverageDwellMs, saveDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./CalibrationPage.module.css";

interface CalibrationPointProps {
  x: number; // 0-100, percent of the stage width
  y: number; // 0-100, percent of the stage height
  label: string;
  onComplete: () => void;
}

/** A single calibration point, pure dwell (needs absolute % positioning,
 * unlike `BigChoiceButton`). Square on purpose, reads as something you
 * "press" with your gaze. */
function CalibrationPoint({ x, y, label, onComplete }: CalibrationPointProps) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({ onSelect: onComplete });

  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.point} ${focused ? styles.focused : ""}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={onComplete}
      aria-label={label}
    >
      <span className={styles.pointFill} style={{ transform: `scale(${progress})` }} aria-hidden="true" />
    </button>
  );
}

// Center plus 4 corners, covers the real range where the rest of the
// interface's dwell targets will appear. Used in pass 2 (personal dwell
// measurement), which already runs with real mapped coordinates.
const POINTS = [
  { x: 50, y: 50 },
  { x: 15, y: 22 },
  { x: 85, y: 22 },
  { x: 15, y: 82 },
  { x: 85, y: 82 },
];

// Reasonable bounds for the resulting custom dwell, not so short it fires
// accidental selections, not so long it frustrates the child.
const DURATION_MIN_MS = 500;
const DURATION_MAX_MS = 2500;

// Time given to the real engine to calibrate before offering the mouse
// fallback. Generous on purpose since EyeGestures runs its own calibration
// UI (25 points) at the student's pace, and we just wait for it.
const ENGINE_WAIT_TIMEOUT_MS = 180_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type Phase = "engine_calibrating" | "engine_error" | "intro" | "calibrating" | "ready";

function continueWithMouse(): void {
  activateManualFallback();
  window.location.reload();
}

/** `/student/calibration`, chains two calibrations: the EyeGestures
 * engine's own (drawn by the library itself), then our own measurement of
 * how long this student takes to complete a dwell, saved as their default
 * for the rest of the interface. If the active source isn't EyeGestures
 * (dev/fallback mouse mode), the first phase is skipped entirely. */
export default function CalibrationPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const source = useGazeSourceOptional();

  const [phase, setPhase] = useState<Phase>(() => {
    const initialState = source?.getEngineState?.();
    if (!initialState) return "intro";
    if (initialState === "ready") return "intro";
    if (initialState === "error") return "engine_error";
    return "engine_calibrating";
  });
  const [currentStep, setCurrentStep] = useState(0);
  const timesRef = useRef<number[]>([]);
  const pointStartRef = useRef(0);

  // The real engine (if this source has one) doesn't start just by entering
  // /student/*, it starts here, on purpose, since its calibration UI
  // takes over the whole screen as soon as it starts (see GazeSource.ts).
  useEffect(() => {
    source?.activateEngine?.();
  }, [source]);

  useEffect(() => {
    if (!source?.subscribeEngineState) return;
    return source.subscribeEngineState((state: GazeEngineState) => {
      setPhase((current) => {
        if (current !== "engine_calibrating") return current;
        if (state === "ready") return "intro";
        if (state === "error") return "engine_error";
        return current;
      });
    });
  }, [source]);

  // If the engine doesn't calibrate in time (camera denied, no camera, the
  // student skipped the library's own screen), offer the mouse fallback.
  // Timed from when this screen mounted, not from when the engine started.
  useEffect(() => {
    if (phase !== "engine_calibrating") return;
    const timer = setTimeout(() => {
      setPhase((current) => (current === "engine_calibrating" ? "engine_error" : current));
    }, ENGINE_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "calibrating") {
      pointStartRef.current = performance.now();
    }
  }, [phase, currentStep]);

  const start = () => {
    timesRef.current = [];
    setCurrentStep(0);
    setPhase("calibrating");
  };

  const completePoint = () => {
    const elapsed = performance.now() - pointStartRef.current;
    timesRef.current = [...timesRef.current, elapsed];

    const isLast = currentStep + 1 >= POINTS.length;
    if (isLast) {
      const average = calculateAverageDwellMs(timesRef.current);
      if (session && average > 0) {
        saveDwellDurationMs(session.subjectId, clamp(average, DURATION_MIN_MS, DURATION_MAX_MS));
      }
      setPhase("ready");
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  if (phase === "engine_calibrating") {
    return (
      <main className={styles.centered}>
        <IrisMark size={120} animated />
        <Mascot mood="thinking" size="large">
          Activa tu cámara y sigue las instrucciones en pantalla. Nos vamos a tardar un momento.
        </Mascot>
        <button type="button" className={styles.fallbackLink} onClick={continueWithMouse}>
          ¿No tienes cámara? Continuar con el mouse
        </button>
      </main>
    );
  }

  if (phase === "engine_error") {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="large">
          No pudimos activar tu cámara. Puede que necesites darle permiso, o que este computador no
          tenga una — no hay problema, sigamos con el mouse por ahora.
        </Mascot>
        <BigChoiceButton variant="coral" onSelect={continueWithMouse}>
          Continuar con el mouse
        </BigChoiceButton>
      </main>
    );
  }

  if (phase === "intro") {
    return (
      <main className={styles.centered}>
        <Mascot mood="cheering" size="large">
          Vamos a calibrar tus ojos. Cuando aparezca un punto, mira fijo hasta que se llene por completo.
        </Mascot>
        <BigChoiceButton variant="coral" onSelect={start}>
          Comenzar
        </BigChoiceButton>
      </main>
    );
  }

  if (phase === "ready") {
    return (
      <main className={styles.centered}>
        <Mascot mood="celebrating" size="large">
          ¡Muy bien! Ya sé cómo miras. Ahora todo se va a llenar a tu ritmo.
        </Mascot>
        <BigChoiceButton variant="hoja" onSelect={() => navigate("/student/avatar")}>
          Continuar
        </BigChoiceButton>
      </main>
    );
  }

  const point = POINTS[currentStep];

  return (
    <main className={styles.stage}>
      <p className={styles.progress} aria-live="polite">
        Punto {currentStep + 1} de {POINTS.length}
      </p>
      <CalibrationPoint
        key={currentStep}
        x={point.x}
        y={point.y}
        label={`Punto de calibración ${currentStep + 1} de ${POINTS.length}`}
        onComplete={completePoint}
      />
    </main>
  );
}
