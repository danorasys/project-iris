import { startTransition, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { StudentProfile } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { routeAfterPin } from "@/features/student/lib/studentJourney";
import { useEstudiantesDeTutor, useLoginPerfilEstudiante } from "@/shared/api/hooks/useAuthApi";
import { useAuth } from "@/shared/auth/useAuth";
import { PinScreen } from "./PinScreen";
import { ProfileChooser } from "./ProfileChooser";
import styles from "./KidProfilesPage.module.css";

/** `/kids/profiles`, with the tutor's session: after the calibration, the
 * kid picks their profile and writes their PIN, with the eyes too. The PIN
 * switches to the kid's session. */
export default function KidProfilesPage() {
  const navigate = useNavigate();
  return <ProfilePicker onBack={() => navigate("/guardian/start")} />;
}

function ProfilePicker({ onBack }: { onBack: () => void }) {
  const profiles = useEstudiantesDeTutor(true);
  const [selected, setSelected] = useState<StudentProfile | null>(null);
  const [group, setGroup] = useState(0);

  if (selected) {
    return <PinEntry profile={selected} onBack={() => setSelected(null)} />;
  }

  let status = null;
  if (profiles.isLoading) status = <p role="status" className={styles.status}>Cargando perfiles…</p>;
  else if (profiles.isError)
    status = (
      <p role="alert" className={styles.error}>
        No pudimos cargar los perfiles. Intenta de nuevo.
      </p>
    );
  else if (profiles.data?.length === 0)
    status = <p className={styles.subtitle}>Este tutor todavía no tiene perfiles de estudiante creados.</p>;

  return (
    <ProfileChooser
      profiles={profiles.data ?? []}
      group={group}
      onGroup={setGroup}
      onPick={setSelected}
      onBack={onBack}
      status={status}
    />
  );
}

function PinEntry({ profile, onBack }: { profile: StudentProfile; onBack: () => void }) {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const loginProfile = useLoginPerfilEstudiante();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      const tokens = await loginProfile.mutateAsync({ student_id: profile.id, pin });
      // React Router moves inside a transition. If the kid's session landed
      // first, this page (only for guardians) would see a student and send
      // them to /login. In the same transition both land together.
      startTransition(() => {
        setSession(tokens);
        navigate(routeAfterPin(profile.id), { replace: true });
      });
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setPin("");
    }
  }

  return (
    <PinScreen
      profile={profile}
      pin={pin}
      onPin={(next) => {
        setPin(next);
        setError(null);
      }}
      onConfirm={() => void handleConfirm()}
      checking={loginProfile.isPending}
      error={error}
      onBack={onBack}
    />
  );
}
