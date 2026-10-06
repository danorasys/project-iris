// The page's sections, in order. The top bar and the footer list the same
// ones, so they never disagree.
export const NAV_LINKS = [
  { id: "conoce-iris", text: "Conoce a IRIS" },
  { id: "como-funciona", text: "Cómo funciona" },
  { id: "como-se-organiza", text: "Cómo se organiza" },
  { id: "por-que-importa", text: "Por qué importa" },
  { id: "unete", text: "Únete" },
];

// Where people sign up from any button on the landing.
export const REGISTER_LINK = { to: "/login/adult", state: { vista: "elegirRegistro" } };
