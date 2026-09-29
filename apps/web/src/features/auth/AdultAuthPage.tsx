import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/shared/auth/AuthContext"
import { useLogin } from "@/shared/api/hooks/useAuthApi"
import { decodeJwtPayload } from "@/shared/auth/jwt"
import { getAuthErrorMessage } from "./errors"
import { TextField } from "./ui/TextField"
import { IrisMark } from "@/shared/ui/IrisMark"
import { IconArrowLeft, IconInfo } from "@/shared/ui/icons"
import logoIris from "@/assets/landing/logo-iris.png"
import iconGuardian from "@/assets/auth/avatar-guardian.png"
import iconTeacher from "@/assets/auth/avatar-teacher.png"
import styles from "./AdultAuthPage.module.css"

type View = "login" | "elegirRegistro"
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AdultAuthPage() {
    const location = useLocation()

    const [view, setView] = useState<View>(
        (location.state as { vista?: View } | null)?.vista ?? "login",
    )
    return (
        <main className={styles.page}>
            <BrandPanel />
            <div className={styles.formColumn}>
                {view === "elegirRegistro" ? (
                    <button
                        type="button"
                        className={styles.back}
                        onClick={() => setView("login")}
                    >
                        <IconArrowLeft /> Volver atrás
                    </button>
                ) : (
                    <Link
                        to="/"
                        className={styles.back}
                    >
                        <IconArrowLeft /> Volver al inicio
                    </Link>
                )}

                <div className={styles.formWrapper}>
                    {view === "login" ? (
                        <LoginForm
                            onGoToRegister={() => setView("elegirRegistro")}
                            notice={
                                (location.state as { aviso?: string } | null)
                                    ?.aviso
                            }
                        />
                    ) : (
                        <ChooseAccountType
                            onBackToLogin={() => setView("login")}
                        />
                    )}
                </div>
                <p className={styles.minorNotice}>
                    <IconInfo className={styles.minorNoticeIcon} />
                    Todo menor de edad debe contar con el acompañamiento de su
                    madre, padre, tutor o adulto responsable al registrarse e
                    ingresar a IRIS.
                </p>
            </div>
        </main>
    )
}

function BrandPanel() {
    return (
        <aside className={styles.brandPanel}>
            <IrisMark
                size={420}
                className={`${styles.ring} ${styles.ringLarge}`}
            />
            <IrisMark
                size={220}
                className={`${styles.ring} ${styles.ringSmall}`}
            />
            <div className={styles.brandContent}>
                <img
                    src={logoIris}
                    alt=""
                    className={styles.brandLogo}
                />
                <p className={styles.brandWordmark}>IRIS</p>
                <span
                    className={styles.brandRule}
                    aria-hidden="true"
                />
                <p className={styles.brandSlogan}>
                    Tu mirada. Tu forma de aprender.
                </p>
                <p className={styles.brandDescription}>
                    Tecnología educativa accesible mediante seguimiento de la
                    mirada.
                </p>
            </div>
        </aside>
    )
}

