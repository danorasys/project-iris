import { LegalLayout } from "./LegalLayout";

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Política de Privacidad" updatedOn="24 de agosto de 2026">
      <p>
        IRIS es una plataforma educativa pensada para niños de primaria, así que el manejo de
        datos personales se diseñó desde el principio de <strong>minimización</strong>: pedimos
        solo lo indispensable para que la plataforma funcione, y nada más. Este documento explica
        qué datos recogemos, para qué, y quién los autoriza.
      </p>

      <h2>Quién consiente por el estudiante</h2>
      <p>
        Un estudiante <strong>nunca se registra a sí mismo</strong>. Todo perfil de estudiante se
        crea dentro de la sesión de un tutor adulto, quien da su consentimiento explícito antes de
        que se cree el perfil. Esto sigue el principio de la Ley 1581 de 2012 (Colombia), que exige
        consentimiento explícito de un adulto responsable para tratar datos de menores.
      </p>

      <h2>Datos que pedimos al tutor</h2>
      <p>
        Nombres y apellidos, tipo y número de documento de identidad, correo electrónico,
        contraseña, teléfono de contacto y relación con el estudiante. Se pide el documento de
        identidad del tutor —nunca del estudiante— porque es la persona adulta legalmente
        responsable del consentimiento.
      </p>

      <h2>Datos que pedimos del estudiante</h2>
      <p>Se limitan al mínimo indispensable para que la experiencia funcione:</p>
      <ul>
        <li>Nombres (sin documento de identidad: un menor no necesita uno para usar IRIS).</li>
        <li>Fecha de nacimiento, para confirmar que está en el rango de primaria.</li>
        <li>Un PIN numérico corto en vez de una contraseña, más apropiado para su edad.</li>
        <li>Avatar, elegido entre 4 opciones fijas, para personalizar su perfil.</li>
      </ul>

      <h2>Lo que nunca pedimos</h2>
      <p>
        No recolectamos fotos ni video del estudiante, dirección física, ni información
        socioeconómica. Esto es posible porque el seguimiento ocular ocurre por completo dentro
        del navegador del estudiante, como se explica a continuación.
      </p>

      <h2>El video de la cámara nunca sale del dispositivo</h2>
      <p>
        El control por mirada de IRIS corre <strong>enteramente en el navegador</strong> del
        estudiante. Ningún fotograma de video ni coordenada de mirada se envía a los servidores de
        IRIS: el video de la cámara nunca sale del computador o tablet donde el niño está jugando.
        No existe, por lo tanto, un dato biométrico que proteger del lado del servidor, porque
        nunca llega a él.
      </p>

      <h2>Cómo protegemos lo que sí guardamos</h2>
      <ul>
        <li>Las contraseñas y los PIN se guardan siempre con hash (bcrypt), nunca en texto plano.</li>
        <li>Toda comunicación con el servidor viaja cifrada por HTTPS fuera de un entorno local de desarrollo.</li>
        <li>Los intentos de inicio de sesión están limitados para frenar ataques de fuerza bruta, tanto para tutores/docentes como para el PIN del estudiante.</li>
        <li>Las contraseñas y PIN nunca se registran en logs del sistema.</li>
      </ul>

      <h2>Solicitudes sobre tus datos</h2>
      <p>
        Como IRIS es hoy un proyecto académico en desarrollo, todavía no contamos con un canal de
        soporte formal para atender solicitudes de acceso, corrección o eliminación de datos. Es
        una limitación que reconocemos abiertamente: en una versión en producción, este apartado
        incluiría un canal de contacto verificable y un procedimiento claro para ejercer esos
        derechos.
      </p>

      <p className="academicNote">
        Esta política describe buenas prácticas de ingeniería de software aplicadas con base en
        principios generales de protección de datos y en la Ley 1581 de 2012 de Colombia. No
        constituye asesoría legal formal; antes de manejar datos reales de menores en un entorno de
        producción, el diseño de consentimiento debería validarse con una persona con formación
        jurídica.
      </p>
    </LegalLayout>
  );
}
