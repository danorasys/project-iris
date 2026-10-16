import { useState } from "react"
import type { FieldStatus } from "@/features/auth/ui/FieldStatusIcon"

/** What's wrong with a value, or null when it's fine. */
export type Problem = (value: string) => string | null

/** What a field that's checked when it's left needs (TextField, PhoneField). */
export interface CheckedFieldProps {
    id: string
    value: string
    error?: string
    status?: FieldStatus
    onChange: (value: string) => void
    onBlur: () => void
}

/** Scrolls to a field and focuses it, so an error is never hidden below.
 * It uses `window.scrollTo` instead of `scrollIntoView()`: the page root
 * has `overflow: hidden` (for the background rings) and `scrollIntoView()`
 * would scroll that box instead of the page. `preventScroll` avoids the
 * same problem when focusing. */
export function focusAndScrollToField(fieldId: string): void {
    const field = document.getElementById(fieldId)
    if (!field) return
    field.focus({ preventScroll: true })
    const rect = field.getBoundingClientRect()
    const targetTop =
        rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" })
}

/** The sign ups check each field when it's left. A field counts as
 * "touched" once it's left with something written, or once "Siguiente"
 * checks it. From then on it's checked on every key, so the cross turns
 * into a check as soon as it's fixed. An empty field that was only tabbed
 * through stays quiet until "Siguiente". */
export function useFieldChecks() {
    const [touched, setTouched] = useState<Record<string, boolean>>({})

    function markTouched(id: string) {
        setTouched((current) =>
            current[id] ? current : { ...current, [id]: true },
        )
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

    return { touched, checkedField, checkField }
}
