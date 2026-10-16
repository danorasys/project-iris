import type { CSSProperties, ReactNode } from "react";
import logoIris from "@/assets/landing/logo-iris.png";
import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import { IconArrowLeft, IconArrowRight } from "@/shared/ui/icons";
import { IrisRings } from "@/shared/ui/IrisRings";
import styles from "./KidKit.module.css";

// The pieces of the kid's screens, in the look of the portals of IRIS and
// made for the eyes: a light sky page with the rings of the iris, very big
// white cards, arrows on the edges of the screen from top to bottom, and the
// way back (or forward) stretched on the bottom edge. Everything that can be
// chosen fills up while the eyes (or the mouse) stay on it.

/** The color tones of a card, from the palette of the portals. */
export type KidTone = "blue" | "orange" | "mint" | "sun" | "sky" | "navy";

interface BarAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** One more thing on the bottom bar, like "Notificaciones" on the home. */
export interface KidBarItem extends BarAction {
  key: string;
  icon?: ReactNode;
  /** A count of new things, like unread notifications. */
  badge?: number;
  badgeLabel?: string;
}

interface ArrowAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface KidPageProps {
  children: ReactNode;
  /** The way back, on the bottom edge. */
  back?: BarAction;
  /** The way forward, on the bottom edge too (next to "back" if both). */
  next?: BarAction;
  /** Other places, on the bottom bar too (white, with their icon). */
  items?: KidBarItem[];
  /** Arrows on the left and right edges, to go through groups or pages. */
  previousArrow?: ArrowAction;
  nextArrow?: ArrowAction;
  dwellDurationMs?: number;
  /** The middle grows to fill the screen (a page of a lesson). */
  fill?: boolean;
  className?: string;
}

/** A kid's screen: everything centered, with the arrows and the bottom bar
 * always in the same place so the eyes learn where they are. */
export function KidPage({
  children,
  back,
  next,
  items = [],
  previousArrow,
  nextArrow,
  dwellDurationMs,
  fill = false,
  className,
}: KidPageProps) {
  const arrows = Boolean(previousArrow || nextArrow);
  const bar = Boolean(back || next || items.length > 0);
  return (
    <main className={styles.page} data-arrows={arrows} data-bar={bar} data-fill={fill}>
      <IrisRings className={styles.rings} />
      <div className={className ? `${styles.middle} ${className}` : styles.middle}>{children}</div>
      {previousArrow && <EdgeArrow direction="previous" {...previousArrow} dwellDurationMs={dwellDurationMs} />}
      {nextArrow && <EdgeArrow direction="next" {...nextArrow} dwellDurationMs={dwellDurationMs} />}
      {bar && (
        <div className={styles.bar}>
          {back && <BarButton tone="back" {...back} dwellDurationMs={dwellDurationMs} />}
          {items.map(({ key, ...item }) => (
            <BarButton key={key} tone="item" {...item} dwellDurationMs={dwellDurationMs} />
          ))}
          {next && <BarButton tone="go" {...next} dwellDurationMs={dwellDurationMs} />}
        </div>
      )}
    </main>
  );
}

/** The top of a screen: a small label, the title and a line under it. */
export function KidHeader({
  eyebrow,
  icon,
  title,
  subtitle,
  titleId,
}: {
  eyebrow?: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  titleId?: string;
}) {
  return (
    <header className={styles.header}>
      {eyebrow && (
        <p className={styles.eyebrow}>
          {icon}
          {eyebrow}
        </p>
      )}
      <h1 id={titleId} className={styles.title}>
        {title}
      </h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}

/** A row of cards (up to three, so each one stays very big). */
export function KidCards({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `${styles.cards} ${className}` : styles.cards}>{children}</div>;
}

// The ring that fills around the picture while the eyes stay on the card.
function DwellRing({ progress }: { progress: number }) {
  return (
    <svg className={styles.dwellRing} viewBox="0 0 100 100" aria-hidden="true">
      <circle className={styles.dwellTrack} cx="50" cy="50" r="47" pathLength="1" />
      <circle
        className={styles.dwellFill}
        cx="50"
        cy="50"
        r="47"
        pathLength="1"
        // Its round tip would show as a dot at 0, so it's hidden until it starts.
        style={{ strokeDashoffset: 1 - progress, opacity: progress > 0 ? 1 : 0 }}
      />
    </svg>
  );
}

interface KidCardProps {
  title: ReactNode;
  onSelect: () => void;
  /** A picture on a white disc (an avatar, a class logo). */
  picture?: ReactNode;
  /** "square" for a class logo, which is a rounded square. */
  pictureShape?: "circle" | "square";
  /** Or an icon on a disc of the card's tone. */
  icon?: ReactNode;
  /** A short text in a tile instead (a number, a letter). */
  mark?: ReactNode;
  /** Under the title, like the guiding question of a unit. */
  subtitle?: ReactNode;
  /** A small tag at the bottom: how it's going, what it is. */
  note?: ReactNode;
  /** "done" turns the tag green, "locked" gray. */
  noteTone?: "plain" | "done" | "locked";
  tone?: KidTone;
  /** Its own color ("#rrggbb"), like a kid's avatar or a class. */
  color?: string;
  /** A count in the corner, like new notifications. */
  badge?: number;
  badgeLabel?: string;
  disabled?: boolean;
  dwellDurationMs?: number;
  /** Its place in the row, for the entrance one after the other. */
  order?: number;
  /** Smaller, for a row of four (the answers of a question). */
  compact?: boolean;
  /** Bigger, when the picture is what tells them apart (profiles, classes). */
  large?: boolean;
  /** An answer of a question: its letter smaller and its words big. */
  answer?: boolean;
}

/** A very big card to choose something: the band of its color on top, its
 * picture or icon on a disc, the name, and what's under it. */
export function KidCard({
  title,
  onSelect,
  picture,
  pictureShape = "circle",
  icon,
  mark,
  subtitle,
  note,
  noteTone = "plain",
  tone = "blue",
  color,
  badge = 0,
  badgeLabel = "",
  disabled = false,
  dwellDurationMs,
  order = 0,
  compact = false,
  large = false,
  answer = false,
}: KidCardProps) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
    onSelect,
    active: !disabled,
    durationMs: dwellDurationMs,
  });
  const style = { "--order": order, ...(color && { "--card-color": color }) } as CSSProperties;
  return (
    <button
      ref={ref}
      type="button"
      className={styles.card}
      data-tone={tone}
      data-looking={focused}
      data-compact={compact}
      data-large={large}
      data-answer={answer}
      style={style}
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
    >
      <span className={styles.cardBand} aria-hidden="true" />
      <span className={styles.media}>
        {!disabled && <DwellRing progress={progress} />}
        {picture ? (
          <span className={styles.picture} data-shape={pictureShape}>
            {picture}
          </span>
        ) : (
          <span className={styles.iconDisc} aria-hidden="true">
            {mark ?? icon}
          </span>
        )}
      </span>
      <span className={styles.cardTitle}>{title}</span>
      {subtitle && <span className={styles.cardSubtitle}>{subtitle}</span>}
      {note && (
        <span className={styles.note} data-tone={noteTone}>
          {note}
        </span>
      )}
      {badge > 0 && (
        <span className={styles.badge}>
          <span aria-hidden="true">{badge > 99 ? "99+" : badge}</span>
          <span className={styles.srOnly}>{`, ${badge} ${badgeLabel}`}</span>
        </span>
      )}
    </button>
  );
}

