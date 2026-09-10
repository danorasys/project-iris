import { Link } from "react-router-dom";
import { LegalLayout } from "./LegalLayout";

export default function LegalNoticePage() {
  return (
    <LegalLayout title="Aviso Legal" updatedOn="24 de agosto de 2026">
      <h2>Qué es IRIS</h2>
      <p>
        IRIS es una plataforma educativa que permite a estudiantes de primaria interactuar con
        contenido escolar mediante control ocular, sin necesidad de mouse ni teclado. Este
        sitio es un <strong>prototipo académico</strong>, no un producto comercial en operación.
      </p>

      <h2>Naturaleza del proyecto</h2>
      <p>
        IRIS no está constituido como una empresa ni presta un servicio comercial. No existe, por
        el momento, una razón social, un domicilio legal ni un canal de soporte formal detrás de
        este sitio. Se publica con fines de evaluación académica y demostración del trabajo
        realizado.
      </p>

      <h2>Propiedad del contenido</h2>
      <p>
        El nombre IRIS, la identidad visual, los textos, ilustraciones y el código fuente de este
        sitio son trabajo original del equipo del proyecto, salvo cuando se indique lo contrario.
        No está autorizado su uso comercial sin permiso del equipo.
      </p>

      <h2>Límite de responsabilidad</h2>
      <p>
        Por tratarse de un prototipo académico, IRIS se ofrece "tal cual", sin garantías de
        disponibilidad continua, ausencia de errores o idoneidad para un uso distinto al
        educativo y demostrativo. El equipo no asume responsabilidad por decisiones tomadas a
        partir del uso de la plataforma fuera de este contexto.
      </p>

      <p className="academicNote">
        Este aviso describe el proyecto tal como existe hoy: un desarrollo académico en curso, no
        asesoría legal ni una declaración corporativa formal. Consulta también nuestra{" "}
        <Link to="/privacy-policy">Política de Privacidad</Link>.
      </p>
    </LegalLayout>
  );
}
