import { useEffect, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowRight, BookOpen, HeartHandshake, Quote } from "lucide-react"
import { useAuth } from "@/shared/auth/useAuth"
import { useLogin } from "@/shared/api/hooks/useAuthApi"
import { decodeJwtPayload } from "@/shared/auth/jwt"
import { getAuthErrorMessage } from "./errors"
import { TextField } from "./ui/TextField"
import { IconArrowLeft, IconInfo } from "@/shared/ui/icons"
import { IrisRings } from "@/shared/ui/IrisRings"
import { usePortalTheme } from "@/shared/ui/portal/usePortalTheme"
import { SuccessNotice } from "@/shared/ui/SuccessNotice"
import { clearLoginNotice, peekLoginNotice, type LoginNotice } from "@/shared/ui/loginNotice"
import logoIris from "@/assets/landing/logo-iris.png"
import styles from "./AdultAuthPage.module.css"

type View = "login" | "register"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The login of families and teachers with the look of the landing: its blue
// panel on the left and the form in a white card of the portals. Each view
// has its own route (/login and /register), so the browser's back button and
// a shared link both work.
export default function AdultAuthPage({ view }: { view: View }) {
    usePortalTheme()
    const location = useLocation()

    // One time message left by another screen, e.g. after changing the
    // password (see shared/ui/loginNotice.ts). It's deleted once shown, so
    // reloading the page doesn't bring it back.
    const [successNotice, setSuccessNotice] = useState<LoginNotice | null>(peekLoginNotice)
    useEffect(() => {
        clearLoginNotice()
    }, [])

    // Another screen can leave a notice in the state. Anything could be in
    // the history, so it's only shown if it's really a text.
    const { aviso } = (location.state ?? {}) as { aviso?: unknown }
    return (
        <main className={styles.page}>
            {successNotice && (
                <SuccessNotice
                    title={successNotice.title}
                    message={successNotice.message}
                    onClose={() => setSuccessNotice(null)}
                />
            )}
            <BrandPanel />
            <div className={styles.formColumn}>
                {view === "register" ? (
                    <Link
                        to="/login"
                        className={styles.back}
                    >
                        <IconArrowLeft /> Volver atrás
                    </Link>
                ) : (
                    <Link
                        to="/"
                        className={styles.back}
                    >
                        <IconArrowLeft /> Volver al inicio
                    </Link>
                )}

                {/* The key plays the card's entrance again when the view changes. */}
                <div
                    key={view}
                    className={styles.card}
                    data-view={view}
                >
                    {view === "login" ? (
                        <LoginForm notice={typeof aviso === "string" ? aviso : undefined} />
                    ) : (
                        <ChooseAccountType />
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

// The blue panel of the landing. The logo sits in the middle like the pupil
// of an iris: the rings open around it and an amber ring fills once, like
// the kid's cursor when it holds the gaze on an option.
function BrandPanel() {
    return (
        <aside className={styles.brandPanel}>
            <p className={styles.brandEyebrow}>
                Sistema de gestión del aprendizaje <span className={styles.lms}>LMS</span>
            </p>

            <div className={styles.brandCenter}>
                <div className={styles.pupil}>
                    <IrisRings className={styles.rings} />
                    <span
                        className={styles.glow}
                        aria-hidden="true"
                    />
                    <img
                        src={logoIris}
                        alt=""
                        className={styles.brandLogo}
                    />
                    <svg
                        className={styles.dwellRing}
                        viewBox="0 0 100 100"
                        aria-hidden="true"
                    >
                        <circle
                            className={styles.dwellTrack}
                            cx="50"
                            cy="50"
                            r="47"
                        />
                        <circle
                            className={styles.dwellFill}
                            cx="50"
                            cy="50"
                            r="47"
                            pathLength={1}
                        />
                    </svg>
                </div>
                <p className={styles.brandWordmark}>IRIS</p>
                <p className={styles.brandSlogan}>
                    Tu{" "}
                    <span className={styles.marked}>
                        mirada.
                        <svg
                            className={styles.underline}
                            viewBox="0 0 200 22"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                        >
                            <path d="M4 14 C 50 6, 120 4, 196 9" />
                            <path d="M30 19 C 80 13, 130 12, 170 15" />
                        </svg>
                    </span>{" "}
                    <br />
                    Tu forma de aprender.
                </p>
                <p className={styles.brandDescription}>
                    Un aula virtual donde los niños y niñas aprenden con la
                    mirada, y su familia y sus docentes los acompañan.
                </p>
            </div>

            <figure className={styles.message}>
                <Quote
                    className={styles.messageQuote}
                    size={22}
                    strokeWidth={2.4}
                    aria-hidden="true"
                />
                <blockquote className={styles.messageText}>
                    Con IRIS, basta una mirada para que cada niño y niña
                    aprenda y participe en su clase.
                </blockquote>
                <figcaption className={styles.messageAuthor}>Equipo IRIS</figcaption>
            </figure>
        </aside>
    )
}

function LoginForm({ notice }: { notice?: string }) {
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
            const isGuardian = decodeJwtPayload(tokens.access_token)?.role === "guardian"
            navigate(isGuardian ? "/login/guardian/portal" : "/teacher/portal", { replace: true })
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
            <p className={styles.eyebrow}>Familias y docentes</p>
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
                id="adult-login-email"
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
                    id="adult-login-password"
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
                <ArrowRight
                    size={18}
                    strokeWidth={2.4}
                    aria-hidden="true"
                />
            </button>
            <p className={styles.formFooter}>
                ¿Aún no tienes cuenta?{" "}
                <Link
                    to="/register"
                    className={styles.secondaryLink}
                >
                    Regístrate
                </Link>
            </p>
        </form>
    )
}

// The two kinds of account, numbered like the steps of the landing.
const ACCOUNT_TYPES = [
    {
        to: "/register/guardian",
        number: "01",
        title: "Soy tutor, papá o mamá",
        note: "Crea tu cuenta y la de tu hijo o hija, acompaña su aprendizaje y sigue de cerca su progreso dentro de IRIS.",
        icon: HeartHandshake,
    },
    {
        to: "/register/teacher",
        number: "02",
        title: "Soy docente",
        note: "Crea clases organizadas en unidades y lecciones para aprender con la mirada, y guía el progreso de tus estudiantes.",
        icon: BookOpen,
    },
]

function ChooseAccountType() {
    return (
        <div className={styles.form}>
            <p className={styles.eyebrow}>Familias y docentes</p>
            <h1 className={styles.title}>Crea tu cuenta</h1>
            <p className={styles.subtitle}>
                Cuéntanos cómo vas a usar IRIS para llevarte al registro
                correcto.
            </p>
            <div className={styles.registrationOptions}>
                {ACCOUNT_TYPES.map(({ to, number, title, note, icon: Icon }) => (
                    <Link
                        key={to}
                        to={to}
                        className={styles.registrationOption}
                    >
                        <span
                            className={styles.registrationOptionIcon}
                            aria-hidden="true"
                        >
                            <Icon
                                size={24}
                                strokeWidth={2.1}
                            />
                            <span className={styles.registrationOptionNumber}>{number}</span>
                        </span>
                        <span className={styles.registrationOptionText}>
                            <span className={styles.registrationOptionTitle}>{title}</span>
                            <span className={styles.registrationOptionNote}>{note}</span>
                        </span>
                        <span
                            className={styles.registrationOptionArrow}
                            aria-hidden="true"
                        >
                            <ArrowRight
                                size={18}
                                strokeWidth={2.4}
                            />
                        </span>
                    </Link>
                ))}
            </div>
            <p className={styles.formFooter}>
                ¿Ya tienes cuenta?{" "}
                <Link
                    to="/login"
                    className={styles.secondaryLink}
                >
                    Inicia sesión
                </Link>
            </p>
        </div>
    )
}
