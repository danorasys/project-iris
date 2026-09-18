import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { TeacherRegistrationRequest } from "@iris/shared-types"
import { useAuth } from "@/shared/auth/AuthContext"
import {
    useDocumentTypes,
    useRegistrarDocente,
} from "@/shared/api/hooks/useAuthApi"
import { getAuthErrorMessage } from "@/features/auth/errors"
import { TextField } from "@/features/auth/ui/TextField"
import { SelectField } from "@/features/auth/ui/SelectField"
import {
    PasswordRequirements,
    passwordMeetsRequirements,
} from "@/features/auth/ui/PasswordRequirements"
import {
    DOCUMENT_TYPE_NAME_PASSPORT,
    documentNumberFormatError,
    filterDocumentNumberInput,
} from "@/features/auth/lib/documentNumber"
import { IrisMark } from "@/shared/ui/IrisMark"
import { IconArrowLeft, IconInfo, IconLock } from "@/shared/ui/icons"
import { LoadingScreen } from "@/shared/ui/LoadingScreen"
import logoIris from "@/assets/landing/logo-iris.png"
import styles from "./GuardianRegistrationWizard.module.css"
import { calculateAge } from "@/features/utils/calculateAge"
import { formatDate } from "@/features/utils/formatDate"
//import { validateDocumentIssuedAt } from "@/features/utils/validateDocumentIssuedAt"

const MINIMUM_TEACHER_AGE = 18
const TODAY_ISO = new Date().toISOString().slice(0, 10)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Phase = "formulario" | "confirmacion" | "cargando"
interface SummaryItem {
    label: string
    value: string
}

function focusAndScrollToField(fieldId: string): void {
    const field = document.getElementById(fieldId)
    if (!field) return
    field.focus({ preventScroll: true })
    const rect = field.getBoundingClientRect()
    window.scrollTo({
        top: Math.max(
            rect.top +
                window.scrollY -
                window.innerHeight / 2 +
                rect.height / 2,
            0,
        ),
        behavior: "smooth",
    })
}

function ConfirmationScreen({
    items,
    greeting,
    onEdit,
    onConfirm,
    error,
    loading,
}: {
    items: SummaryItem[]
    greeting: ReactNode
    onEdit: () => void
    onConfirm: () => void
    error: string | null
    loading: boolean
}) {
    return (
        <div className={styles.confirmation}>
            <p className={styles.subtitle}>
                Paso 2 de 2 — Confirmación de tus datos.
            </p>
            <div className={styles.mascotRow}>
                <img
                    src={logoIris}
                    alt=""
                    className={styles.mascotLogo}
                />
                <div className={styles.bubble}>
                    <p>{greeting}</p>
                </div>
            </div>
            <dl className={styles.summaryList}>
                {items.map((item) => (
                    <div
                        key={item.label}
                        className={styles.summaryRow}
                    >
                        <dt className={styles.summaryLabel}>{item.label}</dt>
                        <dd className={styles.summaryValue}>{item.value}</dd>
                    </div>
                ))}
            </dl>
            <p className={styles.question}>
                ¿Confirmas que estos datos son correctos?
            </p>
            {error && (
                <p
                    role="alert"
                    className={styles.error}
                >
                    {error}
                </p>
            )}
            <div className={styles.buttonRow}>
                <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={onEdit}
                    disabled={loading}
                >
                    Corregir
                </button>
                <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={onConfirm}
                    disabled={loading}
                >
                    {loading ? "Creando cuenta…" : "Crear cuenta"}
                </button>
            </div>
        </div>
    )
}

/** Uses the guardian wizard's visual shell and confirmation pattern, but only
 * collects the fields supported by the teacher registration endpoint. */
