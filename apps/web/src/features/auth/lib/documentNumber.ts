// Each of the 3 document_types catalog entries (see identity-service's
// migration 0004) is a real, fixed government document format, not a
// business rule that changes at runtime — matched by name here rather than a
// hardcoded id, since the catalog lives in the database and ids are only
// stable in practice, never guaranteed (same reasoning as
// GuardianRegistrationWizard's SUPPORT_CONDITION_NAME_OTHER). Mirrors
// identity-service's app/domain/document_number.py, which enforces the same
// patterns server-side, so a family never gets a "looks fine here, rejected
// there" surprise.
export const DOCUMENT_TYPE_NAME_CITIZENSHIP_ID = "Cédula de ciudadanía";
export const DOCUMENT_TYPE_NAME_FOREIGNER_ID = "Cédula de extranjería";
export const DOCUMENT_TYPE_NAME_PASSPORT = "Pasaporte";

interface DocumentNumberRule {
  /** Stripped out of every keystroke, so it's physically impossible to type
   * a character the selected document type doesn't allow. */
  disallowedCharsPattern: RegExp;
  fullPattern: RegExp;
  message: string;
}

const DOCUMENT_NUMBER_RULES: Record<string, DocumentNumberRule> = {
  [DOCUMENT_TYPE_NAME_CITIZENSHIP_ID]: {
    disallowedCharsPattern: /\D/g,
    fullPattern: /^\d{6,10}$/,
    message: "Ingresa un número de cédula de ciudadanía válido.",
  },
  [DOCUMENT_TYPE_NAME_FOREIGNER_ID]: {
    disallowedCharsPattern: /\D/g,
    fullPattern: /^\d{6,12}$/,
    message: "Ingresa un número de cédula de extranjería válido.",
  },
  [DOCUMENT_TYPE_NAME_PASSPORT]: {
    disallowedCharsPattern: /[^A-Za-z0-9]/g,
    fullPattern: /^[A-Za-z0-9]{6,12}$/,
    message: "Ingresa un número de pasaporte válido.",
  },
};

/** Strips whatever the selected document type doesn't allow, so a keystroke
 * that isn't a valid character for that type never lands in the field. A
 * type outside the 3 known ones (catalog still loading, or a future entry
 * this hasn't been taught about yet) is left unconstrained. */
export function filterDocumentNumberInput(documentTypeName: string | undefined, value: string): string {
  if (!documentTypeName) return value;
  const rule = DOCUMENT_NUMBER_RULES[documentTypeName];
  return rule ? value.replace(rule.disallowedCharsPattern, "") : value;
}

/** Empty is reported separately by the caller's own "required" check, so
 * it's not an error here — only a value that's actually wrong for the
 * selected type is. */
export function documentNumberFormatError(documentTypeName: string | undefined, value: string): string | null {
  if (!documentTypeName || value === "") return null;
  const rule = DOCUMENT_NUMBER_RULES[documentTypeName];
  if (!rule) return null;
  return rule.fullPattern.test(value) ? null : rule.message;
}
