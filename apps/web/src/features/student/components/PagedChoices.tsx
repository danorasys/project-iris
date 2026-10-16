import { Fragment, useState, type ReactNode } from "react";
import { KidCards, KidPage, KidPager, type KidBarItem } from "@/shared/ui/kid/KidKit";
import { ViewEnter } from "@/shared/ui/ViewEnter";

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
  /** Above the choices: the title, what IRIS says. */
  top?: ReactNode;
  /** Under the choices, before the bar. */
  after?: ReactNode;
  /** The way back, on the bottom edge. */
  back?: { label: string; onSelect: () => void };
  /** Other places on the bottom bar, like Notificaciones and Ajustes. */
  barItems?: KidBarItem[];
  dwellDurationMs?: number;
  /** Without it, the items are all of them and are split here. */
  server?: ServerScreens;
}

/** A list of very big cards for the kid, three at a time so each one stays
 * big and easy to look at. With more, the arrows on the edges of the screen
 * go through them, and the way back is the bar on the bottom edge. */
export function PagedChoices<T>({
  items,
  getKey,
  render,
  countLabel,
  top,
  after,
  back,
  barItems,
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
  const words = countLabel.toLowerCase();

  return (
    <KidPage
      back={back}
      items={barItems}
      dwellDurationMs={dwellDurationMs}
      previousArrow={
        paged
          ? { label: `Ver ${words} anteriores`, disabled: screen === 0, onSelect: () => setScreen(Math.max(screen - 1, 0)) }
          : undefined
      }
      nextArrow={
        paged
          ? {
              label: `Ver ${words} siguientes`,
              disabled: screen === screens - 1,
              onSelect: () => setScreen(Math.min(screen + 1, screens - 1)),
            }
          : undefined
      }
    >
      {top}
      {/* Each screen comes in from the side of its arrow. */}
      <ViewEnter view={screen} level={screen}>
        <KidCards>
          {shown.map((item, index) => (
            <Fragment key={getKey(item)}>{render(item, index)}</Fragment>
          ))}
        </KidCards>
      </ViewEnter>
      {paged && (
        <KidPager current={screen} groups={screens} text={`${countLabel} ${first + 1} a ${first + shown.length} de ${total}`} />
      )}
      {after}
    </KidPage>
  );
}
