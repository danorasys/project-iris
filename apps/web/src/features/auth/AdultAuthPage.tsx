import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/AuthContext";
import { useLogin, useRegistrarDocente, useDocumentTypes } from "@/shared/api/hooks/useAuthApi";
import { decodeJwtPayload } from "@/shared/auth/jwt";
import { getAuthErrorMessage } from "./errors";
import { TextField } from "./ui/TextField";
import { SelectField } from "./ui/SelectField";
import { PasswordRequirements, passwordMeetsRequirements } from "./ui/PasswordRequirements";
import { IrisMark } from "@/shared/ui/IrisMark";
import { IconArrowLeft, IconInfo } from "@/shared/ui/icons";
import logoIris from "@/assets/landing/logo-iris.png";
import iconGuardian from "@/assets/auth/avatar-guardian.png";
import iconTeacher from "@/assets/auth/avatar-teacher.png";
import styles from "./AdultAuthPage.module.css";

type View = "login" | "elegirRegistro" | "registroDocente";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_TEACHER_AGE = 18;
const TEACHER_PHONE_LENGTH = 10;
const TODAY_ISO = new Date().toISOString().slice(0, 10);

function calculateAge(birthDateISO: string): number {
  const birthDate = new Date(birthDateISO);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasNotHadBirthdayYet =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (hasNotHadBirthdayYet) age--;
  return age;
}

/** This is `/login/adult/*`, the entry point for any adult, guardian or
 * teacher. Login is shared since the JWT carries the real role, not the
 * URL. Registration is different for each one, so "Regístrate" first asks
 * which one you are. A guardian goes to the `/login/student` wizard, a
 * teacher stays on this page. */
export default function AdultAuthPage() {
  const location = useLocation();
  const requestedView = (location.state as { vista?: View } | null)?.vista;
  const [view, setView] = useState<View>(requestedView ?? "login");

  return (
    <main className={styles.page}>
      <BrandPanel />
      <div className={styles.formColumn}>
        {view === "elegirRegistro" ? (
          <button type="button" className={styles.back} onClick={() => setView("login")}>
            <IconArrowLeft /> Volver atrás
          </button>
        ) : (
          <Link to="/" className={styles.back}>
            <IconArrowLeft /> Volver al inicio
          </Link>
        )}
        <div className={styles.formWrapper}>
          {view === "login" && <LoginForm onGoToRegister={() => setView("elegirRegistro")} />}
          {view === "elegirRegistro" && (
            <ChooseAccountType
              onSelectTeacher={() => setView("registroDocente")}
              onBackToLogin={() => setView("login")}
            />
          )}
          {view === "registroDocente" && (
            <TeacherRegistrationForm
              onBackToChoice={() => setView("elegirRegistro")}
              onGoToLogin={() => setView("login")}
            />
          )}
        </div>
        <p className={styles.minorNotice}>
          <IconInfo className={styles.minorNoticeIcon} />
          El registro y el ingreso de un menor de edad a IRIS debe estar siempre acompañado por su madre, padre,
          tutor o adulto responsable.
        </p>
      </div>
    </main>
  );
}

function BrandPanel() {
  return (
    <aside className={styles.brandPanel}>
      <IrisMark size={420} className={`${styles.ring} ${styles.ringLarge}`} />
      <IrisMark size={220} className={`${styles.ring} ${styles.ringSmall}`} />
      <div className={styles.brandContent}>
        <img src={logoIris} alt="" className={styles.brandLogo} />
        <p className={styles.brandWordmark}>IRIS</p>
        <span className={styles.brandRule} aria-hidden="true" />
        <p className={styles.brandSlogan}>Tu mirada. Tu forma de aprender.</p>
        <p className={styles.brandDescription}>
          Tecnología educativa accesible mediante seguimiento de la mirada.
        </p>
      </div>
    </aside>
  );
}

