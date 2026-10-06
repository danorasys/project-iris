import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import type { StudentProfile } from "@iris/shared-types";
import { useAuth } from "@/shared/auth/useAuth";
import { useEstudiantesDeTutor, useLoginPerfilEstudiante } from "@/shared/api/hooks/useAuthApi";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { isTourSeen } from "@/features/student/lib/dwellPreferences";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { NumericKeypad } from "@/shared/ui/NumericKeypad";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { IconInfo } from "@/shared/ui/icons";
import avatarGuardian from "@/assets/auth/avatar-guardian.png";
import avatarPeques from "@/assets/auth/avatar-peques.png";
import styles from "./ProfileSelectorAuth.module.css";

/** `/login/guardian/portal`, behind RequireRol so it needs a tutor session.
 * Picking a child checks their PIN and switches to the student session. */
export default function ProfileSelectorAuth() {
  return <GuardianPortalChoice />;
}

/** First screen after the tutor logs in: the parents' portal or hand the
 * device to a child. It keeps a shared tablet from showing children's names
 * before someone chooses. */
function GuardianPortalChoice() {
  const navigate = useNavigate();
  const { closeSession } = useAuth();
  const [showingProfiles, setShowingProfiles] = useState(false);

  async function handleLogout() {
    await closeSession();
    navigate("/login/adult", { replace: true });
  }

  if (showingProfiles) {
    return <ProfilePicker onBack={() => setShowingProfiles(false)} />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>¿Cómo quieres continuar?</h1>
      <p className={styles.subtitle}>Entra a tu portal o pásale el equipo a tu peque.</p>

      <div className={styles.portalChoices}>
        <button type="button" className={styles.portalCard} onClick={() => navigate("/guardian/verify-2fa")}>
          <img src={avatarGuardian} alt="" className={styles.portalCardIcon} />
          <span className={styles.portalCardText}>
            <span className={styles.portalCardTitle}>Portal Padres</span>
            <span className={styles.portalCardNote}>Todo tu espacio de gestión familiar, en un solo lugar.</span>
          </span>
        </button>
        <button type="button" className={styles.portalCard} onClick={() => setShowingProfiles(true)}>
          <img src={avatarPeques} alt="" className={styles.portalCardIcon} />
          <span className={styles.portalCardText}>
            <span className={styles.portalCardTitle}>Portal Peques</span>
            <span className={styles.portalCardNote}>Su lugar para explorar, aprender y progresar.</span>
          </span>
        </button>
      </div>

      <div className={styles.notice}>
        <IconInfo className={styles.noticeIcon} />
        <p className={styles.noticeText}>
          Si va a entrar tu peque: que se siente frente a la cámara y la pantalla, a un brazo de distancia como
          máximo, con buena luz y sin nadie más en el encuadre. Al dar clic en su portal entrarán directo a calibrar
          la sesión.
        </p>
      </div>

      <button type="button" className={styles.logoutButton} onClick={handleLogout}>
        <LogOut size={20} strokeWidth={2} aria-hidden="true" />
        Cerrar sesión
      </button>
    </main>
  );
}

function ProfilePicker({ onBack }: { onBack: () => void }) {
  const profiles = useEstudiantesDeTutor(true);
  const [selected, setSelected] = useState<StudentProfile | null>(null);

  if (selected) {
    return <PinEntry profile={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>¿Quién eres?</h1>
      <p className={styles.subtitle}>Toca tu avatar para continuar.</p>

      {profiles.isLoading && <p role="status">Cargando perfiles…</p>}
      {profiles.isError && (
        <p role="alert" className={styles.error}>
          No pudimos cargar los perfiles. Intenta de nuevo.
        </p>
      )}
      {profiles.data && profiles.data.length === 0 && (
        <p className={styles.subtitle}>Este tutor todavía no tiene perfiles de estudiante creados.</p>
      )}

      {profiles.data && profiles.data.length > 0 && (
        <div className={styles.profiles}>
          {profiles.data.map((profile) => (
            <BigChoiceButton
              key={profile.id}
              variant="teal"
              icon={<StudentAvatarImage avatarId={profile.avatar_id} size="small" label={profile.first_name} />}
              onSelect={() => setSelected(profile)}
            >
              <span className={styles.profileName}>{profile.first_name}</span>
            </BigChoiceButton>
          ))}
        </div>
      )}

      <button type="button" className={styles.textLink} onClick={onBack}>
        Volver
      </button>
    </main>
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
      setSession(tokens);
      const alreadySawTour = isTourSeen(profile.id);
      navigate(alreadySawTour ? "/student/home" : "/student/tour", { replace: true });
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setPin("");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.activeProfile}>
        <StudentAvatarImage avatarId={profile.avatar_id} size="large" label={profile.first_name} />
        <h1 className={styles.title}>Hola, {profile.first_name}</h1>
        <p className={styles.subtitle}>Escribe tu PIN.</p>
      </div>

      <div className={styles.pinWrapper}>
        <NumericKeypad
          value={pin}
          onChange={setPin}
          onConfirm={handleConfirm}
          maxLength={4}
          minLength={4}
          mask
          numericFont="body"
        />
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <button type="button" className={styles.textLink} onClick={onBack}>
        No soy yo, elegir otro perfil
      </button>
    </main>
  );
}
