import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatPhoneNumberIntl, isValidPhoneNumber, parsePhoneNumber } from "react-phone-number-input";
import type { GuardianRegistrationRequest } from "@iris/shared-types";
import { useAuth } from "@/shared/auth/AuthContext";
import { guardarCorreoTutorReciente } from "@/shared/auth/tokenStorage";
import {
  useRegistrarTutor,
  useDocumentTypes,
  useRelationshipTypes,
  useSupportConditions,
  useAvatars,
} from "@/shared/api/hooks/useAuthApi";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { TextField } from "@/features/auth/ui/TextField";
import { PhoneField } from "@/features/auth/ui/PhoneField";
import { PasswordRequirements, passwordMeetsRequirements } from "@/features/auth/ui/PasswordRequirements";
import {
  DOCUMENT_TYPE_NAME_PASSPORT,
  documentNumberFormatError,
  filterDocumentNumberInput,
} from "@/features/auth/lib/documentNumber";
import { SelectField } from "@/features/auth/ui/SelectField";
import fieldStyles from "@/features/auth/ui/Fields.module.css";
import { CheckboxField } from "@/features/auth/ui/CheckboxField";
import { NumericKeypad } from "@/shared/ui/NumericKeypad";
import { IrisMark } from "@/shared/ui/IrisMark";
import { IconCheck, IconArrowLeft, IconInfo, IconLock } from "@/shared/ui/icons";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";
import { RegistrationSuccessScreen } from "./RegistrationSuccessScreen";
import { TotpSetupScreen } from "./TotpSetupScreen";
import { TotpSuccessScreen } from "./TotpSuccessScreen";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./GuardianRegistrationWizard.module.css";

const CONSENT_POLICY_VERSION = "1.0";
const MIN_GUARDIAN_AGE = 18;
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Matched by name, not a hardcoded id: the catalog lives in identity-service's
// database (see its migration 0004), so ids are only stable in practice, not
// guaranteed. Mirrors app/domain/entities.py's SUPPORT_CONDITION_NAME_OTHER.
const SUPPORT_CONDITION_NAME_OTHER = "Otra condición (especificar)";

type PinSubstep = "ingresar" | "confirmar" | "listo";
type Phase = "formulario" | "confirmacion";

/** Runs after both confirmations pass and "Crear cuenta" is pressed, on top
 * of (not instead of) the step/phase state above: "idle" leaves the wizard's
 * own step 2 confirmation on screen, "cargando" and "exito" each replace the
 * whole page. Kept separate from `phase` because it isn't a step of the
 * form — there's nothing to correct or go back to once the account exists. */
