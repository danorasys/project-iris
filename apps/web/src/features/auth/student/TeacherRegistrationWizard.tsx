import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
    formatPhoneNumberIntl,
    isValidPhoneNumber,
    parsePhoneNumber,
} from "react-phone-number-input"
import type { TeacherRegistrationRequest } from "@iris/shared-types"
import { useAuth } from "@/shared/auth/AuthContext"
import {
    useDocumentTypes,
    useRegistrarDocente,
} from "@/shared/api/hooks/useAuthApi"
import { getAuthErrorMessage } from "@/features/auth/errors"
import { TextField } from "@/features/auth/ui/TextField"
import { SelectField } from "@/features/auth/ui/SelectField"
import { PhoneField } from "@/features/auth/ui/PhoneField"
import { CheckboxField } from "@/features/auth/ui/CheckboxField"
import {
    PasswordRequirements,
    passwordMeetsRequirements,
} from "@/features/auth/ui/PasswordRequirements"
import {
    DOCUMENT_TYPE_NAME_PASSPORT,
    documentNumberFormatError,
    filterDocumentNumberInput,
} from "@/features/auth/lib/documentNumber"
import { TeacherProfileFields } from "@/features/teacher/profile/TeacherProfileFields"
import { TeacherProfileSummary } from "@/features/teacher/profile/TeacherProfileSummary"
import {
    emptyProfileDraft,
    firstOpenEntry,
    isDraftEmpty,
    OPEN_ENTRY_MESSAGE,
    profileDraftErrors,
    profileFromDraft,
    type ProfileDraft,
} from "@/features/teacher/profile/teacherProfileDraft"
import { IrisMark } from "@/shared/ui/IrisMark"
import { IconArrowLeft, IconInfo, IconLock } from "@/shared/ui/icons"
import { LoadingScreen } from "@/shared/ui/LoadingScreen"
import { calculateAge } from "@/features/utils/calculateAge"
import { MAX_AGE, nameError } from "@/features/utils/personValidation"
import { formatDate } from "@/features/utils/formatDate"
import { validateDocumentIssuedAt } from "@/features/utils/validateDocumentIssuedAt"
import { PRIVACY_POLICY_VERSION } from "@/features/legal/policyVersion"
import { RegistrationConfirmation, type SummaryItem } from "./RegistrationConfirmation"
import { RegistrationSuccessScreen } from "./RegistrationSuccessScreen"
import { TotpSetupScreen } from "./TotpSetupScreen"
import { TotpSuccessScreen } from "./TotpSuccessScreen"
import styles from "./GuardianRegistrationWizard.module.css"

const MINIMUM_TEACHER_AGE = 18
const TODAY_ISO = new Date().toISOString().slice(0, 10)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROFILE_ID_PREFIX = "docente-perfil"

// After "cargando" the account exists: the teacher sets up their 2FA
// ("totp") and sees it done ("totp-listo") before going to the panel.
type Phase =
    | "formulario"
    | "perfil"
    | "confirmacion"
    | "cargando"
    | "exito"
    | "totp"
    | "totp-listo"
type Field =
    | "firstName"
    | "lastName"
    | "dateOfBirth"
    | "documentType"
    | "documentNumber"
    | "documentIssuedAt"
    | "email"
    | "phone"
    | "password"
    | "passwordConfirmation"
    | "acceptsDataProcessing"

/** Same as in the guardian's wizard: the window is scrolled by hand, so the
 * page's clipped root (`overflow: hidden`, for the rings) never scrolls
 * instead. See GuardianRegistrationWizard for the long story. */
function focusAndScrollToField(fieldId: string): void {
    const field = document.getElementById(fieldId)
    if (!field) return
    field.focus({ preventScroll: true })
    const rect = field.getBoundingClientRect()
    const targetTop =
        rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" })
}

/** `/login/teacher/new`. Looks and checks the same as the guardian's
 * registration: two forms (personal data, and the teacher's profile, which
 * is optional) and a confirmation with the IRIS mascot before creating the
 * account. Right after, the teacher sets up their 2FA, like the guardian. */
