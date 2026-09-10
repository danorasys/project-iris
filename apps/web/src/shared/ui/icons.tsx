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

export function IconSchool(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 19v-5h4v5" />
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

export function IconPause(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <svg {...base} {...props} fill="currentColor">
      <path d="M7.5 4.8v14.4c0 .7.77 1.13 1.36.76l11.2-7.2a.9.9 0 0 0 0-1.52L8.86 4.04A.9.9 0 0 0 7.5 4.8Z" />
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
