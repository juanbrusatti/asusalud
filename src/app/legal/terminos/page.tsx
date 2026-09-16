import type { Metadata } from "next";
import { EMPRESA } from "../datos";
import { Hoja, Lista, Parrafo, Seccion } from "../_components/hoja";

export const metadata: Metadata = {
  title: "Términos del servicio",
  description:
    "Las condiciones de uso de Dlay: qué ofrecemos, qué esperamos y qué pasa si algo falla.",
};

export default function TerminosPage() {
  return (
    <Hoja
      titulo="Términos del servicio"
      entrada={`Estas son las condiciones bajo las que ${EMPRESA.razonSocial} presta ${EMPRESA.nombre}. Al abrir una cuenta, las aceptás.`}
    >
      <Seccion titulo="Qué es Dlay">
        <Parrafo>
          Un sistema para que un negocio con turnos organice su agenda, sus
          clientes, su caja y sus recordatorios automáticos. Se usa desde el
          navegador y se puede instalar en el teléfono.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Tu cuenta">
        <Parrafo>
          Para usar Dlay tenés que ser mayor de edad y tener capacidad para
          obligar al negocio que representás. Sos responsable de lo que pase con
          tu cuenta y de quién invitás a tu equipo. Si creés que alguien accedió
          sin permiso, avisanos a {EMPRESA.correo}.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Los datos de tus clientes son tuyos">
        <Parrafo>
          Vos decidís qué cargás y qué borrás. Nosotros los guardamos y los
          procesamos para prestarte el servicio, siguiendo tus instrucciones y lo
          que dice nuestra política de privacidad. No los usamos para otra cosa
          ni los compartimos con otros negocios.
        </Parrafo>
        <Parrafo>
          A cambio, te comprometés a cargar sólo datos que tengas derecho a
          tratar y a responder los pedidos de acceso o supresión de tus propios
          clientes.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Los mensajes de WhatsApp">
        <Parrafo>
          Esta parte importa más que el resto, porque una cuenta de WhatsApp se
          puede perder por usarla mal.
        </Parrafo>
        <Lista
          items={[
            <>
              Sólo podés escribirle a clientes que te dieron su número para que
              los contactes y que esperan tener noticias tuyas.
            </>,
            <>
              Los mensajes tienen que ser sobre sus turnos. Dlay no es una
              herramienta de difusión publicitaria.
            </>,
            <>
              Tenés que respetar las políticas de WhatsApp Business y de Meta,
              que se aplican además de estos términos.
            </>,
            <>
              Si alguien pide no recibir más mensajes, el sistema deja de
              escribirle. No intentes esquivarlo.
            </>,
            <>
              Meta cobra por los mensajes, con su propia tarifa y contra el medio
              de pago que cargues en tu cuenta de WhatsApp. Ese costo es tuyo y
              no está incluido en el abono de Dlay.
            </>,
          ]}
        />
        <Parrafo>
          Si Meta limita, suspende o da de baja tu número por cómo lo usaste, no
          podemos revertirlo.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Lo que no se puede hacer">
        <Lista
          items={[
            "Usar Dlay para algo ilegal o para molestar a terceros.",
            "Intentar entrar a datos de otro negocio.",
            "Revender el servicio o darle acceso a quien no sea de tu equipo.",
            "Cargar el sistema con tráfico automatizado que lo afecte para los demás.",
          ]}
        />
        <Parrafo>
          Si pasa algo de esto podemos suspender la cuenta. Cuando sea razonable,
          avisamos antes.
        </Parrafo>
      </Seccion>

      <Seccion titulo="El abono">
        <Parrafo>
          El precio y la forma de pago son los que se acuerden al contratar. Si
          un pago queda impago, avisamos antes de suspender la cuenta. Podés dar
          de baja cuando quieras: el servicio sigue hasta el final del período ya
          pago y no se devuelve la parte no usada.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Disponibilidad y responsabilidad">
        <Parrafo>
          Trabajamos para que Dlay esté siempre disponible, pero no podemos
          garantizar que nunca falle ni que un mensaje llegue siempre: dependemos
          de servicios de terceros como Meta, Supabase y Vercel, y de que el
          teléfono del destinatario esté en condiciones de recibirlo.
        </Parrafo>
        <Parrafo>
          Respondemos por lo que hacemos mal, hasta el importe que nos hayas
          pagado en los últimos doce meses. No respondemos por lucro cesante ni
          por daños indirectos. Nada de esto limita la responsabilidad que la ley
          no permite limitar.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Si terminamos">
        <Parrafo>
          Podés irte cuando quieras y podemos cerrar una cuenta que incumpla
          estos términos. En cualquiera de los dos casos te damos 30 días para
          llevarte tus datos antes de borrarlos, salvo que la baja sea por un uso
          gravemente indebido.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Cambios">
        <Parrafo>
          Si cambiamos estos términos, avisamos dentro del sistema con al menos
          30 días de anticipación cuando el cambio te afecte. Seguir usando Dlay
          después de esa fecha significa que los aceptás.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Ley aplicable">
        <Parrafo>
          Se aplica la ley argentina. Cualquier conflicto se resuelve ante los
          tribunales ordinarios de Río Cuarto, Provincia de Córdoba.
        </Parrafo>
      </Seccion>

      <Seccion titulo="Contacto">
        <Parrafo>
          {EMPRESA.titular ? (
            <>
              {EMPRESA.titular}
              {EMPRESA.cuit ? ` — CUIT ${EMPRESA.cuit}` : ""}
              <br />
              Responsable de {EMPRESA.nombre}
            </>
          ) : (
            EMPRESA.razonSocial
          )}
          <br />
          {EMPRESA.domicilio}
          <br />
          {EMPRESA.correo}
        </Parrafo>
      </Seccion>
    </Hoja>
  );
}