export default function TeacherRegistrationWizard() {
    const navigate = useNavigate()
    const { setSession } = useAuth()
    const register = useRegistrarDocente()
    const documentTypesQuery = useDocumentTypes()
    const [phase, setPhase] = useState<Phase>("formulario")
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [documentType, setDocumentType] = useState("")
    const [documentNumber, setDocumentNumber] = useState("")
    const [dateOfBirth, setDateOfBirth] = useState("")
    const [email, setEmail] = useState("")
    const [phone, setPhone] = useState("")
    const [password, setPassword] = useState("")
    const [passwordConfirmation, setPasswordConfirmation] = useState("")
    const [institution, setInstitution] = useState("")
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [submitError, setSubmitError] = useState<string | null>(null)

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
    const clearError = (field: string) =>
        setErrors((current) => {
            const next = { ...current }
            delete next[field]
            return next
        })

    function validateAndContinue(event: FormEvent) {
        event.preventDefault()
        const checks: Array<[string, string, string]> = [
            [
                "docente-nombres",
                firstName.trim() ? "" : "Ingresa tus nombres.",
                "firstName",
            ],
            [
                "docente-apellidos",
                lastName.trim() ? "" : "Ingresa tus apellidos.",
                "lastName",
            ],
            [
                "docente-fecha-nacimiento",
                !dateOfBirth
                    ? "Ingresa tu fecha de nacimiento."
                    : calculateAge(dateOfBirth) < MINIMUM_TEACHER_AGE
                      ? `Debes ser mayor de edad (${MINIMUM_TEACHER_AGE} años o más) para registrarte como docente.`
                      : "",
                "dateOfBirth",
            ],
            [
                "docente-tipo-documento",
                documentType ? "" : "Selecciona un tipo de documento.",
                "documentType",
            ],
            [
                "docente-numero-documento",
                !documentNumber.trim()
                    ? "Ingresa tu número de documento."
                    : (documentNumberFormatError(
                          selectedDocumentType?.name,
                          documentNumber,
                      ) ?? ""),
                "documentNumber",
            ],
            [
                "docente-correo",
                EMAIL_PATTERN.test(email.trim())
                    ? ""
                    : "Ingresa un correo electrónico válido.",
                "email",
            ],
            [
                "docente-telefono",
                phone.length === 10
                    ? ""
                    : "Ingresa un número telefónico válido de 10 dígitos.",
                "phone",
            ],
            [
                "docente-password",
                passwordMeetsRequirements(password)
                    ? ""
                    : "Ingresa una contraseña que cumpla con todos los requisitos indicados abajo.",
                "password",
            ],
            [
                "docente-password-confirmacion",
                !passwordConfirmation
                    ? "Ingresa la confirmación de la contraseña."
                    : password === passwordConfirmation
                      ? ""
                      : "Las contraseñas no coinciden.",
                "passwordConfirmation",
            ],
            [
                "docente-institucion",
                institution.trim() ? "" : "Ingresa tu institución.",
                "institution",
            ],
        ]
        const invalid = checks.find(([, message]) => message)
        if (invalid) {
            setErrors(
                Object.fromEntries(
                    checks
                        .filter(([, message]) => message)
                        .map(([, message, field]) => [field, message]),
                ),
            )
            focusAndScrollToField(invalid[0])
            return
        }
        setErrors({})
        setSubmitError(null)
        setPhase("confirmacion")
    }

    async function createAccount() {
        setSubmitError(null)
        setPhase("cargando")
        const payload: TeacherRegistrationRequest = {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            document_type_id: Number(documentType),
            document_number: documentNumber.trim(),
            date_of_birth: dateOfBirth,
            email: email.trim(),
            password,
            phone: phone.trim(),
            institution: institution.trim(),
        }
        try {
            const tokens = await register.mutateAsync(payload)
            setSession(tokens)
            navigate("/teacher/home", { replace: true })
        } catch (error) {
            setSubmitError(getAuthErrorMessage(error))
            setPhase("confirmacion")
        }
    }

    if (phase === "cargando")
        return <LoadingScreen message="Creando tu cuenta" />
    const summary: SummaryItem[] = [
        { label: "Nombres", value: firstName },
        { label: "Apellidos", value: lastName },
        { label: "Fecha de nacimiento", value: formatDate(dateOfBirth) },
        {
            label: "Tipo de documento",
            value: selectedDocumentType?.name ?? documentType,
        },
        { label: "Número de documento", value: documentNumber },
        { label: "Correo electrónico", value: email },
        { label: "Teléfono", value: phone },
        { label: "Institución", value: institution },
    ]

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
                        : "Crear cuenta: Docente"}
                </h1>
                {phase === "formulario" && (
                    <>
                        <ul
                            className={styles.stepIndicators}
                            aria-label="Progreso del registro"
                        >
                            <li>
                                <span
                                    className={`${styles.stepIndicator} ${styles.stepIndicatorActive}`}
                                />
                            </li>
                            <li>
                                <span className={styles.stepIndicator} />
                            </li>
                        </ul>
                        <form
                            className={styles.form}
                            onSubmit={validateAndContinue}
                            noValidate
                            aria-label="Datos del docente, paso 1 de 2"
                        >
                            <div className={styles.notice}>
                                <IconInfo className={styles.noticeIcon} />
                                <div>
                                    <p className={styles.noticeHeading}>
                                        Indicaciones iniciales:
                                    </p>
                                    <p className={styles.noticeText}>
                                        Completa tus datos personales y los de
                                        tu institución. En el siguiente paso
                                        podrás confirmarlos antes de crear tu
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
                                        Usa una contraseña segura y no la
                                        compartas con otras personas.
                                    </p>
                                </div>
                            </div>
                            <p className={styles.subtitle}>
                                Paso 1 de 2 — Datos de tu cuenta de docente.
                            </p>
                            <TextField
                                id="docente-nombres"
                                label="Nombres"
                                value={firstName}
                                onChange={(value) => {
                                    setFirstName(value)
                                    clearError("firstName")
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
                                    clearError("lastName")
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
                                    clearError("dateOfBirth")
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
                                    clearError("documentType")
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
                                    setDocumentNumber(
                                        filterDocumentNumberInput(
                                            selectedDocumentType?.name,
                                            value,
                                        ),
                                    )
                                    clearError("documentNumber")
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
                                id="docente-correo"
                                label="Correo electrónico"
                                type="email"
                                value={email}
                                onChange={(value) => {
                                    setEmail(value)
                                    clearError("email")
                                }}
                                error={errors.email}
                                required
                                autoComplete="email"
                            />
                            <TextField
                                id="docente-telefono"
                                label="Teléfono"
                                type="tel"
                                value={phone}
                                onChange={(value) => {
                                    setPhone(
                                        value.replace(/\D/g, "").slice(0, 10),
                                    )
                                    clearError("phone")
                                }}
                                error={errors.phone}
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
                                    setPassword(value)
                                    clearError("password")
                                    clearError("passwordConfirmation")
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
                                    clearError("passwordConfirmation")
                                }}
                                error={errors.passwordConfirmation}
                                required
                                autoComplete="new-password"
                            />
                            <TextField
                                id="docente-institucion"
                                label="Institución"
                                value={institution}
                                onChange={(value) => {
                                    setInstitution(value)
                                    clearError("institution")
                                }}
                                error={errors.institution}
                                required
                                autoComplete="organization"
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
                                    disabled={
                                        documentTypesQuery.isLoading ||
                                        documentTypesQuery.isError
                                    }
                                >
                                    {documentTypesQuery.isLoading
                                        ? "Cargando…"
                                        : "Siguiente"}
                                </button>
                            </div>
                        </form>
                    </>
                )}
                {phase === "confirmacion" && (
                    <ConfirmationScreen
                        items={summary}
                        greeting={
                            <>
                                ¡Hola <strong>{firstName}</strong>! Gracias por
                                completar tus datos. Ya casi podrás crear aulas
                                y acompañar el aprendizaje de tus estudiantes.
                            </>
                        }
                        onEdit={() => {
                            setSubmitError(null)
                            setPhase("formulario")
                        }}
                        onConfirm={createAccount}
                        error={submitError}
                        loading={register.isPending}
                    />
                )}
            </div>
        </main>
    )
}
