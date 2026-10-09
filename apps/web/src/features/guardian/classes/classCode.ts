// The class code a family types (HU-40), checked the same way classroom-service
// does: at least 8 characters mixing letters, numbers and symbols. The web only
// uses it to say what's missing and to keep "Buscar" off; the server decides.

export const CODE_MIN_LENGTH = 8;
export const CODE_MAX_LENGTH = 12;
/** The only symbols IRIS puts in a code. */
export const CODE_SYMBOLS = "#$%&*+?@";

/** What a family types can come with spaces or in lowercase. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface CodeChecks {
  length: boolean;
  letter: boolean;
  digit: boolean;
  symbol: boolean;
  /** Nothing outside letters, numbers and those symbols. */
  allowed: boolean;
}

export function checkCode(raw: string): CodeChecks {
  const code = normalizeCode(raw);
  const chars = [...code];
  return {
    length: code.length >= CODE_MIN_LENGTH && code.length <= CODE_MAX_LENGTH,
    letter: chars.some((c) => c >= "A" && c <= "Z"),
    digit: chars.some((c) => c >= "0" && c <= "9"),
    symbol: chars.some((c) => CODE_SYMBOLS.includes(c)),
    allowed: chars.every((c) => (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || CODE_SYMBOLS.includes(c)),
  };
}

export function isCompleteCode(raw: string): boolean {
  const checks = checkCode(raw);
  return checks.length && checks.letter && checks.digit && checks.symbol && checks.allowed;
}
