// What a tray calls the things it lists, so the same tray works for the
// notifications and for the messages of a class ("Seleccionar todas" or
// "Seleccionar todos", "la notificación" or "el mensaje").
export interface TrayWords {
  one: string;
  many: string;
  the: "la" | "el";
  those: "las" | "los";
  this: "esta" | "este";
  picked: string;
  pickedMany: string;
  all: string;
}

export const NOTIFICATION_WORDS: TrayWords = {
  one: "notificación",
  many: "notificaciones",
  the: "la",
  those: "las",
  this: "esta",
  picked: "seleccionada",
  pickedMany: "seleccionadas",
  all: "todas",
};

export const MESSAGE_WORDS: TrayWords = {
  one: "mensaje",
  many: "mensajes",
  the: "el",
  those: "los",
  this: "este",
  picked: "seleccionado",
  pickedMany: "seleccionados",
  all: "todos",
};
