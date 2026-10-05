import { LegalLayout } from "./LegalLayout";

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Política de Privacidad" updatedOn="5 de octubre de 2026">
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
        Nombres y apellidos, fecha de nacimiento (para confirmar que es mayor de edad), tipo,
        número y fecha de expedición del documento de identidad, correo electrónico, contraseña,
        teléfono de contacto y relación con el estudiante. Se pide el documento de identidad del
        tutor —nunca del estudiante— porque es la persona adulta legalmente responsable del
        consentimiento.
      </p>

      <h2>Datos que pedimos al docente</h2>
      <p>
        Nombres y apellidos, fecha de nacimiento (para confirmar que es mayor de edad), tipo,
        número y fecha de expedición del documento de identidad, correo electrónico, contraseña,
        teléfono de contacto e institución. El docente acepta este tratamiento de sus datos al
        crear su cuenta.
      </p>
      <p>
        Si el docente decide completar su perfil docente (una presentación, sus estudios y su
        experiencia), esa información podrá ser vista por las familias de sus
        estudiantes, para que decidan con confianza. A las familias nunca se les muestran su
        documento, su fecha de nacimiento, su teléfono ni su correo.
      </p>

      <h2>Datos que pedimos del estudiante</h2>
      <p>Se limitan al mínimo indispensable para que la experiencia funcione:</p>
      <ul>
        <li>Nombres (sin documento de identidad: un menor no necesita uno para usar IRIS).</li>
        <li>Fecha de nacimiento, para confirmar que está en el rango de primaria.</li>
        <li>
          Su condición o condiciones de apoyo y, si la familia quiere, una necesidad de apoyo
          adicional, para que el docente lo acompañe mejor. Son datos sensibles: solo se comparten
          con el docente si el tutor lo autoriza expresamente.
        </li>
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
        <li>
          La verificación en dos pasos (2FA), con una aplicación autenticadora, protege el acceso al
          Portal de Padres y al panel docente, además de la contraseña.
        </li>
        <li>Toda comunicación con el servidor viaja cifrada por HTTPS fuera de un entorno local de desarrollo.</li>
        <li>Los intentos de inicio de sesión están limitados para frenar ataques de fuerza bruta, tanto para tutores/docentes como para el PIN del estudiante.</li>
        <li>Las contraseñas y PIN nunca se registran en logs del sistema.</li>
      </ul>

      <h2>Registro de accesos y de cambios</h2>
      <p>
        Para proteger tu cuenta y poder investigar un acceso indebido, guardamos un historial de
        las sesiones de tutores y docentes:
      </p>
      <ul>
        <li>Cuándo se inició cada sesión, cuándo se usó por última vez y cómo terminó (por ejemplo, al cerrar sesión o al cambiar la contraseña).</li>
        <li>
          El <strong>tipo de navegador y de sistema</strong> desde el que se inició, por ejemplo
          "Chrome en Windows". Solo guardamos ese nombre general: no guardamos la versión exacta,
          ni otros datos del navegador, ni tu dirección IP.
        </li>
        <li>
          Cuando modificas tus datos o los de tu peque, guardamos qué campos cambiaron (por
          ejemplo, "teléfono"), cuándo, desde qué sesión y que declaraste que la información es
          correcta y veraz. Nunca guardamos los valores, ni los anteriores ni los nuevos.
        </li>
      </ul>
      <p>
        Las sesiones de los estudiantes no se guardan en este historial. Este registro se conserva
        mientras exista la cuenta y se elimina junto con ella.
      </p>

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
