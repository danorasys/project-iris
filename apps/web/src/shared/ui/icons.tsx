import type { SVGProps } from "react";

/**
 * Our own icon set, all drawn the same way (24 viewBox, 1.75 stroke,
 * rounded caps and joins) so they look consistent. Used instead of emoji
 * anywhere in the interface. They all use `currentColor` for their
 * stroke, so they work fine on dark buttons and in plain text too.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconChild(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20.5c1-3.6 3.6-5.6 6.5-5.6s5.5 2 6.5 5.6" />
    </svg>
  );
}

export function IconTeacher(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="7.5" r="3.2" />
      <path d="M4.8 20.5c0.9-3.9 3.7-6 7.2-6s6.3 2.1 7.2 6" />
      <path d="M8.5 4.2 12 2l3.5 2.2" />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 19 4" />
      <path d="M16 7l2.5 2.5" />
      <path d="M13.5 9.5 16 12" />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5c2-1 5-1 8 .5 3-1.5 6-1.5 8-.5v13c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5Z" />
      <path d="M12 6v13" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** A clock: something waiting for an answer, like a join request. Not
 * the bell, which is only for notifications. */
export function IconClock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** A board on its easel with something written on it: a classroom. */
export function IconClassroom(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3.5" width="18" height="12" rx="1.5" />
      <path d="M7 8h6" />
      <path d="M7 11.3h9" />
      <path d="M9.5 15.5 7.5 20.5" />
      <path d="M14.5 15.5 16.5 20.5" />
    </svg>
  );
}

/** A graduation cap, for anything about classes and studying. */
export function IconGraduationCap(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 9.5 12 5l9.5 4.5L12 14Z" />
      <path d="M6.5 11.8v4.1c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4.1" />
      <path d="M21.5 9.5v5" />
    </svg>
  );
}

/** An envelope, for direct messages. */
export function IconMessage(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m4 7.5 8 6 8-6" />
    </svg>
  );
}

/** Bars of a chart, for statistics. */
export function IconChart(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20h16" />
      <path d="M7 16v-5" />
      <path d="M12 16V7" />
      <path d="M17 16v-8" />
    </svg>
  );
}

/** A briefcase, for work and job experience. */
export function IconBriefcase(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M3 12.5h18" />
      <path d="M10.5 12.5v1.5h3v-1.5" />
    </svg>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 4v4.5H8.5" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6 7l1 12.5h10L18 7" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12.5 9.5 17 19 6.5" />
    </svg>
  );
}

export function IconBackspace(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 6h10.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-5-6z" />
      <path d="m11.5 10 4 4M15.5 10l-4 4" />
    </svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconLogOut(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 19H5.5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5.5 5H9" />
      <path d="M14 16l4-4-4-4" />
      <path d="M18 12H9" />
    </svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 4.5-4.5L13 16l2.5-2.5L20 18" />
    </svg>
  );
}

export function IconText(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 6.5h14M5 12h14M5 17.5h9" />
    </svg>
  );
}

/** A warning sign: a rounded triangle with "!". For confirmations of
 * something that can't be undone or that loses what was typed. */
export function IconAlert(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10.3 4.2 2.9 17.3A2 2 0 0 0 4.6 20.3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="16.9" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6.5" />
      <circle cx="12" cy="7.3" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.9 5.6A10.7 10.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.5 15.5 0 0 1-3.32 4.2M6.6 6.6C4 8.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.9 9.9 0 0 0 3.1-.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      <path d="M12 14.5v2.2" />
    </svg>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.3 4.7 19.3 9.7 8 21H3v-5z" />
      <path d="M12.5 6.5 17.5 11.5" />
    </svg>
  );
}

export function IconUserCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M6 18.2c1.1-2.6 3.3-4 6-4s4.9 1.4 6 4" />
    </svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 15l7-7 7 7" />
    </svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}

/** A big T over a line: a title or a subtitle. */
export function IconHeading(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 5h12M12 5v10" />
      <path d="M7 19h10" />
    </svg>
  );
}

/** Three dots with their lines: a list. */
export function IconList(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.75" cy="6.5" r="0.9" />
      <circle cx="4.75" cy="12" r="0.9" />
      <circle cx="4.75" cy="17.5" r="0.9" />
    </svg>
  );
}

/** A grid with a header row: a table. */
export function IconTable(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10" />
    </svg>
  );
}

/** Stacked sheets: a unit, a group of lessons. */
export function IconLayers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
    </svg>
  );
}

/** A circle with a question mark: an activity of questions. */
export function IconQuestion(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" />
      <path d="M12 16.8v.2" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9v10.5h12V9" />
      <path d="M10 19.5v-5h4v5" />
    </svg>
  );
}
