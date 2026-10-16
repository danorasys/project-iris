import type { CSSProperties, ReactNode } from "react";
import type { StudentProfile } from "@iris/shared-types";
import { useAvatars } from "@/shared/api/hooks/useAuthApi";
import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import { IconBackspace, IconCheck } from "@/shared/ui/icons";
import { KidPage } from "@/shared/ui/kid/KidKit";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import styles from "./PinScreen.module.css";

const PIN_LENGTH = 4;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

interface PinScreenProps {
  profile: StudentProfile;
  pin: string;
  onPin: (pin: string) => void;
  onConfirm: () => void;
  /** While the PIN is being checked. */
  checking: boolean;
  error: string | null;
  onBack: () => void;
}

/** The kid's PIN, in the look of "¿Quién eres?": their card on the left with
 * the band in their avatar's color and the four boxes of the PIN, a very big
 * keypad on the right and "No soy yo" on the bottom edge. Every key fills up
 * with the eyes too. */
export function PinScreen({ profile, pin, onPin, onConfirm, checking, error, onBack }: PinScreenProps) {
  const color = useAvatars().data?.find((avatar) => avatar.id === profile.avatar_id)?.accent_color;

  function add(digit: string) {
    if (pin.length < PIN_LENGTH) onPin(pin + digit);
  }

  return (
    <KidPage fill back={{ label: "No soy yo, elegir otro perfil", onSelect: onBack }}>
      <div className={styles.layout}>
        <section
          className={styles.profile}
          style={color ? ({ "--banner-color": color } as CSSProperties) : undefined}
          aria-labelledby="pin-title"
        >
          <span className={styles.band} aria-hidden="true" />
          <span className={styles.avatar}>
            <StudentAvatarImage avatarId={profile.avatar_id} size="large" label="" />
          </span>
          <h1 id="pin-title" className={styles.title}>
            Hola, {profile.first_name}
          </h1>
          <p className={styles.subtitle}>Escribe tu PIN.</p>

          {/* The four boxes, a dot in each one already written. */}
          <div className={styles.cells} aria-live="polite">
            <span className={styles.visuallyHidden}>
              {pin.length} de {PIN_LENGTH} números escritos
            </span>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <span
                key={index}
                className={styles.cell}
                data-filled={index < pin.length}
                data-next={index === pin.length}
                aria-hidden="true"
              />
            ))}
          </div>

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </section>

        <div className={styles.keypad}>
          {DIGITS.map((digit) => (
            <Key key={digit} label={`Dígito ${digit}`} onSelect={() => add(digit)} disabled={checking}>
              {digit}
            </Key>
          ))}
          <Key
            label="Borrar último dígito"
            tone="erase"
            onSelect={() => onPin(pin.slice(0, -1))}
            disabled={checking || pin.length === 0}
          >
            <IconBackspace width={54} height={54} />
          </Key>
          <Key label="Dígito 0" onSelect={() => add("0")} disabled={checking}>
            0
          </Key>
          <Key label="Confirmar" tone="confirm" onSelect={onConfirm} disabled={checking || pin.length < PIN_LENGTH}>
            <IconCheck width={60} height={60} />
          </Key>
        </div>
      </div>
    </KidPage>
  );
}

// One key: white with a thin line, the delete one soft and the confirm one
// in the blue of IRIS. What the eyes have filled rises from the bottom.
function Key({
  label,
  tone = "digit",
  onSelect,
  disabled,
  children,
}: {
  label: string;
  tone?: "digit" | "erase" | "confirm";
  onSelect: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({ onSelect, active: !disabled });
  return (
    <button
      ref={ref}
      type="button"
      className={styles.key}
      data-tone={tone}
      data-looking={focused}
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
      aria-label={label}
    >
      <span className={styles.fill} style={{ transform: `scaleY(${progress})` }} aria-hidden="true" />
      <span className={styles.keyLabel}>{children}</span>
    </button>
  );
}
