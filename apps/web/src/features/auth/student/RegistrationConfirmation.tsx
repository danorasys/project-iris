import type { ReactNode } from "react"
import logoIris from "@/assets/landing/logo-iris.png"
import styles from "./GuardianRegistrationWizard.module.css"

export interface SummaryItem {
    label: string
    value: string
}

/** Confirmation screen of the registration wizards (guardian and teacher).
 * The IRIS mascot thanks the user and shows a summary of what was just
 * entered, never the password or the PIN, those never get echoed back,
 * before letting them move on or asking them to fix something. */
export function RegistrationConfirmation({
    stepLabel,
    greeting,
    avatarPreview,
    items,
    details,
    onEdit,
    onConfirm,
    loading = false,
    confirmLabel = "Confirmar",
    error,
}: {
    stepLabel: string
    greeting: ReactNode
    /** Shown as a picture, not a summary row: a text label like "Violeta"
     * means nothing to the family compared to just seeing the avatar itself. */
    avatarPreview?: ReactNode
    items: SummaryItem[]
    /** More to check below the rows, like the teacher's profile. */
    details?: ReactNode
    onEdit: () => void
    onConfirm: () => void
    loading?: boolean
    confirmLabel?: string
    error?: string | null
}) {
    return (
        <div className={styles.confirmation}>
            <p className={styles.subtitle}>{stepLabel}</p>
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

            {avatarPreview && (
                <div className={styles.avatarPreviewRow}>{avatarPreview}</div>
            )}

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

            {details}

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
                    {loading ? "Creando cuenta…" : confirmLabel}
                </button>
            </div>
        </div>
    )
}
