// The rules a new password must follow. The checklist shows them while the
// person types, and the forms use them to block sending a weak one.
interface Requirement {
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: Requirement[] = [
  { label: "Al menos 8 caracteres", test: (password) => password.length >= 8 },
  { label: "Una letra mayúscula", test: (password) => /[A-Z]/.test(password) },
  { label: "Una letra minúscula", test: (password) => /[a-z]/.test(password) },
  { label: "Un número", test: (password) => /[0-9]/.test(password) },
  { label: "Un símbolo (ej. !@#$%)", test: (password) => /[^A-Za-z0-9]/.test(password) },
];

/** Used by the forms to gate submission, so the checklist
 * isn't just a suggestion the person can ignore. */
export function passwordMeetsRequirements(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));
}