export default function TeacherRegistrationWizard() {
    const navigate = useNavigate()
    const { setSession } = useAuth()
    const register = useRegistrarDocente()
    const documentTypesQuery = useDocumentTypes()
    const step1FormRef = useRef<HTMLFormElement>(null)

    const [phase, setPhase] = useState<Phase>("formulario")
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [dateOfBirth, setDateOfBirth] = useState("")
    const [documentType, setDocumentType] = useState("")
    const [documentNumber, setDocumentNumber] = useState("")
    const [documentIssuedAt, setDocumentIssuedAt] = useState("")
    const [email, setEmail] = useState("")
    // E.164, like "+573001234567", what the country-flag picker gives.
    const [phone, setPhone] = useState("")
    const [institution, setInstitution] = useState("")
    const [password, setPassword] = useState("")
    const [passwordConfirmation, setPasswordConfirmation] = useState("")
    const [acceptsDataProcessing, setAcceptsDataProcessing] = useState(false)
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
    const [profileDraft, setProfileDraft] = useState<ProfileDraft>(
        emptyProfileDraft,
    )
    const [profileErrors, setProfileErrors] = useState<Record<string, string>>(
        {},
    )
    // False when the teacher left the profile empty.
    const [includeProfile, setIncludeProfile] = useState(false)
    // Set when the teacher tried to leave the profile step with a card open.
    const [openCardNotice, setOpenCardNotice] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    // Every screen starts at its own top, the wizard never changes route.
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [phase])

    useEffect(() => {
        if (!documentType && documentTypesQuery.data?.length)
            setDocumentType(String(documentTypesQuery.data[0].id))
    }, [documentType, documentTypesQuery.data])

    const selectedDocumentType = documentTypesQuery.data?.find(
        (item) => String(item.id) === documentType,
    )
    const catalogsReady = documentType !== ""

    function setError(field: Field, message: string | null) {
        setErrors((current) => {
            const next = { ...current }
            if (message) next[field] = message
            else delete next[field]
            return next
        })
    }

    // The first problem from top to bottom, like the guardian's form: only
    // that one is shown, and the form takes the teacher right to it.
    function firstProblem(): [Field, string, string] | null {
        const ageProblem = !dateOfBirth
            ? "Ingresa tu fecha de nacimiento."
            : calculateAge(dateOfBirth) < MINIMUM_TEACHER_AGE
              ? `Debes ser mayor de edad (${MINIMUM_TEACHER_AGE} años o más) para registrarte como docente.`
              : calculateAge(dateOfBirth) > MAX_AGE
                ? "Revisa el año de la fecha de nacimiento."
                : null
        const checks: [Field, string, string | null][] = [
            ["firstName", "docente-nombres", nameError(firstName, "Ingresa tus nombres.")],
            ["lastName", "docente-apellidos", nameError(lastName, "Ingresa tus apellidos.")],
            ["dateOfBirth", "docente-fecha-nacimiento", ageProblem],
            [
                "documentType",
                "docente-tipo-documento",
                documentType ? null : "Selecciona un tipo de documento.",
            ],
            [
                "documentNumber",
                "docente-numero-documento",
                !documentNumber.trim()
                    ? "Ingresa tu número de documento."
                    : documentNumberFormatError(selectedDocumentType?.name, documentNumber),
            ],
            [
                "documentIssuedAt",
                "docente-fecha-expedicion-documento",
                !documentIssuedAt
                    ? "Ingresa la fecha de expedición del documento de identificación."
                    : validateDocumentIssuedAt(documentIssuedAt, dateOfBirth, TODAY_ISO),
            ],
            [
                "email",
                "docente-correo",
                EMAIL_PATTERN.test(email.trim()) ? null : "Ingresa un correo electrónico válido.",
            ],
            [
                "phone",
                "docente-telefono",
                phone && isValidPhoneNumber(phone) ? null : "Ingresa un número telefónico válido.",
            ],
            [
                "password",
                "docente-password",
                passwordMeetsRequirements(password)
                    ? null
                    : "Ingresa una contraseña que cumpla con todos los requisitos indicados abajo.",
            ],
            [
                "passwordConfirmation",
                "docente-password-confirmacion",
                !passwordConfirmation
                    ? "Ingresa la confirmación de la contraseña."
                    : password === passwordConfirmation
                      ? null
                      : "Las contraseñas no coinciden.",
            ],
        ]
        const found = checks.find(([, , message]) => message)
        return found ? [found[0], found[1], found[2] as string] : null
    }

    function handleSubmitStep1(event: FormEvent) {
        event.preventDefault()
        if (!catalogsReady) return
        const problem = firstProblem()
        if (problem) {
            const [field, fieldId, message] = problem
            setErrors({ [field]: message })
            focusAndScrollToField(fieldId)
            return
        }
        setErrors({})
        setSubmitError(null)
        setPhase("perfil")
    }

    // While a study or job card is still open, the teacher can't leave the
    // profile step, forward or back: the check (or Quitar) comes first.
    function stopIfCardOpen(): boolean {
        const open = firstOpenEntry(profileDraft)
        if (!open) return false
        setOpenCardNotice(true)
        focusAndScrollToField(`${PROFILE_ID_PREFIX}-${open}`)
        return true
    }

    function handleSubmitProfile(event: FormEvent) {
        event.preventDefault()
        if (stopIfCardOpen()) return
        const found = profileDraftErrors(profileDraft)
        setProfileErrors(found)
        const firstKey = Object.keys(found)[0]
        if (firstKey) {
            focusAndScrollToField(`${PROFILE_ID_PREFIX}-${firstKey}`)
            return
        }
        // The consent goes last, once all the data is in.
        if (!acceptsDataProcessing) {
            setError("acceptsDataProcessing", "El consentimiento de tratamiento de datos es obligatorio.")
            focusAndScrollToField("docente-consentimiento")
            return
        }
        setIncludeProfile(!isDraftEmpty(profileDraft))
        setPhase("confirmacion")
    }

    /** Step indicator click. Going back always works, going forward runs
     * that form's real submit, so the same checks apply. */
    function handleStepIndicatorClick(target: 1 | 2) {
        if (target === 1 && phase === "perfil" && !stopIfCardOpen())
            setPhase("formulario")
        if (target === 2 && phase === "formulario")
            step1FormRef.current?.requestSubmit()
    }

    async function createAccount() {
        setSubmitError(null)
        setPhase("cargando")
        // The picker already checked the number, so parsing it back is safe.
        const parsedPhone = parsePhoneNumber(phone)
        const payload: TeacherRegistrationRequest = {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            document_type_id: Number(documentType),
            document_number: documentNumber.trim(),
            date_of_birth: dateOfBirth,
            document_issued_at: documentIssuedAt,
            email: email.trim(),
            password,
            phone_country_code: parsedPhone?.countryCallingCode ?? "",
            phone_number: parsedPhone?.nationalNumber ?? "",
            // Optional, an empty one goes as null.
            institution: institution.trim() || null,
            consent: {
                policy_version: PRIVACY_POLICY_VERSION,
                accepts_data_processing: acceptsDataProcessing,
            },
            profile: includeProfile ? profileFromDraft(profileDraft) : null,
        }
        try {
            const tokens = await register.mutateAsync(payload)
            setSession(tokens)
            setPhase("exito")
        } catch (error) {
            setSubmitError(getAuthErrorMessage(error))
            setPhase("confirmacion")
        }
    }

    if (phase === "cargando")
        return <LoadingScreen message="Creando tu cuenta" />
    if (phase === "exito")
        return (
            <RegistrationSuccessScreen
                onContinue={() => setPhase("totp")}
            >
                <p>
                    ¡Felicidades, <strong>{firstName.trim()}</strong>!{" "}
                    {includeProfile
                        ? "Tu cuenta y tu perfil docente ya quedaron creados dentro de IRIS."
                        : "Tu cuenta de docente ya quedó creada dentro de IRIS."}
                </p>
                <p>
                    Cada mirada es un paso hacia nuevas formas de enseñar.
                    ¡Vamos a acompañar juntos a tus estudiantes en esta
                    aventura!
                </p>
                {!includeProfile && (
                    <p>
                        Cuando quieras, puedes completar tu perfil docente desde
                        tu panel: es tu carta de presentación para las familias.
                    </p>
                )}
                <p>
                    Ahora, <strong>{firstName.trim()}</strong>, vamos a
                    configurar la autenticación de dos factores (2FA) para
                    proteger tu cuenta.
                </p>
            </RegistrationSuccessScreen>
        )
    if (phase === "totp")
        return (
            <TotpSetupScreen
                account="teacher"
                onVerified={(tokens) => {
                    if (tokens) setSession(tokens)
                    setPhase("totp-listo")
                }}
            />
        )
    if (phase === "totp-listo")
        return (
            <TotpSuccessScreen
                firstName={firstName.trim()}
                account="teacher"
                onContinue={() => navigate("/teacher/portal", { replace: true })}
            />
        )

    const summary: SummaryItem[] = [
        { label: "Nombres", value: firstName },
        { label: "Apellidos", value: lastName },
        { label: "Fecha de nacimiento", value: formatDate(dateOfBirth) },
        {
            label: "Tipo de documento",
            value: selectedDocumentType?.name ?? documentType,
        },
        { label: "Número de documento", value: documentNumber },
        {
            label: "Fecha de expedición del documento",
            value: formatDate(documentIssuedAt),
        },
        { label: "Correo electrónico", value: email },
        { label: "Teléfono", value: formatPhoneNumberIntl(phone) || phone },
        { label: "Institución", value: institution.trim() || "Sin indicar" },
        // With a profile, it's shown in full below the rows (details).
        ...(includeProfile
            ? []
            : [
                  {
                      label: "Perfil docente",
                      value: "Lo completarás después desde tu panel",
                  },
              ]),
    ]

    const step = phase === "perfil" ? 2 : 1

    return (
        <main className={styles.page}>
            <IrisMark
                size={420}
                className={`${styles.ring} ${styles.ringLarge}`}
            />
            <IrisMark
                size={150}
                className={`${styles.ring} ${styles.ringBottomLeft}`}
            />
            <IrisMark
                size={420}
                className={`${styles.ring} ${styles.ringTopLeft}`}
            />
            <IrisMark
                size={150}
                className={`${styles.ring} ${styles.ringTopRight}`}
            />
            <Link
                to="/login/adult"
                state={{ vista: "elegirRegistro" }}
                className={styles.back}
            >
                <IconArrowLeft /> Volver
            </Link>
            <div className={styles.card}>
                <h1 className={styles.title}>
                    {phase === "confirmacion"
                        ? "Confirmación: Docente"
                        : phase === "perfil"
                          ? "Crear cuenta: Tu perfil docente"
                          : "Crear cuenta: Docente"}
                </h1>
                {phase !== "confirmacion" && (
                    <ul className={styles.stepIndicators}>
                        <li>
                            <button
                                type="button"
                                className={`${styles.stepIndicator} ${step === 1 ? styles.stepIndicatorActive : ""}`}
                                onClick={() => handleStepIndicatorClick(1)}
                                aria-label="Ir al paso 1: datos del docente"
                                aria-current={step === 1 ? "step" : undefined}
                            />
                        </li>
                        <li>
                            <button
                                type="button"
                                className={`${styles.stepIndicator} ${step === 2 ? styles.stepIndicatorActive : ""}`}
                                onClick={() => handleStepIndicatorClick(2)}
                                aria-label="Ir al paso 2: perfil docente"
                                aria-current={step === 2 ? "step" : undefined}
                            />
                        </li>
                    </ul>
                )}

                {phase === "formulario" && (
                    // noValidate: our own messages and scroll, not the browser's tooltip.
                    <form
                        ref={step1FormRef}
                        className={styles.form}
                        onSubmit={handleSubmitStep1}
                        aria-label="Datos del docente, paso 1 de 3"
                        noValidate
                    >
                        <div className={styles.notice}>
                            <IconInfo className={styles.noticeIcon} />
                            <div>
                                <p className={styles.noticeHeading}>
                                    Indicaciones iniciales:
                                </p>
                                <p className={styles.noticeText}>
                                    En este apartado se realizará el registro de
                                    tu cuenta de docente dentro de IRIS, por lo
                                    que es importante que tengas a la mano tus
                                    datos personales. En el paso 2 podrás
                                    contarle a las familias sobre tus estudios y
                                    tu experiencia, o dejarlo para después.
                                </p>
                                <p className={styles.noticeText}>
                                    En total son 3 pasos: los dos primeros para
                                    ingresar tus datos y tu perfil docente, y el
                                    último para confirmar que todo esté correcto
                                    antes de crear la cuenta.
                                </p>
                            </div>
                        </div>
                        <div className={styles.notice}>
                            <IconLock className={styles.noticeIcon} />
                            <div>
                                <p className={styles.noticeHeading}>
                                    Seguridad de tu cuenta:
                                </p>
                                <p className={styles.noticeText}>
                                    Para proteger el acceso a tu panel docente,
                                    IRIS usa autenticación de dos factores (2FA)
                                    mediante una aplicación autenticadora
                                    (basada en TOTP), además de tu contraseña.
                                </p>
                                <p className={styles.noticeText}>
                                    Te recomendamos tener instalada en tu
                                    celular una aplicación como Google
                                    Authenticator, Microsoft Authenticator o
                                    Authy, ya que la necesitarás para activar
                                    esta protección al terminar el registro.
                                </p>
                            </div>
                        </div>
                        <p className={styles.subtitle}>
                            Paso 1 de 3 — Datos de tu cuenta de docente.
                        </p>
                        <TextField
                            id="docente-nombres"
                            label="Nombres"
                            value={firstName}
                            onChange={(value) => {
                                setFirstName(value)
                                setError("firstName", null)
                            }}
                            error={errors.firstName}
                            required
                            autoComplete="given-name"
                        />
                        <TextField
                            id="docente-apellidos"
                            label="Apellidos"
                            value={lastName}
                            onChange={(value) => {
                                setLastName(value)
                                setError("lastName", null)
                            }}
                            error={errors.lastName}
                            required
                            autoComplete="family-name"
                        />
                        <TextField
                            id="docente-fecha-nacimiento"
                            label="Fecha de nacimiento"
                            type="date"
                            value={dateOfBirth}
                            onChange={(value) => {
                                setDateOfBirth(value)
                                setError("dateOfBirth", null)
                                // The birth date is the issue date's lower
                                // bound, so that one is checked again.
                                setError(
                                    "documentIssuedAt",
                                    validateDocumentIssuedAt(documentIssuedAt, value, TODAY_ISO),
                                )
                            }}
                            error={errors.dateOfBirth}
                            required
                            max={TODAY_ISO}
                        />
                        <SelectField
                            id="docente-tipo-documento"
                            label="Tipo de documento"
                            value={documentType}
                            onChange={(value) => {
                                setDocumentType(value)
                                setError("documentType", null)
                                // A number that was fine can stop being it with
                                // another type, so it's checked again right away.
                                const nextType = documentTypesQuery.data?.find(
                                    (item) => String(item.id) === value,
                                )
                                setError(
                                    "documentNumber",
                                    documentNumberFormatError(nextType?.name, documentNumber),
                                )
                            }}
                            options={(documentTypesQuery.data ?? []).map(
                                (item) => ({
                                    value: String(item.id),
                                    label: item.name,
                                }),
                            )}
                            error={errors.documentType}
                            required
                            disabled={documentTypesQuery.isLoading}
                        />
                        <TextField
                            id="docente-numero-documento"
                            label="Número de documento"
                            value={documentNumber}
                            onChange={(value) => {
                                const filtered = filterDocumentNumberInput(
                                    selectedDocumentType?.name,
                                    value,
                                )
                                setDocumentNumber(filtered)
                                setError(
                                    "documentNumber",
                                    documentNumberFormatError(selectedDocumentType?.name, filtered),
                                )
                            }}
                            error={errors.documentNumber}
                            required
                            inputMode={
                                selectedDocumentType?.name ===
                                DOCUMENT_TYPE_NAME_PASSPORT
                                    ? "text"
                                    : "numeric"
                            }
                        />
                        <TextField
                            id="docente-fecha-expedicion-documento"
                            label="Fecha de expedición del documento"
                            type="date"
                            value={documentIssuedAt}
                            onChange={(value) => {
                                setDocumentIssuedAt(value)
                                // Checked right away, a typed date skips the
                                // picker's min and max.
                                setError(
                                    "documentIssuedAt",
                                    validateDocumentIssuedAt(value, dateOfBirth, TODAY_ISO),
                                )
                            }}
                            error={errors.documentIssuedAt}
                            required
                            min={dateOfBirth || undefined}
                            max={TODAY_ISO}
                        />
                        <TextField
                            id="docente-correo"
                            label="Correo electrónico"
                            type="email"
                            value={email}
                            onChange={(value) => {
                                setEmail(value)
                                setError("email", null)
                            }}
                            error={errors.email}
                            required
                            autoComplete="email"
                        />
                        <PhoneField
                            id="docente-telefono"
                            label="Teléfono"
                            value={phone}
                            onChange={(value) => {
                                setPhone(value)
                                setError("phone", null)
                            }}
                            error={errors.phone}
                            required
                        />
                        <TextField
                            id="docente-institucion"
                            label="Institución (opcional)"
                            value={institution}
                            onChange={setInstitution}
                            autoComplete="organization"
                            maxLength={200}
                            placeholder="El colegio o instituto donde enseñas. Si das clases particulares, déjalo vacío."
                        />
                        <TextField
                            id="docente-password"
                            label="Contraseña"
                            type="password"
                            value={password}
                            onChange={(value) => {
                                setPassword(value)
                                setError("password", null)
                                // A stale "no coinciden" belongs to the old password.
                                setError("passwordConfirmation", null)
                            }}
                            error={errors.password}
                            required
                            autoComplete="new-password"
                        />
                        <PasswordRequirements password={password} />
                        <TextField
                            id="docente-password-confirmacion"
                            label="Confirmar contraseña"
                            type="password"
                            value={passwordConfirmation}
                            onChange={(value) => {
                                setPasswordConfirmation(value)
                                setError("passwordConfirmation", null)
                            }}
                            error={errors.passwordConfirmation}
                            required
                            autoComplete="new-password"
                        />
                        {documentTypesQuery.isError && (
                            <p
                                role="alert"
                                className={styles.error}
                            >
                                No pudimos cargar los tipos de documento.
                                Verifica tu conexión e intenta de nuevo.
                            </p>
                        )}
                        <div className={styles.buttonRow}>
                            <span />
                            <button
                                type="submit"
                                className={styles.primaryButton}
                                disabled={!catalogsReady}
                            >
                                {catalogsReady ? "Siguiente" : "Cargando…"}
                            </button>
                        </div>
                    </form>
                )}

                {phase === "perfil" && (
                    <form
                        className={styles.form}
                        onSubmit={handleSubmitProfile}
                        aria-label="Perfil docente, paso 2 de 3"
                        noValidate
                    >
                        <p className={styles.subtitle}>
                            Paso 2 de 3 — Tu perfil docente.
                        </p>
                        <TeacherProfileFields
                            idPrefix={PROFILE_ID_PREFIX}
                            draft={profileDraft}
                            onChange={setProfileDraft}
                            errors={profileErrors}
                        />
                        <CheckboxField
                            id="docente-consentimiento"
                            checked={acceptsDataProcessing}
                            onChange={(checked) => {
                                setAcceptsDataProcessing(checked)
                                setError("acceptsDataProcessing", null)
                            }}
                            error={errors.acceptsDataProcessing}
                            required
                        >
                            Acepto el tratamiento de mis datos personales para
                            el uso de IRIS, conforme a nuestro{" "}
                            <a
                                href="/legal-notice"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Aviso Legal
                            </a>{" "}
                            y{" "}
                            <a
                                href="/privacy-policy"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Política de Privacidad
                            </a>
                            .
                        </CheckboxField>
                        {openCardNotice && firstOpenEntry(profileDraft) && (
                            <p role="alert" className={styles.error}>
                                {OPEN_ENTRY_MESSAGE}
                            </p>
                        )}
                        <div className={styles.buttonRow}>
                            <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => {
                                    if (!stopIfCardOpen()) setPhase("formulario")
                                }}
                            >
                                Atrás
                            </button>
                            <button
                                type="submit"
                                className={styles.primaryButton}
                            >
                                Siguiente
                            </button>
                        </div>
                    </form>
                )}

                {phase === "confirmacion" && (
                    <RegistrationConfirmation
                        stepLabel="Paso 3 de 3 — Confirmación: Docente."
                        greeting={
                            <>
                                ¡Hola <strong>{firstName}</strong>! Gracias por
                                tomarte el tiempo de completar tus datos. Ya casi
                                podrás crear tus clases y acompañar el
                                aprendizaje de tus estudiantes en IRIS.
                            </>
                        }
                        items={summary}
                        details={
                            includeProfile && (
                                <TeacherProfileSummary
                                    profile={profileFromDraft(profileDraft)}
                                />
                            )
                        }
                        onEdit={() => {
                            setSubmitError(null)
                            setPhase("formulario")
                        }}
                        onConfirm={() => void createAccount()}
                        loading={register.isPending}
                        confirmLabel="Confirmar y crear cuenta"
                        error={submitError}
                    />
                )}
            </div>
        </main>
    )
}