/** A very big arrow on the edge of the screen, from top to bottom. */
export function EdgeArrow({
  direction,
  label,
  onSelect,
  disabled = false,
  dwellDurationMs,
}: ArrowAction & { direction: "previous" | "next"; dwellDurationMs?: number }) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
    onSelect,
    active: !disabled,
    durationMs: dwellDurationMs,
  });
  const Icon = direction === "previous" ? IconArrowLeft : IconArrowRight;
  return (
    <button
      ref={ref}
      type="button"
      className={styles.arrow}
      data-direction={direction}
      data-looking={focused}
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
      aria-label={label}
    >
      <span className={styles.fill} style={{ transform: `scaleY(${progress})` }} aria-hidden="true" />
      <Icon width={60} height={60} className={styles.arrowIcon} aria-hidden="true" />
    </button>
  );
}

// The way back (white) or forward (blue), long and tall on the bottom edge.
function BarButton({
  tone,
  label,
  onSelect,
  disabled = false,
  icon,
  badge = 0,
  badgeLabel = "",
  dwellDurationMs,
}: BarAction & {
  tone: "back" | "go" | "item";
  icon?: ReactNode;
  badge?: number;
  badgeLabel?: string;
  dwellDurationMs?: number;
}) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
    onSelect,
    active: !disabled,
    durationMs: dwellDurationMs,
  });
  return (
    <button
      ref={ref}
      type="button"
      className={styles.barButton}
      data-tone={tone}
      data-looking={focused}
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
    >
      <span className={styles.fill} style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <span className={styles.barText}>
        {tone === "back" && <IconArrowLeft width={30} height={30} aria-hidden="true" />}
        {icon && (
          <span className={styles.barIcon} aria-hidden="true">
            {icon}
          </span>
        )}
        {label}
        {tone === "go" && <IconArrowRight width={30} height={30} aria-hidden="true" />}
        {badge > 0 && (
          <span className={styles.barBadge}>
            <span aria-hidden="true">{badge > 99 ? "99+" : badge}</span>
            <span className={styles.srOnly}>{`, ${badge} ${badgeLabel}`}</span>
          </span>
        )}
      </span>
    </button>
  );
}

/** Which group is on screen: dots and "Unidades 1 a 3 de 7". */
export function KidPager({ current, groups, text }: { current: number; groups: number; text: string }) {
  return (
    <div className={styles.pager}>
      <span className={styles.dots} aria-hidden="true">
        {Array.from({ length: groups }, (_, index) => (
          <span key={index} className={styles.dot} data-current={index === current} />
        ))}
      </span>
      <p className={styles.count} aria-live="polite">
        {text}
      </p>
    </div>
  );
}

/** IRIS speaking to the kid: its logo next to a white bubble. */
export function KidMessage({ children, mood }: { children: ReactNode; mood?: "happy" | "cheering" | "thinking" | "celebrating" }) {
  return (
    <div className={styles.message} data-mood={mood}>
      <span className={styles.messageLogo} aria-hidden="true">
        <img src={logoIris} alt="" />
      </span>
      <p className={styles.messageText}>{children}</p>
    </div>
  );
}
