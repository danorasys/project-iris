interface IrisMarkProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/** IRIS's brand element: the concentric rings of an eye's iris. Used as
 * the logo on the teacher dashboard, as decorative rings on the auth
 * pages, and animated on the calibration screen. */
export function IrisMark({ size = 96, className, animated = false }: IrisMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={className}
      aria-hidden="true"
      style={animated ? { animation: "iris-breathe 4s ease-in-out infinite" } : undefined}
    >
      <circle cx="48" cy="48" r="47" fill="none" stroke="var(--color-iris-pale)" strokeWidth="1.5" />
      <circle cx="48" cy="48" r="37" fill="none" stroke="var(--color-iris-medium)" strokeWidth="2" opacity="0.55" />
      <circle cx="48" cy="48" r="27" fill="none" stroke="var(--color-iris-medium)" strokeWidth="6" opacity="0.85" />
      <circle cx="48" cy="48" r="27" fill="none" stroke="var(--color-amber)" strokeWidth="1.5" strokeDasharray="3 5" />
      <circle cx="48" cy="48" r="13" fill="var(--color-ink)" />
      <circle cx="43" cy="43" r="4" fill="var(--color-surface)" opacity="0.9" />
    </svg>
  );
}
