import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
    formatPhoneNumberIntl,
    isValidPhoneNumber,
    parsePhoneNumber,
} from "react-phone-number-input"
import type { TeacherRegistrationRequest } from "@iris/shared-types"
import { useAuth } from "@/shared/auth/useAuth"
import {
    useDocumentTypes,
    useEmailCheck,
    useRegistrarDocente,
} from "@/shared/api/hooks/useAuthApi"
import { EMAIL_TAKEN_MESSAGE, getAuthErrorMessage } from "@/features/auth/errors"
import { firstOptionId } from "./firstOption"
import { TextField } from "@/features/auth/ui/TextField"
import { PhoneField } from "@/features/auth/ui/PhoneField"
import { CheckboxField } from "@/features/auth/ui/CheckboxField"
import { PasswordRequirements } from "@/features/auth/ui/PasswordRequirements"
import { passwordMeetsRequirements } from "@/features/auth/ui/passwordRules"
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
import { PortalSelect } from "@/shared/ui/portal/PortalSelect"
import { IrisRings } from "@/shared/ui/IrisRings"
import { IconArrowLeft, IconInfo, IconLock } from "@/shared/ui/icons"
import { LoadingScreen } from "@/shared/ui/LoadingScreen"
import { usePortalTheme } from "@/shared/ui/portal/usePortalTheme"
import { calculateAge } from "@/features/utils/calculateAge"
import { MAX_AGE, nameError } from "@/features/utils/personValidation"
import { formatDate } from "@/features/utils/formatDate"
import { validateDocumentIssuedAt } from "@/features/utils/validateDocumentIssuedAt"
import { PRIVACY_POLICY_VERSION } from "@/features/legal/policyVersion"
import { RegistrationConfirmation, type SummaryItem } from "./RegistrationConfirmation"
import { RegistrationSuccessScreen } from "./RegistrationSuccessScreen"
import { TotpSetupScreen } from "./TotpSetupScreen"
import { TotpSuccessScreen } from "./TotpSuccessScreen"
import {
    focusAndScrollToField,
    useFieldChecks,
    type Problem,
} from "./useFieldChecks"
import styles from "./GuardianRegistrationWizard.module.css"

const MINIMUM_TEACHER_AGE = 18
const TODAY_ISO = new Date().toISOString().slice(0, 10)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROFILE_ID_PREFIX = "teacher-profile"

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

/** `/register/teacher`. Looks and checks the same as the guardian's
 * registration: two forms (personal data, and the teacher's profile, which
 * is optional) and a confirmation with the IRIS mascot before creating the
 * account. Right after, the teacher sets up their 2FA, like the guardian. */
