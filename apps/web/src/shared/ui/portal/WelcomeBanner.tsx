import type { ReactNode } from "react";
import { IconHome } from "@/shared/ui/icons";
import { Highlight, PortalBanner } from "./PortalBanner";

interface WelcomeBannerProps {
  /** The name that gets the hand-drawn line, like "Daniel Orlando". */
  name: string;
  text: string;
  /** Buttons under the text, like "Nueva clase". */
  actions?: ReactNode;
}

/** The welcome on top of "Inicio" in both portals: "Te damos la bienvenida"
 * with the name underlined by hand, and the house of "Inicio" in the
 * middle of the rings, like the other sections' icons. Not "Bienvenido": it
 * has to fit every mom, dad, guardian and teacher. */
export function WelcomeBanner({ name, text, actions }: WelcomeBannerProps) {
  return (
    <PortalBanner
      label="Bienvenida"
      title={
        <>
          Te damos la bienvenida, <Highlight>{name}</Highlight>
        </>
      }
      text={text}
      actions={actions}
      icon={<IconHome width={40} height={40} />}
    />
  );
}