function LoginForm({
    onGoToRegister,
    notice,
}: {
    onGoToRegister: () => void
    notice?: string
}) {
    const { setSession } = useAuth()
    const navigate = useNavigate()
    const login = useLogin()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [emailTouched, setEmailTouched] = useState(false)
    const [passwordTouched, setPasswordTouched] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showRecoveryNotice, setShowRecoveryNotice] = useState(false)
    const emailValid = EMAIL_PATTERN.test(email.trim())
    const passwordValid = password.length > 0
    async function handleSubmit(event: FormEvent) {
        event.preventDefault()
        setEmailTouched(true)
        setPasswordTouched(true)
        if (!emailValid || !passwordValid) return
        setError(null)
        try {
            const tokens = await login.mutateAsync({
                email: email.trim(),
                password,
            })
            setSession(tokens)
            navigate(
                decodeJwtPayload(tokens.access_token)?.role === "guardian"
                    ? "/login/guardian/portal"
                    : "/teacher/home",
                { replace: true },
            )
        } catch (reason) {
            setError(getAuthErrorMessage(reason))
        }
    }
    return (
        <form
            className={styles.form}
            onSubmit={handleSubmit}
            noValidate
            aria-label="Iniciar sesión"
        >
            <p className={styles.accessEyebrow}>
                Acceso para padres, madres, tutores, adultos responsables y
                docentes
            </p>
            <h1 className={styles.title}>Iniciar sesión</h1>
            {notice && (
                <p
                    role="status"
                    className={styles.recoveryNotice}
                >
                    {notice}
                </p>
            )}
            <TextField
                id="adulto-login-correo"
                label="Correo electrónico"
                type="email"
                value={email}
                onChange={setEmail}
                onBlur={() => setEmailTouched(true)}
                error={
                    emailTouched && !emailValid
                        ? "Escribe un correo electrónico válido."
                        : undefined
                }
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
                    error={
                        passwordTouched && !passwordValid
                            ? "Escribe tu contraseña."
                            : undefined
                    }
                    required
                    autoComplete="current-password"
                />
                <button
                    type="button"
                    className={styles.forgotLink}
                    onClick={() => setShowRecoveryNotice((value) => !value)}
                >
                    ¿Olvidaste tu contraseña?
                </button>
                {showRecoveryNotice && (
                    <p
                        role="status"
                        className={styles.recoveryNotice}
                    >
                        La recuperación de contraseña estará disponible pronto.
                        Mientras tanto, verifica que estés escribiendo el correo
                        correcto.
                    </p>
                )}
            </div>
            {error && (
                <p
                    role="alert"
                    className={styles.error}
                >
                    {error}
                </p>
            )}
            <button
                type="submit"
                className={styles.primaryButton}
                disabled={!emailValid || !passwordValid || login.isPending}
            >
                {login.isPending ? "Ingresando…" : "Ingresar"}
            </button>
            <p className={styles.formFooter}>
                ¿Aún no tienes cuenta?{" "}
                <button
                    type="button"
                    className={styles.secondaryLink}
                    onClick={onGoToRegister}
                >
                    Regístrate
                </button>
            </p>
        </form>
    )
}

function ChooseAccountType({ onBackToLogin }: { onBackToLogin: () => void }) {
    return (
        <div className={styles.form}>
            <p className={styles.accessEyebrow}>
                Acceso para padres, madres, tutores, adultos responsables y
                docentes
            </p>
            <h1 className={styles.title}>Crea tu cuenta</h1>
            <p className={styles.subtitle}>
                Cuéntanos cómo vas a usar IRIS para llevarte al registro
                correcto.
            </p>
            <div className={styles.registrationOptions}>
                <Link
                    to="/login/guardian/new"
                    className={styles.registrationOption}
                >
                    <span className={styles.registrationOptionText}>
                        <span className={styles.registrationOptionTitle}>
                            Soy tutor, papá o mamá
                        </span>
                        <span className={styles.registrationOptionNote}>
                            Crea la cuenta de tu hijo o hija, acompaña su
                            aprendizaje y sigue de cerca su progreso dentro de
                            IRIS.
                        </span>
                    </span>
                    <img
                        src={iconGuardian}
                        alt=""
                        className={styles.registrationOptionIcon}
                    />
                </Link>
                <Link
                    to="/login/teacher/new"
                    className={styles.registrationOption}
                >
                    <span className={styles.registrationOptionText}>
                        <span className={styles.registrationOptionTitle}>
                            Soy docente
                        </span>
                        <span className={styles.registrationOptionNote}>
                            Diseña aulas y lecciones pensadas para el
                            aprendizaje por mirada, y guía el progreso de tus
                            estudiantes.
                        </span>
                    </span>
                    <img
                        src={iconTeacher}
                        alt=""
                        className={styles.registrationOptionIcon}
                    />
                </Link>
            </div>
            <p className={styles.formFooter}>
                ¿Ya tienes cuenta?{" "}
                <button
                    type="button"
                    className={styles.secondaryLink}
                    onClick={onBackToLogin}
                >
                    Inicia sesión
                </button>
            </p>
        </div>
    )
}
