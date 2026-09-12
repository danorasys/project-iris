import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatPhoneNumberIntl, isValidPhoneNumber, parsePhoneNumber } from "react-phone-number-input";
import type { GuardianRegistrationRequest, StudentProfile } from "@iris/shared-types";
import { useAuth } from "@/shared/auth/AuthContext";
import { guardarCorreoTutorReciente } from "@/shared/auth/tokenStorage";
import { apiFetch } from "@/shared/api/httpClient";
import {
  useRegistrarTutor,
  useDocumentTypes,
  useRelationshipTypes,
  useLoginPerfilEstudiante,
} from "@/shared/api/hooks/useAuthApi";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { STUDENT_AVATARS } from "@/shared/ui/avatarCatalog";
import { TextField } from "@/features/auth/ui/TextField";
import { PhoneField } from "@/features/auth/ui/PhoneField";
import { PasswordRequirements, passwordMeetsRequirements } from "@/features/auth/ui/PasswordRequirements";
import { SelectField } from "@/features/auth/ui/SelectField";
import { CheckboxField } from "@/features/auth/ui/CheckboxField";
import { NumericKeypad } from "@/shared/ui/NumericKeypad";
import { IrisMark } from "@/shared/ui/IrisMark";
import { IconCheck, IconArrowLeft, IconInfo } from "@/shared/ui/icons";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./GuardianRegistrationWizard.module.css";

const CONSENT_POLICY_VERSION = "1.0";
const MIN_GUARDIAN_AGE = 18;
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PinSubstep = "ingresar" | "confirmar" | "listo";
type Phase = "formulario" | "confirmacion";

/** Brings a field into view and focuses it, so a validation error is never
 * just an easy-to-miss inline message below the fold, on submit or when
 * jumping here from the step indicator above.
 *
 * This scrolls the window itself instead of calling the more obvious
 * `field.scrollIntoView()`, on purpose: this page's own root (`.page`) is
 * `overflow: hidden`, needed to clip the decorative background rings, but
 * that also makes it a valid scroll container from the browser's point of
 * view. `scrollIntoView()` walks up the ancestor chain and can decide to
 * scroll that invisible, scrollbar-less container instead of the actual
 * window, which shifts the page's content inside its own clipped box (the
 * back link and rings scroll out the top, blank background grows at the
 * bottom) instead of scrolling the document like a user would expect.
 * Computing the target position ourselves and calling `window.scrollTo`
 * always scrolls the real document, `.page`'s overflow never enters into
 * it. `focus({ preventScroll: true })` avoids the same trap: a plain
 * `.focus()` triggers the browser's own implicit scroll-into-view, which
 * has the identical ancestor-walking behavior. */
function focusAndScrollToField(fieldId: string): void {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.focus({ preventScroll: true });
  const rect = field.getBoundingClientRect();
  const targetTop = rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2;
  window.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" });
}

interface SummaryItem {
  label: string;
  value: string;
}

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

/** Formats an ISO date as readable Spanish text. Builds it from local
 * year/month/day instead of `new Date(iso)`, which parses as UTC midnight
 * and would show a day earlier in Colombia (UTC-5). */
