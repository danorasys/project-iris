import { CheckCircle2 } from "lucide-react";

import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import { IconArrowLeft, IconArrowRight } from "@/shared/ui/icons";

import styles from "./DwellArrow.module.css";

interface DwellArrowProps {
    direction: "left" | "right" | "finish";
    onSelect: () => void;
    disabled?: boolean;
    dwellDurationMs?: number;
    label: string;
}

export function DwellArrow({
    direction,
    onSelect,
    disabled = false,
    dwellDurationMs,
    label,
}: DwellArrowProps) {
    const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
        onSelect,
        active: !disabled,
        durationMs: dwellDurationMs,
    });

    const handleSelect = () => {
        if (!disabled) {
            onSelect();
        }
    };

    return (
        <button
            ref={ref}
            type="button"
            className={[
                styles.arrow,
                styles[direction],
                focused ? styles.focused : "",
            ]
                .filter(Boolean)
                .join(" ")}
            onClick={handleSelect}
            disabled={disabled}
            aria-label={label}
        >
            <span
                className={styles.fill}
                style={{
                    transform: `scaleY(${progress})`,
                }}
                aria-hidden="true"
            />

            <span className={styles.content} aria-hidden="true">
                <span className={styles.icon}>
                    {direction === "left" && (
                        <IconArrowLeft width={52} height={52} />
                    )}

                    {direction === "right" && (
                        <IconArrowRight width={52} height={52} />
                    )}

                    {direction === "finish" && (
                        <CheckCircle2 width={52} height={52} />
                    )}
                </span>

                {direction === "finish" && (
                    <span className={styles.text}>Terminar</span>
                )}
            </span>
        </button>
    );
}
