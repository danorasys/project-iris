import { ApiError } from "@/shared/api/httpClient";

interface PydanticError {
  msg?: string;
  mensaje?: string;
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
    case "limite_intentos_excedido":
      return "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
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