function formatDate(dateISO: string): string {
  if (!dateISO) return "";
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

/** Single source of truth for the issued-date/birth-date relationship, used
 * both on every keystroke (so typing a date directly, which bypasses the
 * date picker's own min/max UI, still gets checked) and again on submit as
 * the last gate. Re-run this whenever EITHER date changes: birth date is
 * this field's own lower bound, so an issued date that was valid a moment
 * ago can become invalid the instant birth date changes, even though
 * nothing was typed into this field itself. */
function validateDocumentIssuedAt(issuedAt: string, birthDate: string): string | null {
  if (!issuedAt) return null;
  if (issuedAt > TODAY_ISO) {
    return "La fecha de expedición del documento no puede ser una fecha futura.";
  }
  if (birthDate && issuedAt < birthDate) {
    return "La fecha de expedición no puede ser anterior a tu fecha de nacimiento. Ingresa una fecha válida.";
  }
  return null;
}

function catalogLabel(items: { id: number; name: string }[] | undefined, id: string): string {
  return items?.find((item) => String(item.id) === id)?.name ?? id;
}

/** Confirmation screen between each form and the next. The IRIS mascot
 * thanks the user for their time and shows a summary of what was just
 * entered, never the password or the PIN, those never get echoed back,
 * before letting them move on or asking them to fix something. */
function ConfirmationScreen({
  greeting,
  items,
  onEdit,
  onConfirm,
  loading = false,
  confirmLabel = "Confirmar",
  error,
}: {
  greeting: ReactNode;
  items: SummaryItem[];
  onEdit: () => void;
  onConfirm: () => void;
  loading?: boolean;
  confirmLabel?: string;
  error?: string | null;
}) {
  return (
    <div className={styles.confirmation}>
      <div className={styles.mascotRow}>
        <img src={logoIris} alt="" className={styles.mascotLogo} />
        <div className={styles.bubble}>
          <p>{greeting}</p>
        </div>
      </div>

      <dl className={styles.summaryList}>
        {items.map((item) => (
          <div key={item.label} className={styles.summaryRow}>
            <dt className={styles.summaryLabel}>{item.label}</dt>
            <dd className={styles.summaryValue}>{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className={styles.question}>¿Confirmas que estos datos son correctos?</p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondaryButton} onClick={onEdit} disabled={loading}>
          Corregir
        </button>
        <button type="button" className={styles.primaryButton} onClick={onConfirm} disabled={loading}>
          {loading ? "Creando cuenta…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/** This is `/login/student/new`, a 2-step wizard. First the guardian's
 * data and consent, then the first student profile with the PIN typed
 * twice. Each step shows a confirmation screen with the IRIS mascot
 * before moving on. Confirming step 2 makes `identity-service` create the
 * person, guardian, student and consent all together. Right after that,
 * this wizard logs into the new student's own session automatically and
 * sends them straight to `/student/setup-conditions`, since calibrating
 * their gaze is the whole point of the account. The manual profile picker
 * (`/login/student/profile`) is still there for anyone coming back later
 * without an active session. */
export default function GuardianRegistrationWizard() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const register = useRegistrarTutor();
  const loginPerfilEstudiante = useLoginPerfilEstudiante();
  const documentTypesQuery = useDocumentTypes();
  const relationshipTypesQuery = useRelationshipTypes();

  const [step, setStep] = useState<1 | 2>(1);
  const [phase, setPhase] = useState<Phase>("formulario");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const step1FormRef = useRef<HTMLFormElement>(null);

  // Step 1, guardian data.
  const [guardianFirstName, setGuardianFirstName] = useState("");
  const [guardianLastName, setGuardianLastName] = useState("");
  const [documentType, setDocumentType] = useState<string>("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [guardianBirthDate, setGuardianBirthDate] = useState("");
  const [documentIssuedAt, setDocumentIssuedAt] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState<string>("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [acceptsDataProcessing, setAcceptsDataProcessing] = useState(false);
  const [authorizesSupportCondition, setAuthorizesSupportCondition] = useState(false);
  const [guardianFirstNameError, setGuardianFirstNameError] = useState<string | null>(null);
  const [guardianLastNameError, setGuardianLastNameError] = useState<string | null>(null);
  const [guardianBirthDateError, setGuardianBirthDateError] = useState<string | null>(null);
  const [documentTypeError, setDocumentTypeError] = useState<string | null>(null);
  const [documentNumberError, setDocumentNumberError] = useState<string | null>(null);
  const [documentIssuedAtError, setDocumentIssuedAtError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordConfirmationError, setPasswordConfirmationError] = useState<string | null>(null);
  const [acceptsDataProcessingError, setAcceptsDataProcessingError] = useState<string | null>(null);
  const [authorizesSupportConditionError, setAuthorizesSupportConditionError] = useState<string | null>(null);

  // Default to the first catalog option once it loads, only if the field
  // is still untouched, so a returning user's selection is never overridden.
  useEffect(() => {
    if (documentType === "" && documentTypesQuery.data && documentTypesQuery.data.length > 0) {
      setDocumentType(String(documentTypesQuery.data[0].id));
    }
  }, [documentType, documentTypesQuery.data]);

  useEffect(() => {
    if (relationship === "" && relationshipTypesQuery.data && relationshipTypesQuery.data.length > 0) {
      setRelationship(String(relationshipTypesQuery.data[0].id));
    }
  }, [relationship, relationshipTypesQuery.data]);

  // Step 2, first student profile.
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  // The avatar picker was pulled from the UI temporarily, it'll be redesigned
  // later. Until then every student registers with this default avatar.
  const avatar = STUDENT_AVATARS[0].id;
  const [supportCondition, setSupportCondition] = useState("");
  const [pinSubstep, setPinSubstep] = useState<PinSubstep>("ingresar");
  const [pin, setPin] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [studentFirstNameError, setStudentFirstNameError] = useState<string | null>(null);
  const [studentLastNameError, setStudentLastNameError] = useState<string | null>(null);
  const [studentBirthDateError, setStudentBirthDateError] = useState<string | null>(null);

  const catalogsReady = documentType !== "" && relationship !== "";
  const catalogsFailed = documentTypesQuery.isError || relationshipTypesQuery.isError;

  /** Validates every field top to bottom and stops at the first one that
   * fails: its error message is set and the field is scrolled into view and
   * focused, so the user always lands exactly where something needs
   * fixing instead of hunting for it. Runs on the step 1 form's own submit,
   * which the step indicator above also triggers via `requestSubmit()`
   * (see `handleStepIndicatorClick`), so both entry points get the same
   * behavior for free instead of duplicating it. */
  function handleSubmitStep1(e: FormEvent) {
    e.preventDefault();
    if (!catalogsReady) return;

    if (!guardianFirstName.trim()) {
      setGuardianFirstNameError("Ingresa tus nombres.");
      focusAndScrollToField("tutor-nombres");
      return;
    }
    setGuardianFirstNameError(null);

    if (!guardianLastName.trim()) {
      setGuardianLastNameError("Ingresa tus apellidos.");
      focusAndScrollToField("tutor-apellidos");
      return;
    }
    setGuardianLastNameError(null);

    if (!guardianBirthDate) {
      setGuardianBirthDateError("Ingresa tu fecha de nacimiento.");
      focusAndScrollToField("tutor-fecha-nacimiento");
      return;
    }
    if (calculateAge(guardianBirthDate) < MIN_GUARDIAN_AGE) {
      setGuardianBirthDateError(`Debes ser mayor de edad (${MIN_GUARDIAN_AGE} años o más) para registrarte como tutor.`);
      focusAndScrollToField("tutor-fecha-nacimiento");
      return;
    }
    setGuardianBirthDateError(null);

    if (!documentType) {
      setDocumentTypeError("Selecciona un tipo de documento.");
      focusAndScrollToField("tutor-tipo-documento");
      return;
    }
    setDocumentTypeError(null);

    if (!documentNumber.trim()) {
      setDocumentNumberError("Ingresa tu número de documento.");
      focusAndScrollToField("tutor-numero-documento");
      return;
    }
    setDocumentNumberError(null);

    if (!documentIssuedAt) {
      setDocumentIssuedAtError("Ingresa la fecha de expedición del documento de identificación.");
      focusAndScrollToField("tutor-fecha-expedicion-documento");
      return;
    }
    const documentIssuedAtValidationError = validateDocumentIssuedAt(documentIssuedAt, guardianBirthDate);
    if (documentIssuedAtValidationError) {
      setDocumentIssuedAtError(documentIssuedAtValidationError);
      focusAndScrollToField("tutor-fecha-expedicion-documento");
      return;
    }
    setDocumentIssuedAtError(null);

    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError("Ingresa un correo electrónico válido.");
      focusAndScrollToField("tutor-correo");
      return;
    }
    setEmailError(null);

    if (!phone || !isValidPhoneNumber(phone)) {
      setPhoneError("Ingresa un número telefónico válido.");
      focusAndScrollToField("tutor-telefono");
      return;
    }
    setPhoneError(null);

    if (!relationship) {
      setRelationshipError("Selecciona tu relación con el estudiante.");
      focusAndScrollToField("tutor-relacion");
      return;
    }
    setRelationshipError(null);

    if (!passwordMeetsRequirements(password)) {
      setPasswordError("Ingresa una contraseña que cumpla con todos los requisitos indicados abajo.");
      focusAndScrollToField("tutor-password");
      return;
    }
    setPasswordError(null);

    if (!passwordConfirmation) {
      setPasswordConfirmationError("Ingresa la confirmación de la contraseña.");
      focusAndScrollToField("tutor-password-confirmacion");
      return;
    }
    if (password !== passwordConfirmation) {
      setPasswordConfirmationError("Las contraseñas no coinciden.");
      focusAndScrollToField("tutor-password-confirmacion");
      return;
    }
    setPasswordConfirmationError(null);

    if (!acceptsDataProcessing) {
      setAcceptsDataProcessingError("El consentimiento de tratamiento de datos es obligatorio.");
      focusAndScrollToField("tutor-consentimiento");
      return;
    }
    setAcceptsDataProcessingError(null);

    if (!authorizesSupportCondition) {
      setAuthorizesSupportConditionError(
        "La autorización para compartir una condición o necesidad de apoyo es obligatoria.",
      );
      focusAndScrollToField("tutor-condicion-consentimiento");
      return;
    }
    setAuthorizesSupportConditionError(null);

    setStep(2);
  }

  /** Step indicator click. Going back needs no validation, going forward
   * triggers the step 1 form's real submit instead of duplicating it. */
  function handleStepIndicatorClick(target: 1 | 2) {
    if (target === step) return;
    if (target === 1) {
      setStep(1);
      setPhase("formulario");
      return;
    }
    step1FormRef.current?.requestSubmit();
  }

  function resetPin() {
    setPin("");
    setPinDraft("");
    setPinSubstep("ingresar");
  }

  function handleFirstPinEntry() {
    setPinError(null);
    setPin(pinDraft);
    setPinDraft("");
    setPinSubstep("confirmar");
  }

  function handleSecondPinEntry() {
    if (pinDraft === pin) {
      setPinDraft("");
      setPinSubstep("listo");
      setPinError(null);
    } else {
      setPinError("Los PIN no coinciden. Vuelve a intentarlo.");
      resetPin();
    }
  }

  function handleSubmitStep2(e: FormEvent) {
    e.preventDefault();

    if (!studentFirstName.trim()) {
      setStudentFirstNameError("Escribe el nombre de tu hijo o hija.");
      focusAndScrollToField("estudiante-nombres");
      return;
    }
    setStudentFirstNameError(null);

    if (!studentLastName.trim()) {
      setStudentLastNameError("Escribe el apellido de tu hijo o hija.");
      focusAndScrollToField("estudiante-apellidos");
      return;
    }
    setStudentLastNameError(null);

    if (!birthDate) {
      setStudentBirthDateError("Selecciona la fecha de nacimiento.");
      focusAndScrollToField("estudiante-fecha-nacimiento");
      return;
    }
    if (birthDate > TODAY_ISO) {
      setStudentBirthDateError("La fecha de nacimiento no puede ser una fecha futura.");
      focusAndScrollToField("estudiante-fecha-nacimiento");
      return;
    }
    setStudentBirthDateError(null);

    if (pinSubstep !== "listo") {
      setPinError("Define y confirma el PIN antes de continuar.");
      focusAndScrollToField("estudiante-pin-seccion");
      return;
    }
    setSubmitError(null);
    // Both forms are already complete and validated at this point. The
    // confirmation starts by showing the guardian's summary first, not
    // the child's, in the same order they were filled out.
    setStep(1);
    setPhase("confirmacion");
  }

  async function confirmAndCreateAccount() {
    setSubmitError(null);

    // The backend stores the calling code and the national number in two
    // separate columns (see identity-service's people.phone_country_code /
    // phone_number), rather than one combined E.164 string, so the country
    // never has to be re-derived by parsing a formatted string later. `phone`
    // was already confirmed valid by isValidPhoneNumber in handleSubmitStep1,
    // so parsing it back apart here is safe.
    const parsedPhone = parsePhoneNumber(phone);

    const payload: GuardianRegistrationRequest = {
      guardian: {
        first_name: guardianFirstName.trim(),
        last_name: guardianLastName.trim(),
        document_type_id: Number(documentType),
        document_number: documentNumber.trim(),
        date_of_birth: guardianBirthDate,
        document_issued_at: documentIssuedAt,
        email: email.trim(),
        phone_country_code: parsedPhone?.countryCallingCode ?? "",
        phone_number: parsedPhone?.nationalNumber ?? "",
        relationship_type_id: Number(relationship),
        password,
        password_confirmation: passwordConfirmation,
      },
      student: {
        first_name: studentFirstName.trim(),
        last_name: studentLastName.trim(),
        date_of_birth: birthDate,
        avatar,
        pin,
        pin_confirmation: pin,
        ...(supportCondition.trim() ? { support_condition: supportCondition.trim() } : {}),
      },
      consent: {
        policy_version: CONSENT_POLICY_VERSION,
        accepts_data_processing: acceptsDataProcessing,
        authorizes_support_condition: authorizesSupportCondition,
      },
    };

    try {
      const tokens = await register.mutateAsync(payload);
      setSession(tokens);
      guardarCorreoTutorReciente(email.trim());
      try {
        // The account (person, guardian, student and consent) already
        // exists. Calibration needs a student session, not this guardian
        // one, so we log straight into the profile we just created. The
        // PIN was set a moment ago in this same form, no need to make the
        // family type it again on a separate screen.
        const students = await apiFetch<StudentProfile[]>("/identity/guardians/me/students");
        const newStudent = students[0];
        const studentTokens = await loginPerfilEstudiante.mutateAsync({ student_id: newStudent.id, pin });
        setSession(studentTokens);
        navigate("/student/setup-conditions", { replace: true });
      } catch {
        // The account is safe either way. If the automatic handoff fails for
        // any reason, fall back to the manual path instead of showing an
        // error for something that isn't actually fatal.
        navigate("/login/student/profile", { replace: true });
      }
    } catch (err) {
      setSubmitError(getAuthErrorMessage(err));
    }
  }

  const guardianSummary: SummaryItem[] = [
    { label: "Nombres", value: guardianFirstName },
    { label: "Apellidos", value: guardianLastName },
    { label: "Fecha de nacimiento", value: formatDate(guardianBirthDate) },
    { label: "Tipo de documento", value: catalogLabel(documentTypesQuery.data, documentType) },
    { label: "Número de documento", value: documentNumber },
    { label: "Fecha de expedición del documento", value: formatDate(documentIssuedAt) },
    { label: "Correo electrónico", value: email },
    { label: "Teléfono", value: formatPhoneNumberIntl(phone) || phone },
    { label: "Relación con el estudiante", value: catalogLabel(relationshipTypesQuery.data, relationship) },
  ];

  const studentSummary: SummaryItem[] = [
    { label: "Nombres", value: studentFirstName },
    { label: "Apellidos", value: studentLastName },
    { label: "Fecha de nacimiento", value: formatDate(birthDate) },
    { label: "Condición o necesidad de apoyo", value: supportCondition.trim() || "No indicada" },
  ];

  return (
    <main className={styles.page}>
      <IrisMark size={420} className={`${styles.ring} ${styles.ringLarge}`} />
      <IrisMark size={150} className={`${styles.ring} ${styles.ringBottomLeft}`} />
      <IrisMark size={420} className={`${styles.ring} ${styles.ringTopLeft}`} />
      <IrisMark size={150} className={`${styles.ring} ${styles.ringTopRight}`} />
      <Link to="/login/adult" state={{ vista: "elegirRegistro" }} className={styles.back}>
        <IconArrowLeft /> Volver
      </Link>
      <div className={styles.card}>
        <h1 className={styles.title}>
          {phase === "confirmacion"
            ? step === 1
              ? "Confirmación: Tutor, papá o mamá"
              : "Confirmación: Tu niño o niña"
            : step === 1
              ? "Crear cuenta: Tutor, papá o mamá"
              : "Crear cuenta: Tu niño o niña"}
        </h1>
        {phase === "formulario" && (
          <ul className={styles.stepIndicators}>
            <li>
              <button
                type="button"
                className={`${styles.stepIndicator} ${step === 1 ? styles.stepIndicatorActive : ""}`}
                onClick={() => handleStepIndicatorClick(1)}
                aria-label="Ir al paso 1: datos del tutor, papá o mamá"
                aria-current={step === 1 ? "step" : undefined}
              />
            </li>
            <li>
              <button
                type="button"
                className={`${styles.stepIndicator} ${step === 2 ? styles.stepIndicatorActive : ""}`}
                onClick={() => handleStepIndicatorClick(2)}
                aria-label="Ir al paso 2: datos del estudiante"
                aria-current={step === 2 ? "step" : undefined}
              />
            </li>
          </ul>
        )}

        {step === 1 && phase === "formulario" && (
          // noValidate: without it, the browser's own required-field check
          // blocks the submit event before it ever reaches handleSubmitStep1,
          // so our error messages and scroll-into-view never run, the browser
          // shows its own mismatched tooltip instead.
          <form
            ref={step1FormRef}
            className={styles.form}
            onSubmit={handleSubmitStep1}
            aria-label="Datos del tutor, paso 1 de 2"
            noValidate
          >
            <div className={styles.notice}>
              <IconInfo className={styles.noticeIcon} />
              <div>
                <p className={styles.noticeHeading}>Indicaciones iniciales:</p>
                <p className={styles.noticeText}>
                  En este apartado se realizará el registro de tu cuenta dentro de IRIS, por lo que
                  es importante que tengas a la mano tus datos personales. Además, como parte de
                  este registro, en el paso 2 será necesario inscribir a tu hijo o hija (o al menor
                  a tu cargo), así que ten también sus datos listos para registrarlo dentro de IRIS.
                </p>
              </div>
            </div>
            <p className={styles.subtitle}>Paso 1 de 2 — Datos de quien acompaña al estudiante (Tutor, papá o mamá).</p>
            <TextField
              id="tutor-nombres"
              label="Nombres"
              value={guardianFirstName}
              onChange={(value) => {
                setGuardianFirstName(value);
                setGuardianFirstNameError(null);
              }}
              error={guardianFirstNameError ?? undefined}
              required
              autoComplete="given-name"
            />
            <TextField
              id="tutor-apellidos"
              label="Apellidos"
              value={guardianLastName}
              onChange={(value) => {
                setGuardianLastName(value);
                setGuardianLastNameError(null);
              }}
              error={guardianLastNameError ?? undefined}
              required
              autoComplete="family-name"
            />
            <TextField
              id="tutor-fecha-nacimiento"
              label="Fecha de nacimiento"
              type="date"
              value={guardianBirthDate}
              onChange={(value) => {
                setGuardianBirthDate(value);
                setGuardianBirthDateError(null);
                // The issued-date field's own lower bound just moved. An
                // already-typed issued date that was valid a moment ago can
                // now sit before the new birth date, so it needs re-checking
                // right here, not left to linger until the form is submitted.
                setDocumentIssuedAtError(validateDocumentIssuedAt(documentIssuedAt, value));
              }}
              error={guardianBirthDateError ?? undefined}
              required
              max={TODAY_ISO}
            />
            <SelectField
              id="tutor-tipo-documento"
              label="Tipo de documento"
              value={documentType}
              onChange={(value) => {
                setDocumentType(value);
                setDocumentTypeError(null);
              }}
              options={(documentTypesQuery.data ?? []).map((dt) => ({ value: String(dt.id), label: dt.name }))}
              error={documentTypeError ?? undefined}
              required
              disabled={documentTypesQuery.isLoading}
            />
            <TextField
              id="tutor-numero-documento"
              label="Número de documento"
              value={documentNumber}
              onChange={(value) => {
                setDocumentNumber(value.replace(/\D/g, ""));
                setDocumentNumberError(null);
              }}
              error={documentNumberError ?? undefined}
              required
              inputMode="numeric"
            />
            <TextField
              id="tutor-fecha-expedicion-documento"
              label="Fecha de expedición del documento"
              type="date"
              value={documentIssuedAt}
              onChange={(value) => {
                setDocumentIssuedAt(value);
                // Validated immediately, not only on submit, since a date
                // typed on the keyboard skips the native picker's min/max
                // enforcement entirely.
                setDocumentIssuedAtError(validateDocumentIssuedAt(value, guardianBirthDate));
              }}
              error={documentIssuedAtError ?? undefined}
              required
              min={guardianBirthDate || undefined}
              max={TODAY_ISO}
            />
            <TextField
              id="tutor-correo"
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                setEmailError(null);
              }}
              error={emailError ?? undefined}
              required
              autoComplete="email"
            />
            <PhoneField
              id="tutor-telefono"
              label="Teléfono"
              value={phone}
              onChange={(value) => {
                setPhone(value);
                setPhoneError(null);
              }}
              error={phoneError ?? undefined}
              required
            />
            <SelectField
              id="tutor-relacion"
              label="Relación con el estudiante"
              value={relationship}
              onChange={(value) => {
                setRelationship(value);
                setRelationshipError(null);
              }}
              options={(relationshipTypesQuery.data ?? []).map((rt) => ({ value: String(rt.id), label: rt.name }))}
              error={relationshipError ?? undefined}
              required
              disabled={relationshipTypesQuery.isLoading}
            />
            <TextField
              id="tutor-password"
              label="Contraseña"
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setPasswordError(null);
                // A stale "no coinciden" belongs to the previous password,
                // not this new one.
                setPasswordConfirmationError(null);
              }}
              error={passwordError ?? undefined}
              required
              autoComplete="new-password"
            />
            <PasswordRequirements password={password} />
            <TextField
              id="tutor-password-confirmacion"
              label="Confirmar contraseña"
              type="password"
              value={passwordConfirmation}
              onChange={(value) => {
                setPasswordConfirmation(value);
                setPasswordConfirmationError(null);
              }}
              error={passwordConfirmationError ?? undefined}
              required
              autoComplete="new-password"
            />
            <CheckboxField
              id="tutor-consentimiento"
              checked={acceptsDataProcessing}
              onChange={(checked) => {
                setAcceptsDataProcessing(checked);
                setAcceptsDataProcessingError(null);
              }}
              error={acceptsDataProcessingError ?? undefined}
              required
            >
              Acepto el tratamiento de mis datos y los de mi hijo/a para el uso de IRIS, conforme a nuestro{" "}
              <a href="/legal-notice" target="_blank" rel="noopener noreferrer">
                Aviso Legal
              </a>{" "}
              y{" "}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
                Política de Privacidad
              </a>
              .
            </CheckboxField>
            <CheckboxField
              id="tutor-condicion-consentimiento"
              checked={authorizesSupportCondition}
              onChange={(checked) => {
                setAuthorizesSupportCondition(checked);
                setAuthorizesSupportConditionError(null);
              }}
              error={authorizesSupportConditionError ?? undefined}
              required
            >
              Autorizo compartir con el docente una condición o necesidad de apoyo del estudiante, en caso de
              indicarla, hacerlo es opcional y queda a tu criterio, conforme a nuestro{" "}
              <a href="/legal-notice" target="_blank" rel="noopener noreferrer">
                Aviso Legal
              </a>{" "}
              y{" "}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
                Política de Privacidad
              </a>
              .
            </CheckboxField>
            {catalogsFailed && (
              <p role="alert" className={styles.error}>
                No pudimos cargar los tipos de documento y relación. Verifica tu conexión e intenta de nuevo.
              </p>
            )}
            <div className={styles.buttonRow}>
              <span />
              <button type="submit" className={styles.primaryButton} disabled={!catalogsReady}>
                {catalogsReady ? "Siguiente" : "Cargando…"}
              </button>
            </div>
          </form>
        )}

        {step === 1 && phase === "confirmacion" && (
          <ConfirmationScreen
            greeting={
              <>
                ¡Hola <strong>{guardianFirstName}</strong>! Gracias por tomarte el tiempo de completar tus datos. Significa
                mucho que quieras hacer parte de la comunidad IRIS.
              </>
            }
            items={guardianSummary}
            onEdit={() => setPhase("formulario")}
            onConfirm={() => {
              setStep(2);
              setPhase("confirmacion");
            }}
            confirmLabel="Confirmar y continuar"
          />
        )}

        {step === 2 && phase === "formulario" && (
          // noValidate: same reason as the step 1 form above.
          <form
            className={styles.form}
            onSubmit={handleSubmitStep2}
            aria-label="Datos del estudiante, paso 2 de 2"
            noValidate
          >
            <p className={styles.subtitle}>Paso 2 de 2 — Perfil de estudiante.</p>
            <TextField
              id="estudiante-nombres"
              label="Nombres"
              value={studentFirstName}
              onChange={(value) => {
                setStudentFirstName(value);
                setStudentFirstNameError(null);
              }}
              error={studentFirstNameError ?? undefined}
              required
              autoComplete="off"
            />
            <TextField
              id="estudiante-apellidos"
              label="Apellidos"
              value={studentLastName}
              onChange={(value) => {
                setStudentLastName(value);
                setStudentLastNameError(null);
              }}
              error={studentLastNameError ?? undefined}
              required
              autoComplete="off"
            />
            <TextField
              id="estudiante-fecha-nacimiento"
              label="Fecha de nacimiento"
              type="date"
              value={birthDate}
              onChange={(value) => {
                setBirthDate(value);
                setStudentBirthDateError(null);
              }}
              error={studentBirthDateError ?? undefined}
              required
              max={TODAY_ISO}
            />
            <TextField
              id="estudiante-condicion-apoyo"
              label="Condición o necesidad de apoyo (opcional)"
              value={supportCondition}
              onChange={setSupportCondition}
              multiline
              placeholder="Ej.: le cuesta sostener el mouse, necesita más tiempo para las actividades…"
            />

            <p id="estudiante-pin-seccion" className={styles.notice}>
              <IconInfo className={styles.noticeIcon} />
              Este PIN lo usará tu hijo o hija para ingresar a su propio perfil dentro de IRIS.
            </p>
            {pinSubstep === "listo" ? (
              <div className={styles.pinReady}>
                <p className={styles.pinReadyText}>
                  <IconCheck className={styles.checkIcon} />
                  PIN confirmado
                </p>
                <button type="button" className={styles.textLink} onClick={resetPin}>
                  Cambiar PIN
                </button>
              </div>
            ) : (
              <div className={styles.pinSection}>
                <p className={styles.subtitle}>
                  {pinSubstep === "ingresar" ? "Define un PIN de 4 a 6 dígitos" : "Vuelve a escribir el mismo PIN"}
                </p>
                <NumericKeypad
                  value={pinDraft}
                  onChange={setPinDraft}
                  onConfirm={pinSubstep === "ingresar" ? handleFirstPinEntry : handleSecondPinEntry}
                  maxLength={pinSubstep === "confirmar" ? pin.length : 6}
                  minLength={pinSubstep === "confirmar" ? pin.length : 4}
                  mask
                  compact
                />
              </div>
            )}
            {pinError && (
              <p role="alert" className={styles.error}>
                {pinError}
              </p>
            )}

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setStep(1);
                  setPhase("formulario");
                }}
              >
                Atrás
              </button>
              <button type="submit" className={styles.primaryButton}>
                Siguiente
              </button>
            </div>
          </form>
        )}

        {step === 2 && phase === "confirmacion" && (
          <ConfirmationScreen
            greeting={
              <>
                Ahora vamos a revisar los datos de tu peque. Esperamos que <strong>{studentFirstName}</strong> esté
                muy emocionado o emocionada por formar parte de la comunidad IRIS.
              </>
            }
            items={studentSummary}
            onEdit={() => setPhase("formulario")}
            onConfirm={confirmAndCreateAccount}
            loading={register.isPending}
            confirmLabel="Crear cuenta"
            error={submitError}
          />
        )}
      </div>
    </main>
  );
}
