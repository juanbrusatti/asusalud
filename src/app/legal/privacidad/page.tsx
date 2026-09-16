import type { Metadata } from "next";
import { EMPRESA } from "../datos";
import { Hoja, Lista, Parrafo, Seccion } from "../_components/hoja";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos guarda Dlay, para qué los usa y cómo se piden o se borran.",
};

export default function PrivacidadPage() {
  return (
    <Hoja
      titulo="Política de privacidad"
      entrada={`Esta política explica qué datos maneja ${EMPRESA.nombre}, para qué los usa y qué puede pedir cada persona sobre los suyos. Está escrita para que se entienda sin abogado.`}
    >
      <Seccion titulo="Quién responde por cada dato">
        <Parrafo>
          Hay que separar dos cosas, porque las reglas son distintas para cada
          una.
        </Parrafo>
        <Lista
          items={[
            <>
              <strong className="font-semibold text-ink">
                Los datos del negocio que contrata Dlay
              </strong>{" "}
              —quién abrió la cuenta, su equipo, su facturación— los manejamos
              nosotros. De esos responde {EMPRESA.razonSocial}.
            </>,
            <>
              <strong className="font-semibold text-ink">
                Los datos de los clientes de ese negocio
              </strong>{" "}
              —quién se atiende, cuándo, con qué teléfono— son del negocio, no
              nuestros. El negocio decide qué carga y qué borra; nosotros sólo
              los guardamos y los procesamos siguiendo sus instrucciones. En los
              términos de la Ley 25.326, el negocio es el responsable y Dlay es
              el encargado del tratamiento.
            </>,
          ]}
        />
        <Parrafo>
          Si sos cliente de un negocio que usa Dlay y querés acceder a tus datos
          o que los borren, lo más rápido es pedírselo a ese negocio. Si no
          conseguís respuesta, escribinos a {EMPRESA.correo} y lo gestionamos
          con ellos.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Qué datos guardamos">
        <Lista
          items={[
            <>
              <strong className="font-semibold text-ink">De quien usa el sistema:</strong>{" "}
              nombre, correo electrónico, rol dentro del negocio y el registro de
              qué hizo en la cuenta (para poder explicar quién cambió qué).
            </>,
            <>
              <strong className="font-semibold text-ink">Del negocio:</strong>{" "}
              nombre, sucursales, horarios de atención, servicios y precios.
            </>,
            <>
              <strong className="font-semibold text-ink">
                De los clientes del negocio:
              </strong>{" "}
              nombre, teléfono, correo si lo cargan, notas y etiquetas que
              escribe el negocio, turnos, historial de cambios de esos turnos y
              los pagos que registra la caja.
            </>,
            <>
              <strong className="font-semibold text-ink">De los mensajes:</strong>{" "}
              los recordatorios programados y enviados, las respuestas que llegan
              por WhatsApp y quién pidió no recibir más mensajes.
            </>,
            <>
              <strong className="font-semibold text-ink">Técnicos:</strong> el
              permiso del navegador para enviar notificaciones, si se activó, y
              datos mínimos de funcionamiento y errores.
            </>,
          ]}
        />
        <Parrafo>
          No pedimos ni guardamos datos de tarjetas. No guardamos historias
          clínicas ni datos de salud: las notas del cliente son un campo libre y
          el negocio es responsable de lo que escriba ahí.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Para qué los usamos">
        <Parrafo>
          Para que el sistema funcione y para nada más: mostrar la agenda,
          organizar los turnos, enviar los recordatorios que el negocio
          configura, registrar la caja, dar soporte cuando lo piden y mantener el
          servicio seguro y en pie.
        </Parrafo>
        <Parrafo>
          No vendemos datos. No los cedemos a terceros para que hagan publicidad.
          No usamos los datos de los clientes de un negocio para otra cosa que no
          sea prestarle el servicio a ese negocio.
        </Parrafo>
      </Seccion>

      <Seccion titulo="WhatsApp y Meta">
        <Parrafo>
          Dlay envía los recordatorios a través de la Plataforma de WhatsApp
          Business, de Meta. Cuando un negocio conecta su cuenta de WhatsApp,
          recibimos y guardamos las credenciales necesarias para enviar y recibir
          mensajes en su nombre.
        </Parrafo>
        <Lista
          items={[
            <>
              Esas credenciales se guardan cifradas y no se muestran nunca más,
              ni siquiera a quien las cargó. Sólo las usa el proceso que envía
              los mensajes.
            </>,
            <>
              Usamos ese acceso únicamente para enviar los mensajes que el
              negocio configura, recibir las respuestas de sus clientes y
              administrar sus plantillas de mensaje.
            </>,
            <>
              No usamos la información que obtenemos de Meta para publicidad, ni
              la vendemos, ni la combinamos con datos de otros negocios.
            </>,
            <>
              Al mandar un mensaje, el teléfono y el contenido pasan por los
              servidores de Meta, que los trata según sus propias condiciones.
            </>,
            <>
              Cuando un negocio desconecta su cuenta de WhatsApp, borramos sus
              credenciales.
            </>,
          ]}
        />
      </Seccion>

      <Seccion titulo="Con quién los compartimos">
        <Parrafo>
          Sólo con los proveedores que hacen falta para que el servicio
          funcione, y sólo con lo que necesitan:
        </Parrafo>
        <Lista
          items={[
            <>
              <strong className="font-semibold text-ink">Supabase</strong> — la
              base de datos y las cuentas de acceso.
            </>,
            <>
              <strong className="font-semibold text-ink">Vercel</strong> — donde
              corre la aplicación.
            </>,
            <>
              <strong className="font-semibold text-ink">Meta</strong> — el envío
              y la recepción de los mensajes de WhatsApp.
            </>,
          ]}
        />
        <Parrafo>
          Estos proveedores tienen servidores fuera de la Argentina, así que los
          datos se transfieren al exterior. Trabajamos con empresas que ofrecen
          niveles de protección adecuados y que se obligan por contrato a tratar
          los datos sólo para prestarnos el servicio. También podemos entregar
          datos si nos lo exige una orden judicial o una autoridad competente.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Cuánto tiempo los guardamos">
        <Parrafo>
          Mientras la cuenta del negocio esté activa. Si el negocio da de baja la
          cuenta, borramos sus datos dentro de los 90 días, salvo lo que tengamos
          que conservar por una obligación legal o contable. El negocio puede
          borrar antes, y en cualquier momento, los datos de cualquiera de sus
          clientes desde el propio sistema.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Cómo los cuidamos">
        <Parrafo>
          Cada negocio está aislado de los demás por reglas que aplica la propia
          base de datos, no la aplicación: aunque alguien esquive la pantalla, la
          base no le devuelve datos de otro negocio. Todo viaja cifrado, el
          acceso al sistema pide contraseña y las credenciales de WhatsApp se
          escriben pero no se leen nunca más.
        </Parrafo>
        <Parrafo>
          Si detectamos un incidente de seguridad que afecte datos personales, lo
          avisamos a los negocios afectados y a la autoridad de control cuando
          corresponda.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Tus derechos">
        <Parrafo>
          Podés pedir acceder a tus datos, corregirlos, actualizarlos o que los
          borremos. Escribinos a {EMPRESA.correo} y te respondemos dentro de los
          plazos que fija la ley: diez días corridos para el acceso y cinco días
          hábiles para la corrección o la supresión.
        </Parrafo>
        <Parrafo>
          La Agencia de Acceso a la Información Pública, órgano de control de la
          Ley N° 25.326, atiende las denuncias y reclamos de quien vea afectados
          sus derechos.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Menores de edad">
        <Parrafo>
          El sistema es para negocios. No está pensado para que lo usen menores
          de 18 años. Si un negocio agenda a un menor, es responsable de tener el
          consentimiento de quien ejerza su responsabilidad parental.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Cambios">
        <Parrafo>
          Si cambiamos esta política, actualizamos la fecha de arriba y avisamos
          dentro del sistema cuando el cambio sea importante.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Contacto">
        <Parrafo>
          {EMPRESA.razonSocial} — {EMPRESA.domicilio}
          <br />
          {EMPRESA.correo}
        </Parrafo>
      </Seccion>
    </Hoja>
  );
}
