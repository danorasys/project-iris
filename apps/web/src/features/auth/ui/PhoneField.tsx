import { useState } from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import flags from "react-phone-number-input/flags";
import es from "react-phone-number-input/locale/es.json";
import type { Country } from "react-phone-number-input";
import fieldStyles from "./Fields.module.css";
import styles from "./PhoneField.module.css";

// E.164 allows at most 15 digits after the "+". The formatted display adds a
// few more characters (spaces between groups), so the raw input needs some
// headroom above 15 rather than that exact number, this comfortably covers
// every country's formatting without letting the field grow unbounded.
const MAX_INPUT_LENGTH = 20;
const DEFAULT_COUNTRY: Country = "CO";

// A small, deliberately offline way to guess the family's country: matching
// the browser's own timezone against the Latin American countries IRIS
// families overwhelmingly register from. This is preferred over an IP
// geolocation service because it needs no network request (so it can never
// fail or add latency) and never sends the family's IP address to a third
// party just to pick a default dropdown value.
const TIMEZONE_TO_COUNTRY: Record<string, Country> = {
  "America/Bogota": "CO",
  "America/Mexico_City": "MX",
  "America/Tijuana": "MX",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL",
  "America/Lima": "PE",
  "America/Guayaquil": "EC",
  "America/Caracas": "VE",
  "America/La_Paz": "BO",
  "America/Asuncion": "PY",
  "America/Montevideo": "UY",
  "America/Panama": "PA",
  "America/Costa_Rica": "CR",
  "America/Guatemala": "GT",
  "America/Tegucigalpa": "HN",
  "America/El_Salvador": "SV",
  "America/Managua": "NI",
  "America/Santo_Domingo": "DO",
  "America/Puerto_Rico": "PR",
  "Europe/Madrid": "ES",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
};

function guessCountryFromTimezone(): Country {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_TO_COUNTRY[timezone] ?? DEFAULT_COUNTRY;
  } catch {
    return DEFAULT_COUNTRY;
  }
}

interface PhoneFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

/** Phone field with a country-flag selector, storing the number in E.164
 * (e.g. "+573001234567") so it stays valid and unambiguous regardless of
 * which country the family is registering from.
 *
 * Uses the library's full `<PhoneInput>` with `defaultCountry`, not a fixed
 * `country` prop: fixing `country` switches react-phone-number-input to its
 * "NATIONAL" formatting path, which enters an infinite render loop (React's
 * "Maximum update depth exceeded") the moment the field loses focus after a
 * number is typed. `defaultCountry` takes the "INTERNATIONAL_OR_NATIONAL"
 * path instead, which doesn't have this bug. The loop only reproduces in a
 * real browser, not in jsdom, so PhoneField.test.tsx alone won't catch a
 * regression here — verify by hand in the browser if this component's
 * country handling changes. */
export function PhoneField({ id, label, value, onChange, error, required }: PhoneFieldProps) {
  const errorId = `${id}-error`;
  const [defaultCountry] = useState<Country>(() => guessCountryFromTimezone());

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div className={`${styles.wrapper} ${error ? styles.wrapperError : ""}`}>
        <PhoneInput
          id={id}
          international
          defaultCountry={defaultCountry}
          // The calling code can only be changed through the flag dropdown,
          // never typed or deleted directly from the number field.
          countryCallingCodeEditable={false}
          labels={es}
          flags={flags}
          value={value || undefined}
          onChange={(next) => onChange(next ?? "")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          autoComplete="tel"
          maxLength={MAX_INPUT_LENGTH}
        />
      </div>
      {error && (
        <p id={errorId} className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
