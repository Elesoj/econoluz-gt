// Comprueba los invariantes de envíos, zonas y tarifas contra una base de datos real.
//
// Verifica que PostgreSQL impone en el esquema todos los invariantes definidos en 9A:
// unicidad de cobertura, exclusión GiST de tarifas, inmutabilidad de publicadas,
// no programación futura, borrado restringido, clave foránea compuesta en direcciones,
// serialización con for update, auditoría en la misma transacción y roles de admin.
//
// Añade además los invariantes de la migración 015: la zona capitalina de
// `user_addresses` y la configuración operativa sembrada en `app_settings`.
//
// Las tablas de 9A pueden no existir en la base contra la que se ejecute. Antes de
// consultarlas se comprueba su existencia en `information_schema`: si no está
// ninguna se omiten las comprobaciones 1–16 y se sigue con las 17 y 18; si están
// todas se ejecutan enteras; y si hay unas sí y otras no, se corta de inmediato,
// porque una instalación a medias no se puede verificar.
//
// Se ejecuta dentro de una transacción que SIEMPRE hace ROLLBACK, garantizando que
// no quede ningún dato residual. Exige la bandera explícita --produccion si se conecta a Producción.
//
// Uso:
//   npm run envios:verificar
//   npm run envios:verificar -- --contar
//   node scripts/verificar-envios.mjs --produccion [--contar]

import { fileURLToPath } from "node:url";
import { Client, neonConfig } from "@neondatabase/serverless";
import { endpointCanonico, decidirLecturaEnProduccion } from "./guarda-neon.mjs";

neonConfig.webSocketConstructor = globalThis.WebSocket;

const ENDPOINT_PRODUCCION = "ep-misty-sun-avmcbgly";

/** Las tres tablas del subproyecto 9A. Se conservan en la base, sin consumidores. */
export const TABLAS_9A = ["shipping_zones", "shipping_zone_areas", "shipping_rates"];

export function decidirDestinoVerificacion(argumentos = []) {
  return argumentos.includes("--produccion") ? "produccion" : "desarrollo";
}

export function validarDestinoVerificacion({ destino, host, hostProduccion = ENDPOINT_PRODUCCION }) {
  const conectado = endpointCanonico(host);
  const produccion = endpointCanonico(hostProduccion);

  if (destino === "produccion") {
    const decision = decidirLecturaEnProduccion({ host: conectado, hostProduccion: produccion });
    if (!decision.ok) {
      // El motivo de `decidirLecturaEnProduccion` distingue «falta saber cuál es
      // Producción» de «este no es Producción»; taparlo con un mensaje genérico
      // haría creer que el endpoint está mal cuando lo que falta es la variable.
      return {
        ok: false,
        motivo:
          decision.motivo ||
          `Se indicó --produccion pero el endpoint conectado no es el de Producción: ${host || "vacío"}.`,
      };
    }
    return { ok: true };
  }

  // Si destino es desarrollo, comprobar que no sea Producción
  if (conectado.includes(ENDPOINT_PRODUCCION) || (produccion && conectado === produccion)) {
    return {
      ok: false,
      motivo:
        "El endpoint conectado es de Producción; este comando requiere la bandera explícita --produccion para ejecutarse contra Producción.",
    };
  }

  return { ok: true };
}

/**
 * @param {readonly string[]} [tablasExistentes]
 * @returns {{ estado: "todas" | "ninguna" | "parcial"; encontradas: string[]; faltantes: string[] }}
 */
export function clasificarEstadoTablas9A(tablasExistentes = []) {
  const conjunto = new Set(tablasExistentes);
  const encontradas = TABLAS_9A.filter((t) => conjunto.has(t));
  const faltantes = TABLAS_9A.filter((t) => !conjunto.has(t));
  if (encontradas.length === TABLAS_9A.length) {
    return { estado: "todas", encontradas, faltantes: [] };
  }
  if (encontradas.length === 0) {
    return { estado: "ninguna", encontradas: [], faltantes: [...TABLAS_9A] };
  }
  return { estado: "parcial", encontradas, faltantes };
}

/** Las tablas de 9A no tienen consumidores: si traen filas, algo escribió fuera de la prueba. */
export function verificarPreflightTablas9A(conteos) {
  const total =
    (conteos.shipping_zones ?? 0) +
    (conteos.shipping_zone_areas ?? 0) +
    (conteos.shipping_rates ?? 0);
  if (total === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    motivo: `Las tablas de 9A contienen ${total} filas residuales fuera de la prueba. Deben estar limpias (0 filas).`,
  };
}

