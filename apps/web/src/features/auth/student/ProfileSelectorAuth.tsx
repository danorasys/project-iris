import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { StudentProfile } from "@iris/shared-types";
import { useAuth } from "@/shared/auth/AuthContext";
import { guardarCorreoTutorReciente, leerCorreoTutorReciente } from "@/shared/auth/tokenStorage";
import { useEstudiantesDeTutor, useLogin, useLoginPerfilEstudiante } from "@/shared/api/hooks/useAuthApi";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { isTourSeen } from "@/features/student/lib/dwellPreferences";
import { TextField } from "@/features/auth/ui/TextField";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { NumericKeypad } from "@/shared/ui/NumericKeypad";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import styles from "./ProfileSelectorAuth.module.css";

/** `/login/student/profile`, the "Ya soy Mirador" branch. If the device
 * already has an active tutor session, it goes straight to the profile
 * picker. Otherwise it asks for the guardian login first (same endpoint as
 * teacher, different JWT role) so it can list their profiles. Once a
 * profile is picked, the PIN is validated against `identity-service` and
 * the session becomes the student profile's session. */
export default function ProfileSelectorAuth() {
  const { session } = useAuth();

  if (session?.role !== "guardian") {
    return <GuardianLogin />;
  }
  return <ProfilePicker />;
}

function GuardianLogin() {
  const { setSession } = useAuth();
  const login = useLogin();
  const [email, setEmail] = useState(() => leerCorreoTutorReciente() ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const tokens = await login.mutateAsync({ email: email.trim(), password });
      setSession(tokens);
      guardarCorreoTutorReciente(email.trim());
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Ya soy Mirador</h1>
      <p className={styles.subtitle}>Un adulto entra primero, para elegir el perfil del estudiante.</p>
      <form className={styles.form} onSubmit={handleSubmit} aria-label="Ingresar como tutor">
        <TextField
          id="perfil-tutor-correo"
          label="Correo del tutor"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <TextField
          id="perfil-tutor-password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button type="submit" className={styles.primaryButton} disabled={login.isPending}>
          {login.isPending ? "Ingresando…" : "Continuar"}
        </button>
      </form>
    </main>
  );
}

function ProfilePicker() {
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
              icon={<StudentAvatarImage avatarId={profile.avatar} size="small" label={profile.first_name} />}
              onSelect={() => setSelected(profile)}
            >
              <span className={styles.profileName}>{profile.first_name}</span>
            </BigChoiceButton>
          ))}
        </div>
      )}
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
        <StudentAvatarImage avatarId={profile.avatar} size="large" label={profile.first_name} />
        <h1 className={styles.title}>Hola, {profile.first_name}</h1>
        <p className={styles.subtitle}>Escribe tu PIN.</p>
      </div>

      <div className={styles.pinWrapper}>
        <NumericKeypad value={pin} onChange={setPin} onConfirm={handleConfirm} maxLength={6} minLength={4} mask />
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