function LoginForm({ onGoToRegister }: { onGoToRegister: () => void }) {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);

  const emailValid = EMAIL_PATTERN.test(email.trim());
  const passwordValid = password.length > 0;
  const formValid = emailValid && passwordValid;

  const emailError = emailTouched && !emailValid ? "Escribe un correo electrónico válido." : undefined;
  const passwordError = passwordTouched && !passwordValid ? "Escribe tu contraseña." : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    if (!formValid) return;

    setError(null);
    try {
      const tokens = await login.mutateAsync({ email: email.trim(), password });
      setSession(tokens);
      const role = decodeJwtPayload(tokens.access_token)?.role;
      navigate(role === "guardian" ? "/login/student/profile" : "/teacher/home", { replace: true });
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="Iniciar sesión">
      <p className={styles.accessEyebrow}>Acceso para padres, madres, tutores, adultos responsables y docentes</p>
      <h1 className={styles.title}>Iniciar sesión</h1>

      <TextField
        id="adulto-login-correo"
        label="Correo electrónico"
        type="email"
        value={email}
        onChange={setEmail}
        onBlur={() => setEmailTouched(true)}
        error={emailError}
        required
        autoComplete="email"
      />
      <div className={styles.fieldWithLink}>
        <TextField
          id="adulto-login-password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={setPassword}
          onBlur={() => setPasswordTouched(true)}
          error={passwordError}
          required
          autoComplete="current-password"
        />
        <button type="button" className={styles.forgotLink} onClick={() => setShowRecoveryNotice(true)}>
          ¿Olvidaste tu contraseña?
        </button>
        {showRecoveryNotice && (
          <p role="status" className={styles.recoveryNotice}>
            La recuperación de contraseña estará disponible pronto. Mientras tanto, verifica que estés escribiendo el correo correcto.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <button type="submit" className={styles.primaryButton} disabled={!formValid || login.isPending}>
        {login.isPending ? "Ingresando…" : "Ingresar"}
      </button>

      <p className={styles.formFooter}>
        ¿Aún no tienes cuenta?{" "}
        <button type="button" className={styles.secondaryLink} onClick={onGoToRegister}>
          Regístrate
        </button>
      </p>
    </form>
  );
}

function ChooseAccountType({
  onSelectTeacher,
  onBackToLogin,
}: {
  onSelectTeacher: () => void;
  onBackToLogin: () => void;
}) {
  return (
    <div className={styles.form}>
      <p className={styles.accessEyebrow}>Acceso para padres, madres, tutores, adultos responsables y docentes</p>
      <h1 className={styles.title}>Crea tu cuenta</h1>
      <p className={styles.subtitle}>Cuéntanos cómo vas a usar IRIS para llevarte al registro correcto.</p>

      <div className={styles.registrationOptions}>
        <Link to="/login/student/new" className={styles.registrationOption}>
          <span className={styles.registrationOptionText}>
            <span className={styles.registrationOptionTitle}>Soy tutor, papá o mamá</span>
            <span className={styles.registrationOptionNote}>
              Crea la cuenta de tu hijo o hija y acompaña sus primeros pasos en IRIS.
            </span>
          </span>
          <img src={iconGuardian} alt="" className={styles.registrationOptionIcon} />
        </Link>
        <button type="button" className={styles.registrationOption} onClick={onSelectTeacher}>
          <span className={styles.registrationOptionText}>
            <span className={styles.registrationOptionTitle}>Soy docente</span>
            <span className={styles.registrationOptionNote}>
              Crea aulas y lecciones, y sigue el progreso de tus estudiantes.
            </span>
          </span>
          <img src={iconTeacher} alt="" className={styles.registrationOptionIcon} />
        </button>
      </div>

      <p className={styles.formFooter}>
        ¿Ya tienes cuenta?{" "}
        <button type="button" className={styles.secondaryLink} onClick={onBackToLogin}>
          Inicia sesión
        </button>
      </p>
    </div>
  );
}

function TeacherRegistrationForm({
  onBackToChoice,
  onGoToLogin,
}: {
  onBackToChoice: () => void;
  onGoToLogin: () => void;
}) {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const registrar = useRegistrarDocente();
  const documentTypesQuery = useDocumentTypes();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentType, setDocumentType] = useState<string>("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [institution, setInstitution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dateOfBirthError, setDateOfBirthError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Default to the first catalog option once it loads, only if the field
  // is still untouched, so a returning user's selection is never overridden.
  useEffect(() => {
    if (documentType === "" && documentTypesQuery.data && documentTypesQuery.data.length > 0) {
      setDocumentType(String(documentTypesQuery.data[0].id));
    }
  }, [documentType, documentTypesQuery.data]);

  const documentTypeReady = documentType !== "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!documentTypeReady) return;

    if (calculateAge(dateOfBirth) < MINIMUM_TEACHER_AGE) {
      setDateOfBirthError(`Debes ser mayor de edad (${MINIMUM_TEACHER_AGE} años o más) para registrarte como docente.`);
      return;
    }
    setDateOfBirthError(null);
    if (phone.length !== TEACHER_PHONE_LENGTH) {
      setPhoneError("Ingresa un número telefónico válido.");
      return;
    }
    setPhoneError(null);
    if (!passwordMeetsRequirements(password)) {
      setPasswordError("La contraseña debe cumplir todos los requisitos indicados abajo.");
      return;
    }
    setPasswordError(null);

    try {
      const tokens = await registrar.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        document_type_id: Number(documentType),
        document_number: documentNumber.trim(),
        date_of_birth: dateOfBirth,
        email: email.trim(),
        password,
        phone: phone.trim(),
        institution: institution.trim(),
      });
      setSession(tokens);
      navigate("/teacher/home", { replace: true });
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="Crear cuenta de docente">
      <button type="button" className={styles.backToChoice} onClick={onBackToChoice}>
        <IconArrowLeft /> Elegir otro tipo de cuenta
      </button>
      <h1 className={styles.title}>Crea tu cuenta de docente</h1>
      <p className={styles.subtitle}>Construye aulas, crea lecciones y sigue el progreso de tus estudiantes.</p>

      <TextField id="docente-nombres" label="Nombres" value={firstName} onChange={setFirstName} required autoComplete="given-name" />
      <TextField
        id="docente-apellidos"
        label="Apellidos"
        value={lastName}
        onChange={setLastName}
        required
        autoComplete="family-name"
      />
      <SelectField
        id="docente-tipo-documento"
        label="Tipo de documento"
        value={documentType}
        onChange={setDocumentType}
        options={(documentTypesQuery.data ?? []).map((dt) => ({ value: String(dt.id), label: dt.name }))}
        required
        disabled={documentTypesQuery.isLoading}
      />
      <TextField
        id="docente-numero-documento"
        label="Número de documento"
        value={documentNumber}
        onChange={(value) => setDocumentNumber(value.replace(/\D/g, ""))}
        required
        inputMode="numeric"
      />
      <TextField
        id="docente-fecha-nacimiento"
        label="Fecha de nacimiento"
        type="date"
        value={dateOfBirth}
        onChange={(value) => {
          setDateOfBirth(value);
          setDateOfBirthError(null);
        }}
        error={dateOfBirthError ?? undefined}
        required
        max={TODAY_ISO}
      />
      <TextField
        id="docente-correo"
        label="Correo electrónico"
        type="email"
        value={email}
        onChange={setEmail}
        required
        autoComplete="email"
      />
      <TextField
        id="docente-telefono"
        label="Teléfono"
        type="tel"
        value={phone}
        onChange={(value) => {
          setPhone(value.replace(/\D/g, "").slice(0, TEACHER_PHONE_LENGTH));
          setPhoneError(null);
        }}
        error={phoneError ?? undefined}
        required
        autoComplete="tel"
        inputMode="numeric"
      />
      <TextField
        id="docente-password"
        label="Contraseña"
        type="password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          setPasswordError(null);
        }}
        error={passwordError ?? undefined}
        required
        autoComplete="new-password"
      />
      <PasswordRequirements password={password} />
      <TextField
        id="docente-institucion"
        label="Institución"
        value={institution}
        onChange={setInstitution}
        required
        autoComplete="organization"
      />
      {documentTypesQuery.isError && (
        <p role="alert" className={styles.error}>
          No pudimos cargar los tipos de documento. Verifica tu conexión e intenta de nuevo.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button type="submit" className={styles.primaryButton} disabled={registrar.isPending || !documentTypeReady}>
        {registrar.isPending ? "Creando cuenta…" : "Crear cuenta"}
      </button>

      <p className={styles.formFooter}>
        ¿Ya tienes cuenta?{" "}
        <button type="button" className={styles.secondaryLink} onClick={onGoToLogin}>
          Inicia sesión
        </button>
      </p>
    </form>
  );
}
