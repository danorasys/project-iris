import { useState, type ReactNode } from "react";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { DwellArrow } from "./DwellArrow";
import styles from "./PagedChoices.module.css";

// Also what a server-paged list asks for each screen.
const PER_SCREEN = 3;

/** When the server gives one screen at a time (a long tray): which screen
 * this is, how many there are and how many items in all. */
export interface ServerScreens {
  screen: number;
  screens: number;
  total: number;
  onChange: (screen: number) => void;
}

interface PagedChoicesProps<T> {
  items: T[];
  getKey: (item: T) => string;
  render: (item: T, indexOnScreen: number) => ReactNode;
  /** What they are, for "Unidades 1 a 3 de 7". */
  countLabel: string;
  /** Above and below the choices: the mascot, the title, the way back. */
  top?: ReactNode;
  bottom?: ReactNode;
  dwellDurationMs?: number;
  /** Without it, the items are all of them and are split here. */
  server?: ServerScreens;
}

/** A list of big choices for the kid, three at a time so each one stays big
 * and easy to look at. With more, the big arrows on the sides go through
 * them, like the pages of a lesson. */
export function PagedChoices<T>({
  items,
  getKey,
  render,
  countLabel,
  top,
  bottom,
  dwellDurationMs,
  server,
}: PagedChoicesProps<T>) {
  const [ownScreen, setOwnScreen] = useState(0);
  const screen = server ? server.screen : ownScreen;
  const setScreen = server ? server.onChange : setOwnScreen;
  const total = server ? server.total : items.length;
  const screens = server ? server.screens : Math.ceil(items.length / PER_SCREEN);
  const paged = screens > 1;
  const first = screen * PER_SCREEN;
  const shown = server ? items : items.slice(first, first + PER_SCREEN);

  return (
    <main className={styles.layout}>
      {paged && (
        <DwellArrow
          direction="left"
          label={`Ver ${countLabel.toLowerCase()} anteriores`}
          disabled={screen === 0}
          onSelect={() => setScreen(Math.max(screen - 1, 0))}
          dwellDurationMs={dwellDurationMs}
        />
      )}
      <div className={styles.middle}>
        {top}
        <ViewEnter view={screen} level={screen} className={styles.choices}>
          {shown.map((item, index) => (
            <div key={getKey(item)}>{render(item, index)}</div>
          ))}
        </ViewEnter>
        {paged && (
          <p className={styles.count} aria-live="polite">
            {countLabel} {first + 1} a {first + shown.length} de {total}
          </p>
        )}
        {bottom}
      </div>
      {paged && (
        <DwellArrow
          direction="right"
          label={`Ver ${countLabel.toLowerCase()} siguientes`}
          disabled={screen === screens - 1}
          onSelect={() => setScreen(Math.min(screen + 1, screens - 1))}
          dwellDurationMs={dwellDurationMs}
        />
      )}
    </main>
  );
}
