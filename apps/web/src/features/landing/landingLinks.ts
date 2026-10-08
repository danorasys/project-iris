// The page's sections, in order. The top bar and the footer list the same
// ones, so they never disagree.
export const NAV_LINKS = [
  { id: "meet-iris", text: "Conoce a IRIS" },
  { id: "how-it-works", text: "Cómo funciona" },
  { id: "how-it-is-organized", text: "Cómo se organiza" },
  { id: "why-it-matters", text: "Por qué importa" },
  { id: "join", text: "Únete" },
];

// Where people sign up from any button on the landing.
export const REGISTER_LINK = { to: "/login/adult", state: { vista: "elegirRegistro" } };
