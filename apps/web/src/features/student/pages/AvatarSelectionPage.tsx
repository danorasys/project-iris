import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/AuthContext";
import { useActualizarMiAvatar } from "@/shared/api/hooks/useAuthApi";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import { Mascot } from "@/shared/ui/Mascot";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { STUDENT_AVATARS, type AvatarOption } from "@/shared/ui/avatarCatalog";
import { markTourSeen } from "../lib/dwellPreferences";
import styles from "./AvatarSelectionPage.module.css";

type Phase = "announce" | "gallery";

interface AvatarCornerProps {
  avatar: AvatarOption;
  onSelect: () => void;
}

/** One quadrant of the full-screen avatar grid, dwell-selectable like every
 * other gaze target in the app. Bespoke instead of `BigChoiceButton` because
 * it has to fill its quadrant edge-to-edge, not size to its content. */
function AvatarCorner({ avatar, onSelect }: AvatarCornerProps) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({ onSelect });

  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.corner} ${focused ? styles.focused : ""}`}
      onClick={onSelect}
    >
      <span className={styles.cornerFill} style={{ transform: `scale(${progress})` }} aria-hidden="true" />
      <StudentAvatarImage avatarId={avatar.id} size="large" label={avatar.label} />
      <span className={styles.cornerLabel}>{avatar.label}</span>
    </button>
  );
}

/** This is `/student/avatar`. The 4 fixed avatars fill the whole screen,
 * one per corner, each a full gaze-dwell target, not a small centered
 * gallery. Dwelling on one opens a confirm/cancel modal instead of saving
 * right away, so a wrong dwell is never final. */
export default function AvatarSelectionPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const updateAvatar = useActualizarMiAvatar();

  const [phase, setPhase] = useState<Phase>("announce");
  const [chosen, setChosen] = useState<AvatarOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    if (session) markTourSeen(session.subjectId);
    navigate("/student/home", { replace: true });
  };

  const confirm = async () => {
    if (!chosen) return;
    setError(null);
    try {
      await updateAvatar.mutateAsync({ avatar: chosen.id });
      finish();
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setChosen(null);
    }
  };

  if (phase === "announce") {
    return (
      <main className={styles.announce}>
        <Mascot mood="cheering" size="large">
          ¡Ya aprendí a seguir tu mirada! Ahora vamos a elegir tu avatar.
        </Mascot>
        <BigChoiceButton variant="coral" onSelect={() => setPhase("gallery")}>
          Comenzar
        </BigChoiceButton>
      </main>
    );
  }

  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerBubble}>
          <Mascot mood="happy">Mira fijo el avatar que más te guste.</Mascot>
        </div>
      </div>
      <div className={styles.stage}>
        {STUDENT_AVATARS.map((avatar) => (
          <AvatarCorner key={avatar.id} avatar={avatar} onSelect={() => setChosen(avatar)} />
        ))}
      </div>
      {chosen && (
        <ConfirmModal
          message="¿Confirmas que este va a ser tu avatar?"
          preview={<StudentAvatarImage avatarId={chosen.id} size="large" label={chosen.label} />}
          acceptLabel="Sí, aceptar"
          cancelLabel="Cancelar"
          onAccept={confirm}
          onCancel={() => setChosen(null)}
          disabled={updateAvatar.isPending}
        />
      )}
      {error && (
        <div className={styles.errorBanner}>
          <p role="alert">{error}</p>
        </div>
      )}
    </>
  );
}
