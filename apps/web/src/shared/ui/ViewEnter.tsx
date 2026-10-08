import type { ReactNode } from "react";
import { useEnterAnimation } from "./enterAnimation";

interface ViewEnterProps {
  /** What is on screen now: a section, a kid, an option, a tab… When it
   * changes, the content comes in with the entrance. */
  view: unknown;
  /** How deep the view is, so the entrance knows the way (see EnterOptions). */
  level?: number;
  onMount?: boolean;
  className?: string;
  children: ReactNode;
}

/** A box for anything that swaps one view for another. Every new place to
 * move around in (a section, a list and its detail, tabs, steps) goes inside
 * one, with `view` saying which one is showing and `level` how deep it is. */
export function ViewEnter({ view, level, onMount, className, children }: ViewEnterProps) {
  const ref = useEnterAnimation<HTMLDivElement>(view, { level, onMount });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
