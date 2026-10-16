import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
} from "react"
import { Link, useNavigate } from "react-router-dom"
import {
    formatPhoneNumberIntl,
    isValidPhoneNumber,
    parsePhoneNumber,
} from "react-phone-number-input"
import type { GuardianRegistrationRequest } from "@iris/shared-types"
import { useAuth } from "@/shared/auth/useAuth"
import {
    useRegistrarTutor,
    useDocumentTypes,
    useRelationshipTypes,
    useAvatars,
} from "@/shared/api/hooks/useAuthApi"
import { getAuthErrorMessage } from "@/features/auth/errors"
import { firstOptionId } from "./firstOption"
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage"
import { TextField } from "@/features/auth/ui/TextField"
import { PhoneField } from "@/features/auth/ui/PhoneField"
import type { FieldStatus } from "@/features/auth/ui/FieldStatusIcon"
import { PasswordRequirements } from "@/features/auth/ui/PasswordRequirements"
import { passwordMeetsRequirements } from "@/features/auth/ui/passwordRules"
import {
    DOCUMENT_TYPE_NAME_PASSPORT,
    documentNumberFormatError,
    filterDocumentNumberInput,
} from "@/features/auth/lib/documentNumber"
import { PortalSelect } from "@/shared/ui/portal/PortalSelect"
import fieldStyles from "@/features/auth/ui/Fields.module.css"
import { CheckboxField } from "@/features/auth/ui/CheckboxField"
import { NumericKeypad } from "@/shared/ui/NumericKeypad"
import { IrisRings } from "@/shared/ui/IrisRings"
import { IconCheck, IconArrowLeft, IconInfo, IconLock } from "@/shared/ui/icons"
import { LoadingScreen } from "@/shared/ui/LoadingScreen"
import { usePortalTheme } from "@/shared/ui/portal/usePortalTheme"
import { RegistrationSuccessScreen } from "./RegistrationSuccessScreen"
import { TotpSetupScreen } from "./TotpSetupScreen"
import { TotpSuccessScreen } from "./TotpSuccessScreen"
import { RegistrationConfirmation, type SummaryItem } from "./RegistrationConfirmation"
import { PRIVACY_POLICY_VERSION } from "@/features/legal/policyVersion"
import styles from "./GuardianRegistrationWizard.module.css"
import { calculateAge } from "@/features/utils/calculateAge"
import { MAX_AGE, nameError } from "@/features/utils/personValidation"
import { formatDate } from "@/features/utils/formatDate"
import { validateDocumentIssuedAt } from "@/features/utils/validateDocumentIssuedAt"

const MIN_GUARDIAN_AGE = 18
const TODAY_ISO = new Date().toISOString().slice(0, 10)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type PinSubstep = "ingresar" | "confirmar" | "listo"
type Phase = "formulario" | "confirmacion"

/** Runs after both confirmations pass and "Crear cuenta" is pressed, on top
 * of (not instead of) the step/phase state above: "idle" leaves the wizard's
 * own step 2 confirmation on screen, "cargando" and "exito" each replace the
 * whole page. Kept separate from `phase` because it isn't a step of the
 * form — there's nothing to correct or go back to once the account exists. */
type PostSubmitPhase =
    | "idle"
    | "cargando"
    | "exito"
    | "totp-setup"
    | "totp-exito"

/** Scrolls to a field and focuses it, so an error is never hidden below.
 * It uses `window.scrollTo` instead of `scrollIntoView()`: the page root
 * has `overflow: hidden` (for the background rings) and `scrollIntoView()`
 * would scroll that box instead of the page. `preventScroll` avoids the
 * same problem when focusing. */
function focusAndScrollToField(fieldId: string): void {
    const field = document.getElementById(fieldId)
    if (!field) return
    field.focus({ preventScroll: true })
    const rect = field.getBoundingClientRect()
    const targetTop =
        rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" })
}

/** What a field that's checked when it's left needs (TextField, PhoneField). */
interface CheckedFieldProps {
    id: string
    value: string
    error?: string
    status?: FieldStatus
    onChange: (value: string) => void
    onBlur: () => void
}

type Problem = (value: string) => string | null

