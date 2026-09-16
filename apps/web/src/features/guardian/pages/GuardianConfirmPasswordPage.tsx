import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useConfirmarMiPassword } from "@/shared/api/hooks/useAuthApi";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { TextField } from "@/features/auth/ui/TextField";
import { IconLock } from "@/shared/ui/icons";
import styles from "./GuardianConfirmPasswordPage.module.css";

/** `/guardian/confirm-password`. Shown between picking "Portal de padres"
 * on the student profile screen and the panel itself. It checks the
 * guardian's password again, so a session left open on a shared family
 * computer can't be used to get into the portal. It does not change the
 * session's tokens (see useConfirmarMiPassword) — it only checks that
 * whoever is at the keyboard right now still knows the password. */
export default function GuardianConfirmPasswordPage() {
  const navigate = useNavigate();
  const confirmPassword = useConfirmarMiPassword();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await confirmPassword.mutateAsync({ password });
      navigate("/guardian/portal", { replace: true });
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setPassword("");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <IconLock width={32} height={32} className={styles.icon} />
        <h1 className={styles.title}>Confirma tu contraseña</h1>
        <p className={styles.subtitle}>
          Por tu seguridad, vuelve a escribir tu contraseña antes de entrar al Portal de Padres.
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <TextField
            id="confirmar-password"
            label="Contraseña"
            type="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
            error={error ?? undefined}
          />
          <button type="submit" className={styles.primaryButton} disabled={confirmPassword.isPending || !password}>
            {confirmPassword.isPending ? "Verificando…" : "Continuar"}
          </button>
        </form>
        <button type="button" className={styles.textLink} onClick={() => navigate("/login/student/profile")}>
          Volver
        </button>
      </div>
    </main>
  );
}