/** Pregunta al catálogo del sistema, nunca a las tablas: consultarlas podría fallar. */
export async function obtenerTablasExistentes9A(cliente) {
  const { rows } = await cliente.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any($1)`,
    [TABLAS_9A],
  );
  return rows.map((r) => String(r.table_name));
}

export async function contarTablasConfiguracion(cliente, tablasAContar = TABLAS_9A) {
  const conteos = {};
  for (const tabla of tablasAContar) {
    const { rows } = await cliente.query(`select count(*)::int as total from "${tabla}"`);
    conteos[tabla] = Number(rows[0]?.total ?? 0);
  }
  return conteos;
}

async function ejecutarConSavepoint(cliente, accion) {
  const sp = `sp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  await cliente.query(`savepoint ${sp}`);
  try {
    const resultado = await accion();
    await cliente.query(`release savepoint ${sp}`);
    return { ok: true, resultado };
  } catch (error) {
    await cliente.query(`rollback to savepoint ${sp}`);
    return { ok: false, error };
  }
}

/**
 * @param {{ query: (texto: string, parametros?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} cliente
 * @param {{ debeContar?: boolean; onBien?: (mensaje: string) => void; onMal?: (nombre: string, detalle?: string) => void }} [opciones]
 * @returns {Promise<void>}
 */