export default function TeacherRegistrationWizard() {
    // The colors and Poppins of the landing and the login, like the
    // guardian's sign up. It also covers the 2FA screens shown from here.
    usePortalTheme()
    const navigate = useNavigate()
    const { setSession } = useAuth()
    const register = useRegistrarDocente()
    const documentTypesQuery = useDocumentTypes()
    const emailCheck = useEmailCheck()
    const step1FormRef = useRef<HTMLFormElement>(null)
    // While "Siguiente" waits to know if the email is taken.
    const [checkingEmail, setCheckingEmail] = useState(false)

    const [phase, setPhase] = useState<Phase>("formulario")
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [dateOfBirth, setDateOfBirth] = useState("")
    const [chosenDocumentType, setDocumentType] = useState("")
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

    // The first document type until the teacher picks another one, worked
    // out on every render so it never overrides a choice already made.
    const documentType =
        chosenDocumentType || firstOptionId(documentTypesQuery.data)

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

    // Each field is checked when it's left, like the guardian's form (see
    // useFieldChecks).
    const { touched, checkedField, checkField } = useFieldChecks()

    // What's wrong with each field, or null. The same rules run when a field
    // is left and when "Siguiente" is pressed, so the messages are the same.
    const firstNameProblem: Problem = (value) =>
        nameError(value, "Ingresa tus nombres.")
    const lastNameProblem: Problem = (value) =>
        nameError(value, "Ingresa tus apellidos.")
    const dateOfBirthProblem: Problem = (value) => {
        if (!value) return "Ingresa tu fecha de nacimiento."
        if (calculateAge(value) < MINIMUM_TEACHER_AGE) {
            return `Debes ser mayor de edad (${MINIMUM_TEACHER_AGE} años o más) para registrarte como docente.`
        }
        if (calculateAge(value) > MAX_AGE) {
            return "Revisa el año de la fecha de nacimiento."
        }
        return null
    }
    // These ones also depend on another field, which can be given when it's
    // the other one that just changed.
    const documentNumberProblem = (
        value: string,
        typeName = selectedDocumentType?.name,
    ) =>
        value.trim()
            ? documentNumberFormatError(typeName, value)
            : "Ingresa tu número de documento."
    const documentIssuedAtProblem = (value: string, birth = dateOfBirth) =>
        value
            ? validateDocumentIssuedAt(value, birth, TODAY_ISO)
            : "Ingresa la fecha de expedición del documento de identificación."
    // An email we already know has an account keeps its error when the
    // field is left, until it's changed.
    const emailProblem: Problem = (value) => {
        if (!EMAIL_PATTERN.test(value.trim()))
            return "Ingresa un correo electrónico válido."
        return emailCheck.knownTaken(value) ? EMAIL_TAKEN_MESSAGE : null
    }
    const phoneProblem: Problem = (value) =>
        value && isValidPhoneNumber(value)
            ? null
            : "Ingresa un número telefónico válido."
    const passwordProblem: Problem = (value) =>
        passwordMeetsRequirements(value)
            ? null
            : "Ingresa una contraseña que cumpla con todos los requisitos indicados abajo."
    const passwordConfirmationProblem = (value: string, first = password) => {
        if (!value) return "Ingresa la confirmación de la contraseña."
        return value === first ? null : "Las contraseñas no coinciden."
    }

    // The same two helpers of the hook, but with the error kept in `errors`.
    function teacherField(
        field: Field,
        id: string,
        value: string,
        setValue: (value: string) => void,
        problem: Problem,
    ) {
        return checkedField(
            id,
            value,
            setValue,
            errors[field] ?? null,
            (message) => setError(field, message),
            problem,
        )
    }

    function checkTeacherField(
        field: Field,
        id: string,
        value: string,
        problem: Problem,
    ): boolean {
        return checkField(
            id,
            value,
            (message) => setError(field, message),
            problem,
        )
    }

    /** Checks the fields top to bottom and stops at the first error, showing
     * it and moving to that field. The step dots use it too, through
     * `requestSubmit()`. */
    async function handleSubmitStep1(event: FormEvent) {
        event.preventDefault()
        if (!catalogsReady || checkingEmail) return

        if (
            !checkTeacherField("firstName", "teacher-first-name", firstName, firstNameProblem) ||
            !checkTeacherField("lastName", "teacher-last-name", lastName, lastNameProblem) ||
            !checkTeacherField("dateOfBirth", "teacher-date-of-birth", dateOfBirth, dateOfBirthProblem)
        ) {
            return
        }

        if (!documentType) {
            setError("documentType", "Selecciona un tipo de documento.")
            focusAndScrollToField("teacher-document-type")
            return
        }
        setError("documentType", null)

        if (
            !checkTeacherField("documentNumber", "teacher-document-number", documentNumber, documentNumberProblem) ||
            !checkTeacherField("documentIssuedAt", "teacher-document-issued-at", documentIssuedAt, documentIssuedAtProblem) ||
            !checkTeacherField("email", "teacher-email", email, emailProblem) ||
            !checkTeacherField("phone", "teacher-phone", phone, phoneProblem) ||
            !checkTeacherField("password", "teacher-password", password, passwordProblem) ||
            !checkTeacherField(
                "passwordConfirmation",
                "teacher-password-confirmation",
                passwordConfirmation,
                passwordConfirmationProblem,
            )
        ) {
            return
        }

        // Last, the only check that asks the server: an email that already
        // has an account is told here and not at the end of the sign up.
        setCheckingEmail(true)
        const emailTaken = await emailCheck.isTaken(email)
        setCheckingEmail(false)
        if (emailTaken) {
            setError("email", EMAIL_TAKEN_MESSAGE)
            focusAndScrollToField("teacher-email")
            return
        }

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
            focusAndScrollToField("teacher-consent")
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

    // The fields of step 1 checked when they're left.
    const firstNameField = teacherField("firstName", "teacher-first-name", firstName, setFirstName, firstNameProblem)
    const lastNameField = teacherField("lastName", "teacher-last-name", lastName, setLastName, lastNameProblem)
    const dateOfBirthField = teacherField(
        "dateOfBirth",
        "teacher-date-of-birth",
        dateOfBirth,
        setDateOfBirth,
        dateOfBirthProblem,
    )
    const documentNumberField = teacherField(
        "documentNumber",
        "teacher-document-number",
        documentNumber,
        setDocumentNumber,
        documentNumberProblem,
    )
    const documentIssuedAtField = teacherField(
        "documentIssuedAt",
        "teacher-document-issued-at",
        documentIssuedAt,
        setDocumentIssuedAt,
        documentIssuedAtProblem,
    )
    const emailField = teacherField("email", "teacher-email", email, setEmail, emailProblem)
    const phoneField = teacherField("phone", "teacher-phone", phone, setPhone, phoneProblem)
    const passwordField = teacherField("password", "teacher-password", password, setPassword, passwordProblem)
    const passwordConfirmationField = teacherField(
        "passwordConfirmation",
        "teacher-password-confirmation",
        passwordConfirmation,
        setPasswordConfirmation,
        passwordConfirmationProblem,
    )

    return (
        <main className={styles.page}>
            {/* The same rings as the guardian's sign up, at the top and at
                the end of the form. */}
            <IrisRings className={styles.irisRingsTop} />
            <IrisRings className={styles.irisRingsBottom} />
            <Link
                to="/register"
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
                        onSubmit={(event) => void handleSubmitStep1(event)}
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
                            {...firstNameField}
                            label="Nombres"
                            required
                            autoComplete="given-name"
                        />
                        <TextField
                            {...lastNameField}
                            label="Apellidos"
                            required
                            autoComplete="family-name"
                        />
                        <TextField
                            {...dateOfBirthField}
                            label="Fecha de nacimiento"
                            type="date"
                            onChange={(value) => {
                                dateOfBirthField.onChange(value)
                                // The issued date can't be before the birth date, so
                                // if it was already checked it's checked again here.
                                if (touched["teacher-document-issued-at"]) {
                                    setError(
                                        "documentIssuedAt",
                                        documentIssuedAtProblem(documentIssuedAt, value),
                                    )
                                }
                            }}
                            required
                            max={TODAY_ISO}
                        />
                        <PortalSelect
                            id="teacher-document-type"
                            label="Tipo de documento"
                            value={documentType}
                            onChange={(value) => {
                                setDocumentType(value)
                                setError("documentType", null)
                                // A number that was fine can stop being it with
                                // another type, so if it was already checked
                                // it's checked again against the new one.
                                if (touched["teacher-document-number"]) {
                                    const nextType = documentTypesQuery.data?.find(
                                        (item) => String(item.id) === value,
                                    )
                                    setError(
                                        "documentNumber",
                                        documentNumberProblem(documentNumber, nextType?.name),
                                    )
                                }
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
                            {...documentNumberField}
                            label="Número de documento"
                            // Only the characters the type allows get in.
                            onChange={(value) =>
                                documentNumberField.onChange(
                                    filterDocumentNumberInput(
                                        selectedDocumentType?.name,
                                        value,
                                    ),
                                )
                            }
                            required
                            inputMode={
                                selectedDocumentType?.name ===
                                DOCUMENT_TYPE_NAME_PASSPORT
                                    ? "text"
                                    : "numeric"
                            }
                        />
                        <TextField
                            {...documentIssuedAtField}
                            label="Fecha de expedición del documento"
                            type="date"
                            required
                            min={dateOfBirth || undefined}
                            max={TODAY_ISO}
                        />
                        <TextField
                            {...emailField}
                            label="Correo electrónico"
                            type="email"
                            onBlur={() => {
                                emailField.onBlur()
                                // Starts asking the server now, so "Siguiente"
                                // doesn't have to wait for it.
                                if (!emailProblem(email)) emailCheck.prefetch(email)
                            }}
                            required
                            autoComplete="email"
                        />
                        <PhoneField
                            {...phoneField}
                            label="Teléfono"
                            required
                        />
                        <TextField
                            id="teacher-institution"
                            label="Institución (opcional)"
                            value={institution}
                            onChange={setInstitution}
                            autoComplete="organization"
                            maxLength={200}
                            placeholder="El colegio o instituto donde enseñas. Si das clases particulares, déjalo vacío."
                        />
                        <TextField
                            {...passwordField}
                            label="Contraseña"
                            type="password"
                            onChange={(value) => {
                                passwordField.onChange(value)
                                // The confirmation has to match the new one, so if it
                                // was already checked it's checked again.
                                if (touched["teacher-password-confirmation"]) {
                                    setError(
                                        "passwordConfirmation",
                                        passwordConfirmationProblem(passwordConfirmation, value),
                                    )
                                }
                            }}
                            required
                            autoComplete="new-password"
                        />
                        <PasswordRequirements password={password} />
                        <TextField
                            {...passwordConfirmationField}
                            label="Confirmar contraseña"
                            type="password"
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
                                disabled={!catalogsReady || checkingEmail}
                            >
                                {!catalogsReady
                                    ? "Cargando…"
                                    : checkingEmail
                                      ? "Revisando…"
                                      : "Siguiente"}
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
                            id="teacher-consent"
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
