import type { ReactNode } from "react";
import { IconHeading, IconImage, IconList, IconTable, IconText } from "@/shared/ui/icons";
import type { EditorBlock } from "./editorModel";

/** Name and icon of each kind of block, as the teacher reads them. */
export const BLOCK_KINDS: Record<EditorBlock["type"], { label: string; icon: ReactNode }> = {
  titulo: { label: "Título", icon: <IconHeading width={16} height={16} /> },
  subtitulo: { label: "Subtítulo", icon: <IconHeading width={14} height={14} /> },
  texto: { label: "Párrafo", icon: <IconText width={16} height={16} /> },
  lista: { label: "Lista", icon: <IconList width={16} height={16} /> },
  tabla: { label: "Tabla", icon: <IconTable width={16} height={16} /> },
  imagen: { label: "Imagen", icon: <IconImage width={16} height={16} /> },
};