type PostSubmitPhase = "idle" | "cargando" | "exito" | "totp-setup" | "totp-exito";

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
  stepLabel,
  greeting,
  avatarPreview,
  items,
  onEdit,
  onConfirm,
  loading = false,
  confirmLabel = "Confirmar",
  error,
}: {
  stepLabel: string;
  greeting: ReactNode;
  /** Shown as a picture, not a summary row: a text label like "Violeta"
   * means nothing to the family compared to just seeing the avatar itself. */
  avatarPreview?: ReactNode;
  items: SummaryItem[];
  onEdit: () => void;
  onConfirm: () => void;
  loading?: boolean;
  confirmLabel?: string;
  error?: string | null;
}) {
  return (
    <div className={styles.confirmation}>
      <p className={styles.subtitle}>{stepLabel}</p>
      <div className={styles.mascotRow}>
        <img src={logoIris} alt="" className={styles.mascotLogo} />
        <div className={styles.bubble}>
          <p>{greeting}</p>
        </div>
      </div>

      {avatarPreview && <div className={styles.avatarPreviewRow}>{avatarPreview}</div>}

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

/** This is `/login/guardian/new`, a 2-step wizard. First the guardian's
 * data and consent, then the first student profile with the PIN typed
 * twice. Each step shows a confirmation screen with the IRIS mascot
 * before moving on. Confirming step 2 makes `identity-service` create the
 * person, guardian, student and consent all together, and logs the
 * guardian into their own session. From there the wizard walks them
 * through setting up 2FA (TotpSetupScreen) before handing off to
 * `/guardian/portal` — reaching the student's own session from there
 * always goes through `/login/student/profile`, which asks for the PIN
 * again rather than reusing the one just typed in this form, the same
 * check any other guardian login has to pass. */
export default function GuardianRegistrationWizard() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const register = useRegistrarTutor();
  const documentTypesQuery = useDocumentTypes();
  const relationshipTypesQuery = useRelationshipTypes();
  const supportConditionsQuery = useSupportConditions();
  const avatarsQuery = useAvatars();

  const [step, setStep] = useState<1 | 2>(1);
  const [phase, setPhase] = useState<Phase>("formulario");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [postSubmitPhase, setPostSubmitPhase] = useState<PostSubmitPhase>("idle");
  const step1FormRef = useRef<HTMLFormElement>(null);

  // This wizard moves between its 4 screens (both forms, both confirmations)
  // through step/phase state on one single route, never a real navigation,
  // so AppRouter's own ScrollToTop (which only resets on pathname change)
  // never fires here. Without this, clicking "Siguiente" from the bottom of
  // a long form — e.g. after scrolling all the way down to confirm the PIN —
  // leaves the next screen scrolled to that same position instead of
  // starting at its own top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step, phase, postSubmitPhase]);

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
  const [avatarId, setAvatarId] = useState<string>("");
  const [supportConditionId, setSupportConditionId] = useState("");
  const [supportConditionOther, setSupportConditionOther] = useState("");
  const [additionalSupportNeed, setAdditionalSupportNeed] = useState("");
  const [pinSubstep, setPinSubstep] = useState<PinSubstep>("ingresar");
  const [pin, setPin] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [studentFirstNameError, setStudentFirstNameError] = useState<string | null>(null);
  const [studentLastNameError, setStudentLastNameError] = useState<string | null>(null);
  const [studentBirthDateError, setStudentBirthDateError] = useState<string | null>(null);
  const [supportConditionError, setSupportConditionError] = useState<string | null>(null);
  const [supportConditionOtherError, setSupportConditionOtherError] = useState<string | null>(null);

  // Default to the first avatar once the catalog loads, same reasoning as
  // document type/relationship in step 1: unlike the support condition
  // below, there's no "safe-looking default" concern here, any avatar is a
  // fine starting point and the tutor can simply pick a different one.
  useEffect(() => {
    if (avatarId === "" && avatarsQuery.data && avatarsQuery.data.length > 0) {
      setAvatarId(String(avatarsQuery.data[0].id));
    }
  }, [avatarId, avatarsQuery.data]);

  // Deliberately left unselected (see the placeholder option in the
  // SelectField below): unlike document type/relationship above, silently
  // defaulting this to any real entry — even "Prefiero no especificar" —
  // would let a family move on without ever having actually looked at the
  // list. It has to be a conscious choice, checked when moving forward
  // (handleSubmitStep2) — going back never checks it, see handleGoBackToStep1.
  const selectedSupportCondition = supportConditionsQuery.data?.find(
    (condition) => String(condition.id) === supportConditionId,
  );
  const isOtherConditionSelected = selectedSupportCondition?.name === SUPPORT_CONDITION_NAME_OTHER;

  const selectedDocumentType = documentTypesQuery.data?.find((dt) => String(dt.id) === documentType);

  const catalogsReady = documentType !== "" && relationship !== "";
  const catalogsFailed = documentTypesQuery.isError || relationshipTypesQuery.isError;
  const supportConditionsFailed = supportConditionsQuery.isError;
  const avatarsFailed = avatarsQuery.isError;

  /** Used by handleSubmitStep2, when moving forward: the support condition
   * select can't be left on its placeholder, and "Otra condición" can't be
   * left unspecified. Going backward (handleGoBackToStep1) never runs this —
   * "Atrás" always has to work, regardless of what's still missing here. */
  function validateSupportConditionBeforeLeaving(): boolean {
    if (!selectedSupportCondition) {
      setSupportConditionError("Selecciona la condición correspondiente a tu hijo o hija.");
      focusAndScrollToField("estudiante-condicion");
      return false;
    }
    setSupportConditionError(null);

    if (isOtherConditionSelected && !supportConditionOther.trim()) {
      setSupportConditionOtherError("Especifica la condición de tu hijo o hija.");
      focusAndScrollToField("estudiante-condicion-otra");
      return false;
    }
    setSupportConditionOtherError(null);
    return true;
  }

  function handleGoBackToStep1() {
    setStep(1);
    setPhase("formulario");
  }

  /** Switching away from "Otra condición (especificar)" clears whatever was
   * typed into its text field, so it can never be submitted alongside a
   * different, unrelated condition. */
  function handleSupportConditionChange(nextId: string) {
    setSupportConditionId(nextId);
    setSupportConditionError(null);
    const nextCondition = supportConditionsQuery.data?.find((condition) => String(condition.id) === nextId);
    if (nextCondition?.name !== SUPPORT_CONDITION_NAME_OTHER) {
      setSupportConditionOther("");
      setSupportConditionOtherError(null);
    }
  }

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
    const documentNumberValidationError = documentNumberFormatError(selectedDocumentType?.name, documentNumber);
    if (documentNumberValidationError) {
      setDocumentNumberError(documentNumberValidationError);
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

    setStep(2);
  }

  /** Step indicator click. Going back always works, same as the "Atrás"
   * button. Going forward triggers the step 1 form's real submit instead of
   * duplicating its validation here. */
  function handleStepIndicatorClick(target: 1 | 2) {
    if (target === step) return;
    if (target === 1) {
      handleGoBackToStep1();
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
      setStudentFirstNameError("Ingresa los nombres de tu hijo o hija.");
      focusAndScrollToField("estudiante-nombres");
      return;
    }
    setStudentFirstNameError(null);

    if (!studentLastName.trim()) {
      setStudentLastNameError("Ingresa los apellidos de tu hijo o hija.");
      focusAndScrollToField("estudiante-apellidos");
      return;
    }
    setStudentLastNameError(null);

    if (!birthDate) {
      setStudentBirthDateError("Ingresa la fecha de nacimiento de tu hijo o hija.");
      focusAndScrollToField("estudiante-fecha-nacimiento");
      return;
    }
    if (birthDate > TODAY_ISO) {
      setStudentBirthDateError("La fecha de nacimiento no puede ser una fecha futura.");
      focusAndScrollToField("estudiante-fecha-nacimiento");
      return;
    }
    setStudentBirthDateError(null);

    if (!validateSupportConditionBeforeLeaving()) return;

    if (!authorizesSupportCondition) {
      setAuthorizesSupportConditionError(
        "La autorización para compartir una condición o necesidad de apoyo es obligatoria.",
      );
      focusAndScrollToField("estudiante-condicion-consentimiento");
      return;
    }
    setAuthorizesSupportConditionError(null);

    if (!acceptsDataProcessing) {
      setAcceptsDataProcessingError("El consentimiento de tratamiento de datos es obligatorio.");
      focusAndScrollToField("estudiante-consentimiento");
      return;
    }
    setAcceptsDataProcessingError(null);

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
    setPostSubmitPhase("cargando");

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
        avatar_id: Number(avatarId),
        pin,
        pin_confirmation: pin,
        support_condition_id: Number(supportConditionId),
        ...(isOtherConditionSelected ? { support_condition_other: supportConditionOther.trim() } : {}),
        ...(additionalSupportNeed.trim() ? { additional_support_need: additionalSupportNeed.trim() } : {}),
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
      // The account (person, guardian, student and consent) already exists
      // at this point — everything after this is a celebration + hand-off,
      // never something that can undo the registration that just succeeded.
      setPostSubmitPhase("exito");
    } catch (err) {
      setSubmitError(getAuthErrorMessage(err));
      setPostSubmitPhase("idle");
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

  const supportConditionSummaryValue =
    selectedSupportCondition &&
    (isOtherConditionSelected
      ? `${selectedSupportCondition.name}: ${supportConditionOther.trim()}`
      : selectedSupportCondition.name);

  const studentSummary: SummaryItem[] = [
    { label: "Nombres", value: studentFirstName },
    { label: "Apellidos", value: studentLastName },
    { label: "Fecha de nacimiento", value: formatDate(birthDate) },
    { label: "Condición", value: supportConditionSummaryValue ?? "" },
    { label: "Necesidad de apoyo adicional", value: additionalSupportNeed.trim() || "No indicada" },
  ];

  // Replaces the whole wizard once "Crear cuenta" succeeds: there's nothing
  // left to correct or navigate back to at this point (see
  // confirmAndCreateAccount above), so this isn't rendered as just another
  // step/phase branch alongside the form below.
  if (postSubmitPhase === "cargando") {
    return <LoadingScreen message="Creando tu cuenta" />;
  }
  if (postSubmitPhase === "exito") {
    return (
      <RegistrationSuccessScreen
        guardianFirstName={guardianFirstName.trim()}
        studentFirstName={studentFirstName.trim()}
        onContinue={() => setPostSubmitPhase("totp-setup")}
      />
    );
  }
  if (postSubmitPhase === "totp-setup") {
    return <TotpSetupScreen onVerified={() => setPostSubmitPhase("totp-exito")} />;
  }
  if (postSubmitPhase === "totp-exito") {
    return (
      <TotpSuccessScreen
        guardianFirstName={guardianFirstName.trim()}
        onContinue={() => navigate("/guardian/portal", { replace: true })}
      />
    );
  }

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
            aria-label="Datos del tutor, paso 1 de 4"
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
                <p className={styles.noticeText}>
                  En total son 4 pasos: los dos primeros para ingresar tus datos y los de tu hijo o
                  hija, y los dos últimos para confirmar que todos los datos estén correctos antes de
                  crear la cuenta.
                </p>
              </div>
            </div>
            <div className={styles.notice}>
              <IconLock className={styles.noticeIcon} />
              <div>
                <p className={styles.noticeHeading}>Seguridad de tu cuenta:</p>
                <p className={styles.noticeText}>
                  Para proteger el acceso al Portal de Padres, IRIS usa autenticación de dos factores
                  (2FA) mediante una aplicación autenticadora (basada en TOTP), además de tu
                  contraseña.
                </p>
                <p className={styles.noticeText}>
                  Te recomendamos tener instalada en tu celular una aplicación como Google
                  Authenticator, Microsoft Authenticator o Authy, ya que la necesitarás para activar
                  esta protección.
                </p>
              </div>
            </div>
            <p className={styles.subtitle}>Paso 1 de 4 — Datos de quien acompaña al estudiante (Tutor, papá o mamá).</p>
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
                // Switching type can turn a value that was fine a moment ago
                // into an invalid one (e.g. a passport's letters, once you
                // switch to cédula), so it's re-checked against the new
                // type right away instead of waiting for the next keystroke
                // or the next attempt to leave this screen.
                const nextDocumentType = documentTypesQuery.data?.find((dt) => String(dt.id) === value);
                setDocumentNumberError(documentNumberFormatError(nextDocumentType?.name, documentNumber));
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
                const filtered = filterDocumentNumberInput(selectedDocumentType?.name, value);
                setDocumentNumber(filtered);
                setDocumentNumberError(documentNumberFormatError(selectedDocumentType?.name, filtered));
              }}
              error={documentNumberError ?? undefined}
              required
              inputMode={selectedDocumentType?.name === DOCUMENT_TYPE_NAME_PASSPORT ? "text" : "numeric"}
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
            stepLabel="Paso 3 de 4 — Confirmación: Tutor, papá o mamá."
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
            aria-label="Datos del estudiante, paso 2 de 4"
            noValidate
          >
            <div className={styles.notice}>
              <IconInfo className={styles.noticeIcon} />
              <div>
                <p className={styles.noticeHeading}>Indicaciones de esta sección:</p>
                <p className={styles.noticeText}>
                  Aquí vas a completar los datos de tu hijo o hija (o del menor a tu cargo): su
                  nombre, apellidos y fecha de nacimiento. También vas a seleccionar una condición
                  de una lista (puedes elegir "Prefiero no especificar" si prefieres no indicarla)
                  y, si quieres, agregar alguna necesidad de apoyo adicional que sea importante que
                  el docente conozca. Además, vas a elegir su avatar. Por último, vas a definir el
                  PIN con el que podrá ingresar a su propio perfil dentro de IRIS.
                </p>
              </div>
            </div>
            <p className={styles.subtitle}>Paso 2 de 4 — Perfil de estudiante.</p>
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
            <div className={fieldStyles.field}>
              <label className={fieldStyles.label} id="estudiante-avatar-label">
                Avatar de tu hijo o hija
              </label>
              <div className={styles.avatarGrid} role="radiogroup" aria-labelledby="estudiante-avatar-label">
                {(avatarsQuery.data ?? []).map((option) => {
                  const isSelected = avatarId === String(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={option.name}
                      className={`${styles.avatarOption} ${isSelected ? styles.avatarOptionSelected : ""}`}
                      onClick={() => setAvatarId(String(option.id))}
                    >
                      <StudentAvatarImage avatarId={option.id} size="large" label={option.name} />
                    </button>
                  );
                })}
              </div>
              {avatarsFailed && (
                <p role="alert" className={styles.error}>
                  No pudimos cargar los avatares. Verifica tu conexión e intenta de nuevo.
                </p>
              )}
            </div>
            <SelectField
              id="estudiante-condicion"
              label="Condición"
              value={supportConditionId}
              onChange={handleSupportConditionChange}
              options={[
                { value: "", label: "-- Selecciona una opción --" },
                ...(supportConditionsQuery.data ?? []).map((condition) => ({
                  value: String(condition.id),
                  label: condition.name,
                })),
              ]}
              error={supportConditionError ?? undefined}
              required
              disabled={supportConditionsQuery.isLoading}
            />
            {isOtherConditionSelected && (
              <TextField
                id="estudiante-condicion-otra"
                label="Especifica la condición"
                value={supportConditionOther}
                onChange={(value) => {
                  setSupportConditionOther(value);
                  setSupportConditionOtherError(null);
                }}
                error={supportConditionOtherError ?? undefined}
                required
                multiline
              />
            )}
            <TextField
              id="estudiante-necesidad-apoyo-adicional"
              label="Necesidad de apoyo adicional (opcional)"
              value={additionalSupportNeed}
              onChange={setAdditionalSupportNeed}
              multiline
              placeholder="Ej.: le cuesta sostener el mouse, necesita más tiempo para las actividades…"
            />
            <CheckboxField
              id="estudiante-condicion-consentimiento"
              checked={authorizesSupportCondition}
              onChange={(checked) => {
                setAuthorizesSupportCondition(checked);
                setAuthorizesSupportConditionError(null);
              }}
              error={authorizesSupportConditionError ?? undefined}
              required
            >
              Autorizo compartir con el docente la condición y la necesidad de apoyo adicional de mi
              hijo o hija indicadas en este registro, conforme a nuestro{" "}
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
              id="estudiante-consentimiento"
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
                  {pinSubstep === "ingresar" ? "Define un PIN de 4 dígitos" : "Vuelve a escribir el mismo PIN"}
                </p>
                <NumericKeypad
                  value={pinDraft}
                  onChange={setPinDraft}
                  onConfirm={pinSubstep === "ingresar" ? handleFirstPinEntry : handleSecondPinEntry}
                  maxLength={4}
                  minLength={4}
                  mask
                  compact
                  numericFont="body"
                />
              </div>
            )}
            {pinError && (
              <p role="alert" className={styles.error}>
                {pinError}
              </p>
            )}
            {supportConditionsFailed && (
              <p role="alert" className={styles.error}>
                No pudimos cargar el catálogo de condiciones. Verifica tu conexión e intenta de nuevo.
              </p>
            )}

            <div className={styles.buttonRow}>
              <button type="button" className={styles.secondaryButton} onClick={handleGoBackToStep1}>
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
            stepLabel="Paso 4 de 4 — Confirmación: Tu niño o niña."
            greeting={
              <>
                Ahora vamos a revisar los datos de tu peque. Esperamos que <strong>{studentFirstName}</strong> esté
                muy emocionado o emocionada por formar parte de la comunidad IRIS.
              </>
            }
            avatarPreview={
              avatarId && <StudentAvatarImage avatarId={Number(avatarId)} size="large" label="Avatar elegido" />
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