function catalogLabel(
    items: { id: number; name: string }[] | undefined,
    id: string,
): string {
    return items?.find((item) => String(item.id) === id)?.name ?? id
}

/** `/login/guardian/new`: the guardian's data and consent, then the first
 * kid with the PIN typed twice. Confirming creates everything together and
 * signs the guardian in, then comes the 2FA setup and the parents' portal.
 * The kid's own session always asks for the PIN again later. */
export default function GuardianRegistrationWizard() {
    // The colors and Poppins of the landing and the login. It also covers the
    // 2FA screens, since they're shown from here.
    usePortalTheme()
    const navigate = useNavigate()
    const { setSession } = useAuth()
    const register = useRegistrarTutor()
    const documentTypesQuery = useDocumentTypes()
    const relationshipTypesQuery = useRelationshipTypes()
    const avatarsQuery = useAvatars()

    const [step, setStep] = useState<1 | 2>(1)
    const [phase, setPhase] = useState<Phase>("formulario")
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [postSubmitPhase, setPostSubmitPhase] =
        useState<PostSubmitPhase>("idle")
    const step1FormRef = useRef<HTMLFormElement>(null)

    // The wizard changes screens without changing the URL, so the app's own
    // scroll reset never runs. This takes each new screen back to its top.
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [step, phase, postSubmitPhase])

    // Step 1, guardian data.
    const [guardianFirstName, setGuardianFirstName] = useState("")
    const [guardianLastName, setGuardianLastName] = useState("")
    const [chosenDocumentType, setDocumentType] = useState<string>("")
    const [documentNumber, setDocumentNumber] = useState("")
    const [guardianBirthDate, setGuardianBirthDate] = useState("")
    const [documentIssuedAt, setDocumentIssuedAt] = useState("")
    const [email, setEmail] = useState("")
    const [phone, setPhone] = useState("")
    const [chosenRelationship, setRelationship] = useState<string>("")
    const [password, setPassword] = useState("")
    const [passwordConfirmation, setPasswordConfirmation] = useState("")
    const [acceptsDataProcessing, setAcceptsDataProcessing] = useState(false)
    const [guardianFirstNameError, setGuardianFirstNameError] = useState<
        string | null
    >(null)
    const [guardianLastNameError, setGuardianLastNameError] = useState<
        string | null
    >(null)
    const [guardianBirthDateError, setGuardianBirthDateError] = useState<
        string | null
    >(null)
    const [documentTypeError, setDocumentTypeError] = useState<string | null>(
        null,
    )
    const [documentNumberError, setDocumentNumberError] = useState<
        string | null
    >(null)
    const [documentIssuedAtError, setDocumentIssuedAtError] = useState<
        string | null
    >(null)
    const [emailError, setEmailError] = useState<string | null>(null)
    const [phoneError, setPhoneError] = useState<string | null>(null)
    const [relationshipError, setRelationshipError] = useState<string | null>(
        null,
    )
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [passwordConfirmationError, setPasswordConfirmationError] = useState<
        string | null
    >(null)
    const [acceptsDataProcessingError, setAcceptsDataProcessingError] =
        useState<string | null>(null)

    // Until the person picks one, the first option of each catalog is the
    // one used. It's worked out on every render instead of copied into the
    // state, so it never overrides a choice already made.
    const documentType =
        chosenDocumentType || firstOptionId(documentTypesQuery.data)
    const relationship =
        chosenRelationship || firstOptionId(relationshipTypesQuery.data)

    // Step 2, first student profile.
    const [studentFirstName, setStudentFirstName] = useState("")
    const [studentLastName, setStudentLastName] = useState("")
    const [birthDate, setBirthDate] = useState("")
    const [chosenAvatarId, setAvatarId] = useState<string>("")
    const [pinSubstep, setPinSubstep] = useState<PinSubstep>("ingresar")
    const [pin, setPin] = useState("")
    const [pinDraft, setPinDraft] = useState("")
    const [pinError, setPinError] = useState<string | null>(null)
    const [studentFirstNameError, setStudentFirstNameError] = useState<
        string | null
    >(null)
    const [studentLastNameError, setStudentLastNameError] = useState<
        string | null
    >(null)
    const [studentBirthDateError, setStudentBirthDateError] = useState<
        string | null
    >(null)

    // The first avatar until the family picks another one.
    const avatarId = chosenAvatarId || firstOptionId(avatarsQuery.data)

    const selectedDocumentType = documentTypesQuery.data?.find(
        (dt) => String(dt.id) === documentType,
    )

    const catalogsReady = documentType !== "" && relationship !== ""
    const catalogsFailed =
        documentTypesQuery.isError || relationshipTypesQuery.isError
    const avatarsFailed = avatarsQuery.isError

    // --- Each field is checked when it's left ---
    // A field counts as "touched" once it's left with something written, or
    // once "Siguiente" checks it. From then on it's checked on every key, so
    // the cross turns into a check as soon as it's fixed. An empty field that
    // was only tabbed through stays quiet until "Siguiente".
    const [touched, setTouched] = useState<Record<string, boolean>>({})

    function markTouched(id: string) {
        setTouched((current) =>
            current[id] ? current : { ...current, [id]: true },
        )
    }

    // What's wrong with each field, or null. The same rules run when a field
    // is left and when "Siguiente" is pressed, so the messages are the same.
    const guardianFirstNameProblem: Problem = (value) =>
        nameError(value, "Ingresa tus nombres.")
    const guardianLastNameProblem: Problem = (value) =>
        nameError(value, "Ingresa tus apellidos.")
    const guardianBirthDateProblem: Problem = (value) => {
        if (!value) return "Ingresa tu fecha de nacimiento."
        if (calculateAge(value) < MIN_GUARDIAN_AGE) {
            return `Debes ser mayor de edad (${MIN_GUARDIAN_AGE} años o más) para registrarte como tutor.`
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
    const documentIssuedAtProblem = (value: string, birth = guardianBirthDate) =>
        value
            ? validateDocumentIssuedAt(value, birth, TODAY_ISO)
            : "Ingresa la fecha de expedición del documento de identificación."
    const emailProblem: Problem = (value) =>
        EMAIL_PATTERN.test(value.trim())
            ? null
            : "Ingresa un correo electrónico válido."
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
    const studentFirstNameProblem: Problem = (value) =>
        nameError(value, "Ingresa los nombres de tu hijo o hija.")
    const studentLastNameProblem: Problem = (value) =>
        nameError(value, "Ingresa los apellidos de tu hijo o hija.")
    const studentBirthDateProblem: Problem = (value) => {
        if (!value) return "Ingresa la fecha de nacimiento de tu hijo o hija."
        return value > TODAY_ISO
            ? "La fecha de nacimiento no puede ser una fecha futura."
            : null
    }

    /** The props of a field checked on blur: its value and error, the check
     * or the cross, and what to do on each key and when it's left. */
    function checkedField(
        id: string,
        value: string,
        setValue: (value: string) => void,
        error: string | null,
        setError: (error: string | null) => void,
        problem: Problem,
    ): CheckedFieldProps {
        return {
            id,
            value,
            error: error ?? undefined,
            status: touched[id] ? (error ? "invalid" : "valid") : undefined,
            onChange: (next) => {
                setValue(next)
                setError(touched[id] ? problem(next) : null)
            },
            onBlur: () => {
                if (!value.trim()) return
                markTouched(id)
                setError(problem(value))
            },
        }
    }

    /** "Siguiente" checks a field even when it's empty. False means it has
     * something to fix, and the page moves to it. */
    function checkField(
        id: string,
        value: string,
        setError: (error: string | null) => void,
        problem: Problem,
    ): boolean {
        markTouched(id)
        const issue = problem(value)
        setError(issue)
        if (issue) focusAndScrollToField(id)
        return !issue
    }

    function handleGoBackToStep1() {
        setStep(1)
        setPhase("formulario")
    }

    /** Checks the fields top to bottom and stops at the first error, showing
     * it and moving to that field. The step circles use it too, through
     * `requestSubmit()`. */
    function handleSubmitStep1(e: FormEvent) {
        e.preventDefault()
        if (!catalogsReady) return

        if (
            !checkField(
                "guardian-first-name",
                guardianFirstName,
                setGuardianFirstNameError,
                guardianFirstNameProblem,
            ) ||
            !checkField(
                "guardian-last-name",
                guardianLastName,
                setGuardianLastNameError,
                guardianLastNameProblem,
            ) ||
            !checkField(
                "guardian-date-of-birth",
                guardianBirthDate,
                setGuardianBirthDateError,
                guardianBirthDateProblem,
            )
        ) {
            return
        }

        if (!documentType) {
            setDocumentTypeError("Selecciona un tipo de documento.")
            focusAndScrollToField("guardian-document-type")
            return
        }
        setDocumentTypeError(null)

        if (
            !checkField(
                "guardian-document-number",
                documentNumber,
                setDocumentNumberError,
                documentNumberProblem,
            ) ||
            !checkField(
                "guardian-document-issued-at",
                documentIssuedAt,
                setDocumentIssuedAtError,
                documentIssuedAtProblem,
            ) ||
            !checkField("guardian-email", email, setEmailError, emailProblem) ||
            !checkField("guardian-phone", phone, setPhoneError, phoneProblem)
        ) {
            return
        }

        if (!relationship) {
            setRelationshipError("Selecciona tu relación con el estudiante.")
            focusAndScrollToField("guardian-relationship")
            return
        }
        setRelationshipError(null)

        if (
            !checkField(
                "guardian-password",
                password,
                setPasswordError,
                passwordProblem,
            ) ||
            !checkField(
                "guardian-password-confirmation",
                passwordConfirmation,
                setPasswordConfirmationError,
                passwordConfirmationProblem,
            )
        ) {
            return
        }

        setStep(2)
    }

    /** Step indicator click. Going back always works, same as the "Atrás"
     * button. Going forward triggers the step 1 form's real submit instead of
     * duplicating its validation here. */
    function handleStepIndicatorClick(target: 1 | 2) {
        if (target === step) return
        if (target === 1) {
            handleGoBackToStep1()
            return
        }
        step1FormRef.current?.requestSubmit()
    }

    function resetPin() {
        setPin("")
        setPinDraft("")
        setPinSubstep("ingresar")
    }

    function handleFirstPinEntry() {
        setPinError(null)
        setPin(pinDraft)
        setPinDraft("")
        setPinSubstep("confirmar")
    }

    function handleSecondPinEntry() {
        if (pinDraft === pin) {
            setPinDraft("")
            setPinSubstep("listo")
            setPinError(null)
        } else {
            setPinError("Los PIN no coinciden. Vuelve a intentarlo.")
            resetPin()
        }
    }

    function handleSubmitStep2(e: FormEvent) {
        e.preventDefault()

        if (
            !checkField(
                "student-first-name",
                studentFirstName,
                setStudentFirstNameError,
                studentFirstNameProblem,
            ) ||
            !checkField(
                "student-last-name",
                studentLastName,
                setStudentLastNameError,
                studentLastNameProblem,
            ) ||
            !checkField(
                "student-date-of-birth",
                birthDate,
                setStudentBirthDateError,
                studentBirthDateProblem,
            )
        ) {
            return
        }

        if (!acceptsDataProcessing) {
            setAcceptsDataProcessingError(
                "El consentimiento de tratamiento de datos es obligatorio.",
            )
            focusAndScrollToField("student-consent")
            return
        }
        setAcceptsDataProcessingError(null)

        if (pinSubstep !== "listo") {
            setPinError("Define y confirma el PIN antes de continuar.")
            focusAndScrollToField("student-pin-section")
            return
        }

        setSubmitError(null)
        // Both forms are already complete and validated at this point. The
        // confirmation starts by showing the guardian's summary first, not
        // the child's, in the same order they were filled out.
        setStep(1)
        setPhase("confirmacion")
    }

    async function confirmAndCreateAccount() {
        setSubmitError(null)
        setPostSubmitPhase("cargando")

        // The server keeps the country code and the number apart. The phone was
        // already checked in handleSubmitStep1, so splitting it here is safe.
        const parsedPhone = parsePhoneNumber(phone)

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
            },
            consent: {
                policy_version: PRIVACY_POLICY_VERSION,
                accepts_data_processing: acceptsDataProcessing,
            },
        }

        try {
            const tokens = await register.mutateAsync(payload)
            setSession(tokens)
            // The account (person, guardian, student and consent) already exists
            // at this point — everything after this is a celebration + hand-off,
            // never something that can undo the registration that just succeeded.
            setPostSubmitPhase("exito")
        } catch (err) {
            setSubmitError(getAuthErrorMessage(err))
            setPostSubmitPhase("idle")
        }
    }

    const guardianSummary: SummaryItem[] = [
        { label: "Nombres", value: guardianFirstName },
        { label: "Apellidos", value: guardianLastName },
        { label: "Fecha de nacimiento", value: formatDate(guardianBirthDate) },
        {
            label: "Tipo de documento",
            value: catalogLabel(documentTypesQuery.data, documentType),
        },
        { label: "Número de documento", value: documentNumber },
        {
            label: "Fecha de expedición del documento",
            value: formatDate(documentIssuedAt),
        },
        { label: "Correo electrónico", value: email },
        { label: "Teléfono", value: formatPhoneNumberIntl(phone) || phone },
        {
            label: "Relación con el estudiante",
            value: catalogLabel(relationshipTypesQuery.data, relationship),
        },
    ]

    const studentSummary: SummaryItem[] = [
        { label: "Nombres", value: studentFirstName },
        { label: "Apellidos", value: studentLastName },
        { label: "Fecha de nacimiento", value: formatDate(birthDate) },
    ]

    // Replaces the whole wizard once "Crear cuenta" succeeds: there's nothing
    // left to correct or navigate back to at this point (see
    // confirmAndCreateAccount above), so this isn't rendered as just another
    // step/phase branch alongside the form below.
    if (postSubmitPhase === "cargando") {
        return <LoadingScreen message="Creando tu cuenta" />
    }
    if (postSubmitPhase === "exito") {
        return (
            <RegistrationSuccessScreen
                onContinue={() => setPostSubmitPhase("totp-setup")}
            >
                <p>
                    ¡Felicidades, <strong>{guardianFirstName.trim()}</strong> y{" "}
                    <strong>{studentFirstName.trim()}</strong>! Sus perfiles ya
                    quedaron creados dentro de IRIS.
                </p>
                <p>
                    Cada mirada es un paso hacia nuevas formas de aprender.
                    ¡Vamos a comenzar esta aventura juntos!
                </p>
                <p>
                    Ahora, <strong>{guardianFirstName.trim()}</strong>, vamos a
                    configurar la autenticación de dos factores (2FA) para
                    proteger tu cuenta.
                </p>
            </RegistrationSuccessScreen>
        )
    }
    if (postSubmitPhase === "totp-setup") {
        return (
            <TotpSetupScreen
                onVerified={() => setPostSubmitPhase("totp-exito")}
            />
        )
    }
    if (postSubmitPhase === "totp-exito") {
        return (
            <TotpSuccessScreen
                firstName={guardianFirstName.trim()}
                onContinue={() =>
                    navigate("/guardian/portal", { replace: true })
                }
            />
        )
    }

    // The fields checked when they're left, step 1 and step 2.
    const guardianFirstNameField = checkedField(
        "guardian-first-name",
        guardianFirstName,
        setGuardianFirstName,
        guardianFirstNameError,
        setGuardianFirstNameError,
        guardianFirstNameProblem,
    )
    const guardianLastNameField = checkedField(
        "guardian-last-name",
        guardianLastName,
        setGuardianLastName,
        guardianLastNameError,
        setGuardianLastNameError,
        guardianLastNameProblem,
    )
    const guardianBirthDateField = checkedField(
        "guardian-date-of-birth",
        guardianBirthDate,
        setGuardianBirthDate,
        guardianBirthDateError,
        setGuardianBirthDateError,
        guardianBirthDateProblem,
    )
    const documentNumberField = checkedField(
        "guardian-document-number",
        documentNumber,
        setDocumentNumber,
        documentNumberError,
        setDocumentNumberError,
        documentNumberProblem,
    )
    const documentIssuedAtField = checkedField(
        "guardian-document-issued-at",
        documentIssuedAt,
        setDocumentIssuedAt,
        documentIssuedAtError,
        setDocumentIssuedAtError,
        documentIssuedAtProblem,
    )
    const emailField = checkedField(
        "guardian-email",
        email,
        setEmail,
        emailError,
        setEmailError,
        emailProblem,
    )
    const phoneField = checkedField(
        "guardian-phone",
        phone,
        setPhone,
        phoneError,
        setPhoneError,
        phoneProblem,
    )
    const passwordField = checkedField(
        "guardian-password",
        password,
        setPassword,
        passwordError,
        setPasswordError,
        passwordProblem,
    )
    const passwordConfirmationField = checkedField(
        "guardian-password-confirmation",
        passwordConfirmation,
        setPasswordConfirmation,
        passwordConfirmationError,
        setPasswordConfirmationError,
        passwordConfirmationProblem,
    )
    const studentFirstNameField = checkedField(
        "student-first-name",
        studentFirstName,
        setStudentFirstName,
        studentFirstNameError,
        setStudentFirstNameError,
        studentFirstNameProblem,
    )
    const studentLastNameField = checkedField(
        "student-last-name",
        studentLastName,
        setStudentLastName,
        studentLastNameError,
        setStudentLastNameError,
        studentLastNameProblem,
    )
    const studentBirthDateField = checkedField(
        "student-date-of-birth",
        birthDate,
        setBirthDate,
        studentBirthDateError,
        setStudentBirthDateError,
        studentBirthDateProblem,
    )

    return (
        <main className={styles.page}>
            {/* The rings of the landing and the login's panel, one set at
                the top and another at the end of the form. */}
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
                                <p className={styles.noticeHeading}>
                                    Indicaciones iniciales:
                                </p>
                                <p className={styles.noticeText}>
                                    En este apartado se realizará el registro de
                                    tu cuenta dentro de IRIS, por lo que es
                                    importante que tengas a la mano tus datos
                                    personales. Además, como parte de este
                                    registro, en el paso 2 será necesario
                                    inscribir a tu hijo o hija (o al menor a tu
                                    cargo), así que ten también sus datos listos
                                    para registrarlo dentro de IRIS.
                                </p>
                                <p className={styles.noticeText}>
                                    En total son 4 pasos: los dos primeros para
                                    ingresar tus datos y los de tu hijo o hija,
                                    y los dos últimos para confirmar que todos
                                    los datos estén correctos antes de crear la
                                    cuenta.
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
                                    Para proteger el acceso al Portal de Padres,
                                    IRIS usa autenticación de dos factores (2FA)
                                    mediante una aplicación autenticadora
                                    (basada en TOTP), además de tu contraseña.
                                </p>
                                <p className={styles.noticeText}>
                                    Te recomendamos tener instalada en tu
                                    celular una aplicación como Google
                                    Authenticator, Microsoft Authenticator o
                                    Authy, ya que la necesitarás para activar
                                    esta protección.
                                </p>
                            </div>
                        </div>
                        <p className={styles.subtitle}>
                            Paso 1 de 4 — Datos de quien acompaña al estudiante
                            (Tutor, papá o mamá).
                        </p>
                        <TextField
                            {...guardianFirstNameField}
                            label="Nombres"
                            required
                            autoComplete="given-name"
                        />
                        <TextField
                            {...guardianLastNameField}
                            label="Apellidos"
                            required
                            autoComplete="family-name"
                        />
                        <TextField
                            {...guardianBirthDateField}
                            label="Fecha de nacimiento"
                            type="date"
                            onChange={(value) => {
                                guardianBirthDateField.onChange(value)
                                // The issued date can't be before the birth date, so
                                // if it was already checked it's checked again here.
                                if (touched["guardian-document-issued-at"]) {
                                    setDocumentIssuedAtError(
                                        documentIssuedAtProblem(documentIssuedAt, value),
                                    )
                                }
                            }}
                            required
                            max={TODAY_ISO}
                        />
                        <PortalSelect
                            id="guardian-document-type"
                            label="Tipo de documento"
                            value={documentType}
                            onChange={(value) => {
                                setDocumentType(value)
                                setDocumentTypeError(null)
                                // Switching type can turn a number that was fine a moment
                                // ago into a wrong one (e.g. a passport's letters, once you
                                // switch to cédula), so a number already checked is checked
                                // again against the new type.
                                if (touched["guardian-document-number"]) {
                                    const nextDocumentType =
                                        documentTypesQuery.data?.find(
                                            (dt) => String(dt.id) === value,
                                        )
                                    setDocumentNumberError(
                                        documentNumberProblem(
                                            documentNumber,
                                            nextDocumentType?.name,
                                        ),
                                    )
                                }
                            }}
                            options={(documentTypesQuery.data ?? []).map(
                                (dt) => ({
                                    value: String(dt.id),
                                    label: dt.name,
                                }),
                            )}
                            error={documentTypeError ?? undefined}
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
                            min={guardianBirthDate || undefined}
                            max={TODAY_ISO}
                        />
                        <TextField
                            {...emailField}
                            label="Correo electrónico"
                            type="email"
                            required
                            autoComplete="email"
                        />
                        <PhoneField
                            {...phoneField}
                            label="Teléfono"
                            required
                        />
                        <PortalSelect
                            id="guardian-relationship"
                            label="Relación con el estudiante"
                            value={relationship}
                            onChange={(value) => {
                                setRelationship(value)
                                setRelationshipError(null)
                            }}
                            options={(relationshipTypesQuery.data ?? []).map(
                                (rt) => ({
                                    value: String(rt.id),
                                    label: rt.name,
                                }),
                            )}
                            error={relationshipError ?? undefined}
                            required
                            disabled={relationshipTypesQuery.isLoading}
                        />
                        <TextField
                            {...passwordField}
                            label="Contraseña"
                            type="password"
                            onChange={(value) => {
                                passwordField.onChange(value)
                                // The confirmation has to match the new one, so if it
                                // was already checked it's checked again.
                                if (touched["guardian-password-confirmation"]) {
                                    setPasswordConfirmationError(
                                        passwordConfirmationProblem(
                                            passwordConfirmation,
                                            value,
                                        ),
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
                        {catalogsFailed && (
                            <p
                                role="alert"
                                className={styles.error}
                            >
                                No pudimos cargar los tipos de documento y
                                relación. Verifica tu conexión e intenta de
                                nuevo.
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

                {step === 1 && phase === "confirmacion" && (
                    <RegistrationConfirmation
                        stepLabel="Paso 3 de 4 — Confirmación: Tutor, papá o mamá."
                        greeting={
                            <>
                                ¡Hola <strong>{guardianFirstName}</strong>!
                                Gracias por tomarte el tiempo de completar tus
                                datos. Significa mucho que quieras hacer parte
                                de la comunidad IRIS.
                            </>
                        }
                        items={guardianSummary}
                        onEdit={() => setPhase("formulario")}
                        onConfirm={() => {
                            setStep(2)
                            setPhase("confirmacion")
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
                                <p className={styles.noticeHeading}>
                                    Indicaciones de esta sección:
                                </p>
                                <p className={styles.noticeText}>
                                    Aquí vas a completar los datos de tu hijo o
                                    hija (o del menor a tu cargo): su nombre,
                                    apellidos y fecha de nacimiento. Además, vas
                                    a elegir su avatar. Por último, vas a definir
                                    el PIN con el que podrá ingresar a su propio
                                    perfil dentro de IRIS.
                                </p>
                                <p className={styles.noticeText}>
                                    IRIS no te pide datos de salud de tu hijo o
                                    hija, como un diagnóstico o una condición:
                                    para usar IRIS no hacen falta.
                                </p>
                            </div>
                        </div>
                        <p className={styles.subtitle}>
                            Paso 2 de 4 — Perfil de estudiante.
                        </p>
                        <TextField
                            {...studentFirstNameField}
                            label="Nombres"
                            required
                            autoComplete="off"
                        />
                        <TextField
                            {...studentLastNameField}
                            label="Apellidos"
                            required
                            autoComplete="off"
                        />
                        <TextField
                            {...studentBirthDateField}
                            label="Fecha de nacimiento"
                            type="date"
                            required
                            max={TODAY_ISO}
                        />
                        <div className={fieldStyles.field}>
                            <label
                                className={fieldStyles.label}
                                id="student-avatar-label"
                            >
                                Avatar de tu hijo o hija
                            </label>
                            <div
                                className={styles.avatarGrid}
                                role="radiogroup"
                                aria-labelledby="student-avatar-label"
                            >
                                {(avatarsQuery.data ?? []).map((option) => {
                                    const isSelected =
                                        avatarId === String(option.id)
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            aria-label={option.name}
                                            className={`${styles.avatarOption} ${isSelected ? styles.avatarOptionSelected : ""}`}
                                            onClick={() =>
                                                setAvatarId(String(option.id))
                                            }
                                        >
                                            <StudentAvatarImage
                                                avatarId={option.id}
                                                size="large"
                                                label={option.name}
                                            />
                                        </button>
                                    )
                                })}
                            </div>
                            {avatarsFailed && (
                                <p
                                    role="alert"
                                    className={styles.error}
                                >
                                    No pudimos cargar los avatares. Verifica tu
                                    conexión e intenta de nuevo.
                                </p>
                            )}
                        </div>
                        <CheckboxField
                            id="student-consent"
                            checked={acceptsDataProcessing}
                            onChange={(checked) => {
                                setAcceptsDataProcessing(checked)
                                setAcceptsDataProcessingError(null)
                            }}
                            error={acceptsDataProcessingError ?? undefined}
                            required
                        >
                            Acepto el tratamiento de mis datos y los de mi
                            hijo/a para el uso de IRIS, conforme a nuestro{" "}
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

                        <p
                            id="student-pin-section"
                            className={styles.notice}
                        >
                            <IconInfo className={styles.noticeIcon} />
                            Este PIN lo usará tu hijo o hija para ingresar a su
                            propio perfil dentro de IRIS.
                        </p>
                        {pinSubstep === "listo" ? (
                            <div className={styles.pinReady}>
                                <p className={styles.pinReadyText}>
                                    <IconCheck className={styles.checkIcon} />
                                    PIN confirmado
                                </p>
                                <button
                                    type="button"
                                    className={styles.textLink}
                                    onClick={resetPin}
                                >
                                    Cambiar PIN
                                </button>
                            </div>
                        ) : (
                            <div className={styles.pinSection}>
                                <p className={styles.subtitle}>
                                    {pinSubstep === "ingresar"
                                        ? "Define un PIN de 4 dígitos"
                                        : "Vuelve a escribir el mismo PIN"}
                                </p>
                                <NumericKeypad
                                    value={pinDraft}
                                    onChange={setPinDraft}
                                    onConfirm={
                                        pinSubstep === "ingresar"
                                            ? handleFirstPinEntry
                                            : handleSecondPinEntry
                                    }
                                    maxLength={4}
                                    minLength={4}
                                    mask
                                    compact
                                    numericFont="body"
                                />
                            </div>
                        )}
                        {pinError && (
                            <p
                                role="alert"
                                className={styles.error}
                            >
                                {pinError}
                            </p>
                        )}

                        <div className={styles.buttonRow}>
                            <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={handleGoBackToStep1}
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

                {step === 2 && phase === "confirmacion" && (
                    <RegistrationConfirmation
                        stepLabel="Paso 4 de 4 — Confirmación: Tu niño o niña."
                        greeting={
                            <>
                                Ahora vamos a revisar los datos de tu peque.
                                Esperamos que{" "}
                                <strong>{studentFirstName}</strong> esté muy
                                emocionado o emocionada por formar parte de la
                                comunidad IRIS.
                            </>
                        }
                        avatarPreview={
                            avatarId && (
                                <StudentAvatarImage
                                    avatarId={Number(avatarId)}
                                    size="large"
                                    label="Avatar elegido"
                                />
                            )
                        }
                        items={studentSummary}
                        onEdit={() => setPhase("formulario")}
                        onConfirm={confirmAndCreateAccount}
                        loading={register.isPending}
                        confirmLabel="Confirmar y crear cuenta"
                        error={submitError}
                    />
                )}
            </div>
        </main>
    )
}
