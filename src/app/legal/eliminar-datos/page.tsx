import type { Metadata } from "next";
import { EMPRESA } from "../datos";
import { Hoja, Lista, Parrafo, Seccion } from "../_components/hoja";

export const metadata: Metadata = {
  title: "Cómo eliminar tus datos",
  description: "Las tres formas de borrar datos de Dlay y qué pasa con cada una.",
};

export default function EliminarDatosPage() {
  return (
    <Hoja
      titulo="Cómo eliminar tus datos"
      entrada="Hay tres pedidos distintos detrás de la palabra “borrar”. Cada uno se resuelve de una forma."
    >
      <Seccion titulo="Sos cliente de un negocio que usa Dlay">
        <Parrafo>
          Tus datos —tu nombre, tu teléfono, tus turnos— son del negocio que te
          atiende, no nuestros. Pedíselo directamente: cualquier persona de ese
          negocio puede borrar tu ficha desde el sistema, y al borrarla
          desaparecen también tus turnos y tus mensajes programados.
        </Parrafo>
        <Parrafo>
          Si sólo querés dejar de recibir recordatorios, respondé{" "}
          <strong className="font-semibold text-ink">BAJA</strong> a cualquiera
          de nuestros mensajes de WhatsApp. Queda registrado y no te escribimos
          más, aunque tu ficha siga existiendo para que te puedan atender.
        </Parrafo>
        <Parrafo>
          Si el negocio no te responde, escribinos a {EMPRESA.correo} con tu
          nombre, tu teléfono y el nombre del negocio, y lo gestionamos nosotros.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Tenés una cuenta en Dlay y querés darla de baja">
        <Parrafo>
          Escribinos a {EMPRESA.correo} desde el correo con el que entrás al
          sistema, pidiendo la baja de la cuenta. Te confirmamos y después:
        </Parrafo>
        <Lista
          items={[
            "Cortamos los envíos y desconectamos WhatsApp en el momento.",
            "Te damos 30 días para descargar lo que quieras conservar.",
            "Pasados esos 30 días borramos la cuenta y todos sus datos: clientes, turnos, mensajes y caja.",
            "Sólo conservamos lo que una obligación legal o contable nos exija guardar.",
          ]}
        />
        <Parrafo>
          El borrado es definitivo. No hay forma de recuperar la cuenta después.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Querés desconectar WhatsApp">
        <Parrafo>
          Desde Configuración → WhatsApp, dentro del sistema. Al desconectar
          borramos las credenciales de tu cuenta de WhatsApp y dejamos de poder
          enviar o recibir mensajes en tu nombre. Tu número, tus plantillas y tu
          cuenta de WhatsApp Business siguen siendo tuyas y quedan intactas del
          lado de Meta.
        </Parrafo>
        <Parrafo>
          Los recordatorios que ya estaban programados quedan sin enviar.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Cuánto tardamos">
        <Parrafo>
          Respondemos todo pedido de supresión dentro de los cinco días hábiles
          que fija la Ley 25.326. Si necesitamos verificar tu identidad antes de
          borrar algo, te lo pedimos en ese mismo plazo.
        </Parrafo>
      </Seccion>
    </Hoja>
  );
}
