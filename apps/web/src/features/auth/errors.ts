import { ApiError } from "@/shared/api/httpClient";

interface PydanticError {
  msg?: string;
  mensaje?: string;
}

/** Seconds the server says to wait before trying again, or null if it
 * didn't say (only sent with `limite_intentos_excedido`). */
export function getRetryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.code !== "limite_intentos_excedido") return null;
  const seconds = error.details?.retry_after_seconds;
  return typeof seconds === "number" && seconds > 0 ? seconds : null;
}

/** 272 -> "4:32", the way the countdown shows it. */
export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Translates identity-service error codes into a Spanish message ready to
 * show the user. If the code isn't recognized, falls back to whatever
 * message the backend already sent (`ApiError.message`). */
export function getAuthErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Ocurrió un error inesperado. Intenta de nuevo.";
  }

  switch (error.code) {
    case "correo_ya_registrado":
      return "Ese correo ya está registrado. Si ya tienes cuenta, usa «Inicia sesión».";
    case "credenciales_invalidas":
      return "Correo o contraseña incorrectos.";
    case "pin_invalido":
      return "El PIN no es correcto. Inténtalo de nuevo.";
    case "limite_intentos_excedido": {
      const wait = getRetryAfterSeconds(error);
      return wait === null
        ? "Demasiados intentos. Espera unos minutos antes de volver a intentarlo."
        : `Demasiados intentos. Vuelve a intentarlo en ${formatClock(wait)} (minutos:segundos).`;
    }
    case "codigo_totp_invalido":
      return "Ese código no es correcto o ya expiró. Escribe el más reciente que muestre tu aplicación autenticadora.";
    case "configuracion_totp_no_iniciada":
      return "Primero debemos generar tu código QR. Recarga la página e inténtalo de nuevo.";
    case "acceso_portal_requerido":
      return "Tu verificación expiró. Confirma tu identidad con el código para continuar.";
    case "sesion_cerrada_por_seguridad":
      return "Cerramos tu sesión por seguridad, hubo demasiados intentos fallidos. Inicia sesión de nuevo.";
    case "totp_no_activado":
      return "Tu cuenta todavía no tiene la verificación en dos pasos activada.";
    case "tipo_relacion_invalido":
      return "Elige un tipo de relación válido.";
    case "datos_invalidos": {
      const errors = error.details?.errores;
      if (Array.isArray(errors) && errors.length > 0) {
        const first = errors[0] as PydanticError;
        const detail = first.msg ?? first.mensaje;
        if (detail) return `Revisa los datos del formulario: ${detail}`;
      }
      return "Revisa los datos del formulario, algo no es válido.";
    }
    default:
      return error.message || "Ocurrió un error inesperado. Intenta de nuevo.";
  }
}