export async function ejecutarVerificaciones(cliente, { debeContar = false, onBien = () => {}, onMal = () => {} } = {}) {
  // Preflight: se pregunta al catálogo del sistema si las tablas de 9A existen
  // antes de tocarlas. Consultar una tabla inexistente aborta la transacción
  // entera en PostgreSQL, y entonces las comprobaciones 17 y 18 no llegarían a
  // ejecutarse.
  const tablasExistentes = await obtenerTablasExistentes9A(cliente);
  const diagnostico = clasificarEstadoTablas9A(tablasExistentes);

  if (diagnostico.estado === "parcial") {
    const motivo = `Instalación parcial incompleta del subproyecto 9A: existen [${diagnostico.encontradas.join(", ")}] pero faltan [${diagnostico.faltantes.join(", ")}]. Deben existir las 3 tablas o ninguna.`;
    onMal("Preflight tablas 9A", motivo);
    throw new Error(motivo);
  }

  let ejecutarBloque9A = false;
  if (diagnostico.estado === "ninguna") {
    onBien(
      "Aviso 9A: las tablas de 9A no existen en esta base. Se omiten las comprobaciones 1–16 y se continúa con las 17 y 18.",
    );
  } else {
    const conteosAntes = await contarTablasConfiguracion(cliente, diagnostico.encontradas);
    if (debeContar) {
      console.log("Conteos previos de tablas 9A:", conteosAntes);
    }
    const preflight = verificarPreflightTablas9A(conteosAntes);
    if (!preflight.ok) {
      onMal("Preflight tablas 9A", preflight.motivo);
      throw new Error(preflight.motivo);
    }
    onBien("Preflight 9A: las 3 tablas de configuración existen y tienen 0 filas");
    ejecutarBloque9A = true;
  }

  console.log("Iniciando transacción de verificación (concluirá siempre en ROLLBACK)...");
  await cliente.query("begin");

  /** @type {Array<{ nombre: string; detalle?: string }>} */
  const fallosAcumulados = [];
  /** @type {unknown} */
  let errorInesperado = null;

  const registrarBien = (mensaje) => onBien(mensaje);
  const registrarMal = (nombre, detalle) => {
    fallosAcumulados.push({ nombre, detalle });
    onMal(nombre, detalle);
  };

  try {
    if (ejecutarBloque9A) {
      // -------------------------------------------------------------------------
      // 1. Un municipio en dos zonas -> rechazado (violación de exclusión/unicidad)
      // -------------------------------------------------------------------------
      {
        const { rows: zA } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-muni-1', 'Zona Municipio 1', 'paqueteria', true)
           returning id`,
        );
        const { rows: zB } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-muni-2', 'Zona Municipio 2', 'paqueteria', true)
           returning id`,
        );

        await cliente.query(
          `insert into shipping_zone_areas (zone_id, municipio_codigo, activa)
           values ($1, '0101', true)`,
          [zA[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_zone_areas (zone_id, municipio_codigo, activa)
             values ($1, '0101', true)`,
            [zB[0].id],
          ),
        );

        if (!intento.ok && intento.error?.code === "23505") {
          registrarBien("1. Un municipio en dos zonas -> rechazado");
        } else {
          registrarMal("1. Un municipio en dos zonas -> rechazado", intento.error?.message || "se insertó duplicado");
        }
      }

      // -------------------------------------------------------------------------
      // 2. Un departamento en dos zonas -> rechazado
      // -------------------------------------------------------------------------
      {
        const { rows: zA } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-depto-1', 'Zona Depto 1', 'paqueteria', true)
           returning id`,
        );
        const { rows: zB } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-depto-2', 'Zona Depto 2', 'paqueteria', true)
           returning id`,
        );

        await cliente.query(
          `insert into shipping_zone_areas (zone_id, departamento_codigo, activa)
           values ($1, '02', true)`,
          [zA[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_zone_areas (zone_id, departamento_codigo, activa)
             values ($1, '02', true)`,
            [zB[0].id],
          ),
        );

        if (!intento.ok && intento.error?.code === "23505") {
          registrarBien("2. Un departamento en dos zonas -> rechazado");
        } else {
          registrarMal("2. Un departamento en dos zonas -> rechazado", intento.error?.message || "se insertó duplicado");
        }
      }

      // -------------------------------------------------------------------------
      // 3. Dos tarifas publicadas solapadas en la misma zona -> rechazado por gist exclude
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-solape', 'Zona Solape', 'paqueteria', true)
           returning id`,
        );

        await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
           values ($1, 3000, true, now() - interval '2 days')`,
          [z[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
             values ($1, 3500, true, now() - interval '1 day')`,
            [z[0].id],
          ),
        );

        if (!intento.ok && intento.error?.code === "23P01") {
          registrarBien("3. Dos tarifas publicadas solapadas en la misma zona -> rechazado por gist exclude");
        } else {
          registrarMal(
            "3. Dos tarifas publicadas solapadas en la misma zona -> rechazado por gist exclude",
            intento.error?.message || "se admitió el solapamiento",
          );
        }
      }

      // -------------------------------------------------------------------------
      // 4. Periodos contiguos -> aceptados
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-contigua', 'Zona Contigua', 'paqueteria', true)
           returning id`,
        );

        const { rows: t1 } = await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
           values ($1, 3000, true, now() - interval '1 day')
           returning id`,
          [z[0].id],
        );

        // Cerramos la primera en el instante actual
        await cliente.query(
          `update shipping_rates set vigente_hasta = now() where id = $1`,
          [t1[0].id],
        );

        // La segunda arranca en el instante actual: periodo contiguo [)
        const { rows: t2 } = await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
           values ($1, 3500, true, now())
           returning id`,
          [z[0].id],
        );

        const { rows: conteo } = await cliente.query(
          `select count(*)::int as n from shipping_rates where zone_id = $1 and publicada`,
          [z[0].id],
        );

        if (conteo[0]?.n === 2 && t2[0]?.id) {
          registrarBien("4. Periodos contiguos -> aceptados");
        } else {
          registrarMal("4. Periodos contiguos -> aceptados", `se esperaban 2 tarifas publicadas, salieron ${conteo[0]?.n}`);
        }
      }

      // -------------------------------------------------------------------------
      // 5. update del importe de una tarifa publicada -> rechazado por trigger inmutable
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-inmutable', 'Zona Inmutable', 'paqueteria', true)
           returning id`,
        );
        const { rows: t } = await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
           values ($1, 3000, true, now() - interval '1 hour')
           returning id`,
          [z[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `update shipping_rates set importe_cents = 3500 where id = $1`,
            [t[0].id],
          ),
        );

        if (!intento.ok && intento.error?.message?.includes("Una tarifa publicada no cambia sus campos")) {
          registrarBien("5. update del importe de una tarifa publicada -> rechazado por trigger inmutable");
        } else {
          registrarMal(
            "5. update del importe de una tarifa publicada -> rechazado por trigger inmutable",
            intento.error?.message || "se modificó el importe",
          );
        }
      }

      // -------------------------------------------------------------------------
      // 6. Despublicar una tarifa publicada -> rechazado
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-despub', 'Zona Despublicar', 'paqueteria', true)
           returning id`,
        );
        const { rows: t } = await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
           values ($1, 3000, true, now() - interval '1 hour')
           returning id`,
          [z[0].id],
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `update shipping_rates set publicada = false where id = $1`,
            [t[0].id],
          ),
        );

        if (!intento.ok && intento.error?.message?.includes("Una tarifa publicada no se despublica")) {
          registrarBien("6. Despublicar una tarifa publicada -> rechazado");
        } else {
          registrarMal(
            "6. Despublicar una tarifa publicada -> rechazado",
            intento.error?.message || "se permitió despublicar",
          );
        }
      }

      // -------------------------------------------------------------------------
      // 7. Cerrar vigente_hasta una vez -> aceptado; una segunda vez -> rechazado
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-cierre', 'Zona Cierre', 'paqueteria', true)
           returning id`,
        );
        const { rows: t } = await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
           values ($1, 3000, true, now() - interval '2 hours')
           returning id`,
          [z[0].id],
        );

        // Primer cierre: aceptado
        let primerCierreOk = false;
        try {
          await cliente.query(
            `update shipping_rates set vigente_hasta = now() where id = $1`,
            [t[0].id],
          );
          primerCierreOk = true;
        } catch {
          primerCierreOk = false;
        }

        // Segundo cierre: rechazado
        const segundoIntento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `update shipping_rates set vigente_hasta = now() - interval '10 minutes' where id = $1`,
            [t[0].id],
          ),
        );

        if (
          primerCierreOk &&
          !segundoIntento.ok &&
          segundoIntento.error?.message?.includes("se cierra una sola vez")
        ) {
          registrarBien("7. Cerrar vigente_hasta una vez -> aceptado; una segunda vez -> rechazado");
        } else {
          registrarMal(
            "7. Cerrar vigente_hasta una vez -> aceptado; una segunda vez -> rechazado",
            segundoIntento.error?.message || "el segundo cierre no fue rechazado",
          );
        }
      }

      // -------------------------------------------------------------------------
      // 8. Insertar publicada con vigente_hasta informado o vigente_desde futuro -> rechazado por trigger sin_programar
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-sin-prog', 'Zona Sin Prog', 'paqueteria', true)
           returning id`,
        );

        const intentoConHasta = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde, vigente_hasta)
             values ($1, 3000, true, now() - interval '1 hour', now())`,
            [z[0].id],
          ),
        );

        const intentoFutura = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
             values ($1, 3000, true, now() + interval '1 day')`,
            [z[0].id],
          ),
        );

        const hastaRechazado =
          !intentoConHasta.ok &&
          intentoConHasta.error?.message?.includes("sin fecha de fin");
        const futuraRechazada =
          !intentoFutura.ok &&
          intentoFutura.error?.message?.includes("no con fecha futura");

        if (hastaRechazado && futuraRechazada) {
          registrarBien("8. Insertar publicada con vigente_hasta informado o vigente_desde futuro -> rechazado por trigger sin_programar");
        } else {
          registrarMal(
            "8. Insertar publicada con vigente_hasta informado o vigente_desde futuro -> rechazado por trigger sin_programar",
            `hasta: ${intentoConHasta.error?.message}; futura: ${intentoFutura.error?.message}`,
          );
        }
      }

      // -------------------------------------------------------------------------
      // 9. Borrar una tarifa publicada -> rechazado; una nunca publicada -> aceptado
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-borrar-tarifa', 'Zona Borrar Tarifa', 'paqueteria', true)
           returning id`,
        );

        const { rows: tPub } = await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
           values ($1, 3000, true, now() - interval '1 hour')
           returning id`,
          [z[0].id],
        );

        const intentoBorrarPublicada = await ejecutarConSavepoint(cliente, () =>
          cliente.query(`delete from shipping_rates where id = $1`, [tPub[0].id]),
        );

        const { rows: tBorrador } = await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada)
           values ($1, 3000, false)
           returning id`,
          [z[0].id],
        );

        const borradoBorrador = await cliente.query(
          `delete from shipping_rates where id = $1`,
          [tBorrador[0].id],
        );

        const publicadaRechazada =
          !intentoBorrarPublicada.ok &&
          intentoBorrarPublicada.error?.message?.includes("Una tarifa publicada no se borra");
        const borradorAceptado = borradoBorrador.rowCount === 1;

        if (publicadaRechazada && borradorAceptado) {
          registrarBien("9. Borrar una tarifa publicada -> rechazado; una nunca publicada -> aceptado");
        } else {
          registrarMal(
            "9. Borrar una tarifa publicada -> rechazado; una nunca publicada -> aceptado",
            intentoBorrarPublicada.error?.message || "falló la verificación de borrado",
          );
        }
      }

      // -------------------------------------------------------------------------
      // 10. Borrar una zona con coberturas o tarifas -> rechazado; desactivarla -> aceptado
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-con-hijos', 'Zona Con Hijos', 'paqueteria', true)
           returning id`,
        );

        await cliente.query(
          `insert into shipping_zone_areas (zone_id, municipio_codigo, activa)
           values ($1, '0102', true)`,
          [z[0].id],
        );

        const intentoBorrar = await ejecutarConSavepoint(cliente, () =>
          cliente.query(`delete from shipping_zones where id = $1`, [z[0].id]),
        );

        const desactivar = await cliente.query(
          `update shipping_zones set activa = false where id = $1`,
          [z[0].id],
        );

        const borradoRechazado =
          !intentoBorrar.ok &&
          (intentoBorrar.error?.code === "23503" ||
            intentoBorrar.error?.code === "23001" ||
            intentoBorrar.error?.message?.toLowerCase().includes("foreign key") ||
            intentoBorrar.error?.message?.toLowerCase().includes("restrict"));
        const desactivacionAceptada = desactivar.rowCount === 1;

        if (borradoRechazado && desactivacionAceptada) {
          registrarBien("10. Borrar una zona con coberturas o tarifas -> rechazado; desactivarla -> aceptado");
        } else {
          registrarMal(
            "10. Borrar una zona con coberturas o tarifas -> rechazado; desactivarla -> aceptado",
            intentoBorrar.error?.message || "falló la verificación",
          );
        }
      }

      // -------------------------------------------------------------------------
      // 11. Borrar una zona sin nada colgando -> aceptado
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-vacia', 'Zona Vacia', 'paqueteria', true)
           returning id`,
        );

        const borrado = await cliente.query(
          `delete from shipping_zones where id = $1`,
          [z[0].id],
        );

        if (borrado.rowCount === 1) {
          registrarBien("11. Borrar una zona sin nada colgando -> aceptado");
        } else {
          registrarMal("11. Borrar una zona sin nada colgando -> aceptado", `filas borradas: ${borrado.rowCount}`);
        }
      }

      // -------------------------------------------------------------------------
      // 12. Municipio de otro departamento en user_addresses -> rechazado por foreign key compuesta
      // -------------------------------------------------------------------------
      {
        const { rows: u } = await cliente.query(
          `insert into users (firebase_uid, email, nombre)
           values ('test-usr-envios-12', 'test-envios-12@ejemplo.invalido', 'Test Envios')
           returning id`,
        );

        // '01' es Guatemala, pero '0201' es Guastatoya (El Progreso)
        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into user_addresses (
               user_id, destinatario, telefono, departamento, municipio,
               direccion, departamento_codigo, municipio_codigo
             ) values ($1, 'Destinatario', '12345678', 'Guatemala', 'Guastatoya', 'Calle 1', '01', '0201')`,
            [u[0].id],
          ),
        );

        if (!intento.ok && intento.error?.code === "23503") {
          registrarBien("12. Municipio de otro departamento en user_addresses -> rechazado por foreign key compuesta");
        } else {
          registrarMal(
            "12. Municipio de otro departamento en user_addresses -> rechazado por foreign key compuesta",
            intento.error?.message || "se admitió municipio ajeno al departamento",
          );
        }
      }

      // -------------------------------------------------------------------------
      // 13. Municipio con departamento nulo en user_addresses -> rechazado por check
      // -------------------------------------------------------------------------
      {
        const { rows: u } = await cliente.query(
          `insert into users (firebase_uid, email, nombre)
           values ('test-usr-envios-13', 'test-envios-13@ejemplo.invalido', 'Test Envios')
           returning id`,
        );

        const intento = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into user_addresses (
               user_id, destinatario, telefono, departamento, municipio,
               direccion, departamento_codigo, municipio_codigo
             ) values ($1, 'Destinatario', '12345678', 'Guatemala', 'Guatemala', 'Calle 1', null, '0101')`,
            [u[0].id],
          ),
        );

        if (!intento.ok && intento.error?.code === "23514") {
          registrarBien("13. Municipio con departamento nulo en user_addresses -> rechazado por check");
        } else {
          registrarMal(
            "13. Municipio con departamento nulo en user_addresses -> rechazado por check",
            intento.error?.message || "se admitió municipio con departamento nulo",
          );
        }
      }

      // -------------------------------------------------------------------------
      // 14. Dos sustituciones concurrentes con for update -> queda una sola publicada vigente
      // -------------------------------------------------------------------------
      {
        const { rows: z } = await cliente.query(
          `insert into shipping_zones (codigo, nombre, metodo, activa)
           values ('test-zona-sustitucion', 'Zona Sustitucion', 'paqueteria', true)
           returning id`,
        );
        const zoneId = z[0].id;

        // Tarifa inicial vigente
        await cliente.query(
          `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
           values ($1, 2000, true, now() - interval '2 hours')`,
          [zoneId],
        );

        // Función que ejecuta el patrón de sustitución con `for update`
        async function sustituirConForUpdate(nuevoImporte, instanteCorte) {
          // 1. Bloquear tarifa vigente
          const { rows: vigentes } = await cliente.query(
            `select id, importe_cents
               from shipping_rates
              where zone_id = $1 and publicada and vigente_hasta is null
                for update`,
            [zoneId],
          );
          const vigente = vigentes[0] ?? null;

          // 2. Cerrar la anterior en el instante de corte
          if (vigente) {
            await cliente.query(
              `update shipping_rates set vigente_hasta = $2 where id = $1`,
              [vigente.id, instanteCorte],
            );
          }

          // 3. Insertar la nueva tarifa en ese mismo instante
          const { rows: nueva } = await cliente.query(
            `insert into shipping_rates (zone_id, importe_cents, publicada, vigente_desde)
             values ($1, $2, true, $3)
             returning id, importe_cents`,
            [zoneId, nuevoImporte, instanteCorte],
          );

          return { anterior: vigente, nueva: nueva[0] };
        }

        // Ejecutar dos sustituciones consecutivas con instantes crecientes pasados para que vigente_hasta > vigente_desde
        const { rows: t1Time } = await cliente.query("select now() - interval '1 hour' as t");
        const { rows: t2Time } = await cliente.query("select now() as t");

        await sustituirConForUpdate(3000, t1Time[0].t);
        await sustituirConForUpdate(4000, t2Time[0].t);

        // Verificar que queda exactamente una sola tarifa publicada vigente
        const { rows: vigentes } = await cliente.query(
          `select count(*)::int as n
             from shipping_rates
            where zone_id = $1 and publicada and (vigente_hasta is null or vigente_hasta > now())`,
          [zoneId],
        );

        const { rows: cerradas } = await cliente.query(
          `select count(*)::int as n
             from shipping_rates
            where zone_id = $1 and publicada and vigente_hasta is not null`,
          [zoneId],
        );

        if (vigentes[0]?.n === 1 && cerradas[0]?.n === 2) {
          registrarBien("14. Dos sustituciones concurrentes con for update -> queda una sola publicada vigente");
        } else {
          registrarMal(
            "14. Dos sustituciones concurrentes con for update -> queda una sola publicada vigente",
            `vigentes: ${vigentes[0]?.n}, cerradas: ${cerradas[0]?.n}`,
          );
        }
      }

      // -------------------------------------------------------------------------
      // 15. audit_log recibe antes y despues en la misma transacción
      // -------------------------------------------------------------------------
      {
        const antes = { importe_cents: 3000, publicada: true };
        const despues = { importe_cents: 4000, publicada: true };

        const { rows: auditoria } = await cliente.query(
          `insert into audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, antes, despues)
           values ('admin', 'admin-verificador', 'publicar', 'shipping_rate', '999', $1, $2)
           returning id, antes, despues`,
          [JSON.stringify(antes), JSON.stringify(despues)],
        );

        const row = auditoria[0];
        const antesOk = row?.antes?.importe_cents === 3000;
        const despuesOk = row?.despues?.importe_cents === 4000;

        if (antesOk && despuesOk) {
          registrarBien("15. audit_log recibe antes y despues en la misma transacción");
        } else {
          registrarMal(
            "15. audit_log recibe antes y despues en la misma transacción",
            `antes: ${JSON.stringify(row?.antes)}, despues: ${JSON.stringify(row?.despues)}`,
          );
        }
      }

      // -------------------------------------------------------------------------
      // 16. Las cuentas existentes de admin_users quedan como administrador
      // -------------------------------------------------------------------------
      {
        const { rows } = await cliente.query(
          `select count(*)::int as total,
                  count(*) filter (where rol = 'administrador')::int as admins,
                  count(*) filter (where rol is null)::int as nulos,
                  count(*) filter (where rol not in ('administrador', 'empleado'))::int as invalidos
             from admin_users`,
        );

        const { total, admins, nulos, invalidos } = rows[0] ?? {};

        if (nulos === 0 && invalidos === 0 && admins === total) {
          registrarBien("16. Las cuentas existentes de admin_users quedan como administrador");
        } else {
          registrarMal(
            "16. Las cuentas existentes de admin_users quedan como administrador",
            `total: ${total}, admins: ${admins}, nulos: ${nulos}, invalidos: ${invalidos}`,
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // 17. Invariantes de zona_capitalina en user_addresses (migración 015)
    //
    // Se ejecuta SIEMPRE, exista 9A o no: la zona capitalina no depende de las
    // tablas de zonas de reparto.
    // -------------------------------------------------------------------------
    {
      const { rows: users } = await cliente.query(`select id from users limit 1`);
      let userId = users[0]?.id;
      if (!userId) {
        // Base recién creada. `users.firebase_uid` es `not null unique` en
        // db/009, así que hay que dárselo: omitirlo aborta la transacción entera
        // con un 23502 y las comprobaciones 17 y 18 no llegarían a terminar.
        // Va en savepoint por lo mismo: para que un fallo aquí se pueda contar
        // como fallo de la 17 en vez de tumbar el resto.
        const alta = await ejecutarConSavepoint(cliente, () =>
          cliente.query(
            `insert into users (firebase_uid, email, nombre, estado)
             values ('test-verif-015', 'test-verif-015@econoluz.test', 'Usuario Sintetico 015', 'activa')
             returning id`,
          ),
        );
        if (!alta.ok) {
          registrarMal(
            "17. Invariantes de zona_capitalina en user_addresses",
            `no se pudo crear el usuario sintético: ${alta.error.message ?? "error desconocido"}`,
          );
          userId = null;
        } else {
          userId = alta.resultado.rows[0]?.id;
        }
      }

      if (userId) {

      // 17.a. Municipio de Guatemala (0101) con zona 10 -> admitido
      const intentoValido = await ejecutarConSavepoint(cliente, () =>
        cliente.query(
          `insert into user_addresses (
             user_id, destinatario, telefono, direccion,
             departamento_codigo, municipio_codigo, departamento, municipio,
             zona_capitalina, predeterminada
           ) values (
             $1, 'Valido', '12345678', 'Zona 10 Calle Real',
             '01', '0101', 'Guatemala', 'Guatemala',
             10, false
           )`,
          [userId],
        ),
      );

      // 17.b. Zona 20, que no existe en la ciudad -> rechazado
      const intentoZona20 = await ejecutarConSavepoint(cliente, () =>
        cliente.query(
          `insert into user_addresses (
             user_id, destinatario, telefono, direccion,
             departamento_codigo, municipio_codigo, departamento, municipio,
             zona_capitalina, predeterminada
           ) values (
             $1, 'Zona 20', '12345678', 'Zona 20 Calle Falsa',
             '01', '0101', 'Guatemala', 'Guatemala',
             20, false
           )`,
          [userId],
        ),
      );

      // 17.c. Municipio de Guatemala sin zona -> lo rechaza la aplicación, no el
      // DDL: la columna admite NULL a propósito, porque las direcciones
      // históricas no tienen zona. Aquí se comprueba que la base lo acepta y que
      // por tanto la obligatoriedad tiene que imponerla `validarDireccion`.
      const intentoSinZona = await ejecutarConSavepoint(cliente, () =>
        cliente.query(
          `insert into user_addresses (
             user_id, destinatario, telefono, direccion,
             departamento_codigo, municipio_codigo, departamento, municipio,
             zona_capitalina, predeterminada
           ) values (
             $1, 'Sin Zona historica', '12345678', 'Calle sin zona',
             '01', '0101', 'Guatemala', 'Guatemala',
             null, false
           )`,
          [userId],
        ),
      );

      // 17.d. Mixco (0108) con zona no nula -> rechazado: sería la zona de otra
      // ciudad y el cálculo del envío la tomaría por capitalina.
      const intentoMixcoConZona = await ejecutarConSavepoint(cliente, () =>
        cliente.query(
          `insert into user_addresses (
             user_id, destinatario, telefono, direccion,
             departamento_codigo, municipio_codigo, departamento, municipio,
             zona_capitalina, predeterminada
           ) values (
             $1, 'Mixco con zona', '12345678', 'Calle Mixco',
             '01', '0108', 'Guatemala', 'Mixco',
             1, false
           )`,
          [userId],
        ),
      );

      if (intentoValido.ok && !intentoZona20.ok && intentoSinZona.ok && !intentoMixcoConZona.ok) {
        registrarBien(
          "17. Invariantes de zona_capitalina en user_addresses (migración 015) -> validados",
        );
      } else {
        registrarMal(
          "17. Invariantes de zona_capitalina en user_addresses",
          `zona 10 admitida: ${intentoValido.ok}, zona 20 rechazada: ${!intentoZona20.ok}, sin zona admitida: ${intentoSinZona.ok}, Mixco con zona rechazada: ${!intentoMixcoConZona.ok}`,
        );
      }
      }
    }

    // -------------------------------------------------------------------------
    // 18. Configuración operativa de envíos sembrada en app_settings (015)
    //
    // Las dos filas tienen que existir para poder bloquearlas con
    // `select ... for update` al guardar desde el panel.
    // -------------------------------------------------------------------------
    {
      const { rows } = await cliente.query(
        `select clave, valor from app_settings
          where clave in ('envios_zonas_metodos', 'envios_reglas_propias')`,
      );

      const claves = new Set(rows.map((r) => String(r.clave)));
      const tieneZonas = claves.has("envios_zonas_metodos");
      const tieneReglas = claves.has("envios_reglas_propias");

      if (tieneZonas && tieneReglas) {
        registrarBien(
          "18. Configuración operativa sembrada en app_settings (migración 015) -> presente",
        );
      } else {
        registrarMal(
          "18. Configuración operativa sembrada en app_settings",
          `envios_zonas_metodos: ${tieneZonas ? "OK" : "FALTA"}, envios_reglas_propias: ${tieneReglas ? "OK" : "FALTA"}`,
        );
      }
    }
  } catch (err) {
    errorInesperado = err;
  } finally {
    console.log("Revirtiendo transacción de prueba (ROLLBACK)...");
    try {
      await cliente.query("rollback");
    } catch (errRollback) {
      // El fallo del rollback no puede tapar el que lo provocó, pero tampoco se
      // silencia: si no había otro error, este pasa a ser el error.
      if (!errorInesperado) {
        errorInesperado = errRollback;
      }
    }
  }

  // Primero el error inesperado, que describe mejor lo que pasó que un recuento.
  if (errorInesperado) {
    throw errorInesperado;
  }

  if (fallosAcumulados.length > 0) {
    const resumen = fallosAcumulados
      .map((f, idx) => `  [${idx + 1}] ${f.nombre}${f.detalle ? `: ${f.detalle}` : ""}`)
      .join("\n");
    throw new Error(
      `La verificación de invariantes falló: se detectaron ${fallosAcumulados.length} fallos en comprobaciones:\n${resumen}`,
    );
  }


  // Si se pide --contar, verificamos tras el ROLLBACK que no quedó nada residual.
  // Solo si las tablas existen: contar una inexistente reventaría justo después
  // de haber pasado todas las comprobaciones.
  if (debeContar && ejecutarBloque9A) {
    const conteosDespues = await contarTablasConfiguracion(cliente, diagnostico.encontradas);
    const totalFilasDespues = Object.values(conteosDespues).reduce((a, b) => a + b, 0);
    if (totalFilasDespues === 0) {
      onBien("las 3 tablas de configuración tienen 0 filas tras la verificación (--contar)");
    } else {
      onMal(
        "las 3 tablas de configuración deben tener 0 filas tras el rollback",
        JSON.stringify(conteosDespues),
      );
    }
  }
}

async function principal() {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) {
    console.error("Falta DATABASE_URL en el entorno.");
    process.exit(1);
  }

  const host = new URL(cadena).host;
  const argumentos = process.argv.slice(2);
  const destino = decidirDestinoVerificacion(argumentos);
  const validacion = validarDestinoVerificacion({
    destino,
    host,
    hostProduccion: process.env.NEON_ENDPOINT_PRODUCCION || ENDPOINT_PRODUCCION,
  });

  if (!validacion.ok) {
    console.error(`Error de seguridad: ${validacion.motivo}`);
    process.exit(1);
  }

  const debeContar = argumentos.includes("--contar");

  console.log(`Base de datos:  ${host}`);
  console.log(`Destino:        ${destino === "produccion" ? "PRODUCCIÓN (--produccion)" : "DESARROLLO"}`);
  console.log(`Transacción:    Siempre ROLLBACK garantizado.`);
  console.log("");

  const cliente = new Client({ connectionString: cadena });
  await cliente.connect();

  const fallos = [];
  const bien = (mensaje) => console.log(`  ok     ${mensaje}`);
  const mal = (mensaje, detalle) => {
    console.log(`  FALLA  ${mensaje}${detalle ? `: ${detalle}` : ""}`);
    fallos.push(mensaje);
  };

  let errorDeVerificacion = null;
  try {
    await ejecutarVerificaciones(cliente, { debeContar, onBien: bien, onMal: mal });
  } catch (error) {
    // `ejecutarVerificaciones` ya hizo el ROLLBACK antes de lanzar. Se guarda para
    // decidir el código de salida después de cerrar la conexión.
    errorDeVerificacion = error;
  } finally {
    try {
      await cliente.end();
    } catch (errorCierre) {
      // Un fallo al cerrar no puede tapar el motivo real, pero tampoco se calla.
      console.error(
        `Aviso: la conexión no se cerró limpiamente: ${errorCierre instanceof Error ? errorCierre.message : String(errorCierre)}`,
      );
    }
  }

  console.log("");
  if (errorDeVerificacion) {
    console.error(
      errorDeVerificacion instanceof Error
        ? errorDeVerificacion.message
        : String(errorDeVerificacion),
    );
    process.exitCode = 1;
    return;
  }

  if (fallos.length === 0) {
    console.log("Todas las verificaciones de invariantes pasaron correctamente.");
  } else {
    console.error(`Se encontraron ${fallos.length} fallo(s) en la verificación.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
