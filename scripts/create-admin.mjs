// Da de alta a quien administra el panel, y sirve también para cambiar una
// contraseña olvidada: volver a ejecutarlo con el mismo correo la reemplaza.
//
// No hay pantalla pública de registro a propósito. Un formulario de alta
// accesible desde internet convierte el panel en algo que cualquiera puede
// intentar abrir; esto exige tener la terminal del proyecto y la cadena de
// conexión de la base de datos.
//
// Uso:
//   npm run admin:crear

import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { hashPassword } from "../app/admin/auth/crypto.ts";
import { normalizeEmail } from "../app/admin/auth/policy.ts";
import { ROLES, validarRol } from "../app/admin/auth/types.ts";

/** Doce caracteres es el mínimo: `scrypt` frena la fuerza bruta, no la adivinanza. */
const LONGITUD_MINIMA = 12;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * El mensaje es corto a propósito: cualquier detalle sobre el entorno que se
 * imprima aquí acaba en el historial de la terminal.
 */
export function requireDatabaseUrl(env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL.");
  }
  return connectionString;
}

export function validatePasswordConfirmation(password, confirmation) {
  return password === confirmation;
}

/**
 * Crea el administrador o reemplaza su contraseña. Repetible por correo: es
 * justo lo que hace falta cuando alguien la olvida.
 *
 * `rol` es obligatorio y no lleva valor por defecto aquí tampoco: quien llama
 * a `saveAdmin` decide explícitamente qué rol guardar, igual que exige
 * `UpsertAdminUserInput`. Esta función no rechaza `empleado` por sí sola —esa
 * puerta se cierra en `main()`, antes de llegar aquí— para que las pruebas
 * puedan seguir ejerciendo el camino completo del alta sin invocar el CLI.
 */
export async function saveAdmin({ name, email, password, rol }, repository) {
  const correo = normalizeEmail(String(email ?? ""));
  if (!PATRON_CORREO.test(correo)) {
    throw new Error("El correo no tiene una forma válida.");
  }

  const nombre = String(name ?? "").trim();
  if (nombre.length === 0) {
    throw new Error("El nombre no puede quedar vacío.");
  }

  if (String(password ?? "").length < LONGITUD_MINIMA) {
    throw new Error("La contraseña debe tener al menos doce caracteres.");
  }

  const rolValidado = validarRol(rol);
  if (!rolValidado.ok) {
    throw new Error(`El rol debe ser uno de: ${ROLES.join(", ")}.`);
  }

  const { salt, hash } = await hashPassword(password);

  // La contraseña en claro no se guarda, ni se imprime, ni se devuelve.
  await repository.upsertAdminUser({
    email: correo,
    name: nombre,
    passwordHash: hash,
    salt,
    rol: rolValidado.rol,
    now: new Date(),
  });

  return correo;
}

/** Pregunta visible: nombre y correo no son secretos. */
function preguntar(rl, etiqueta) {
  return new Promise((resolve) => rl.question(etiqueta, (respuesta) => resolve(respuesta)));
}

/**
 * Lee sin mostrar lo que se escribe. El modo crudo se restaura siempre, hasta
 * si se cancela con Ctrl+C: dejar la terminal sin eco obliga a cerrarla.
 */
function preguntarSecreto(etiqueta) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(etiqueta);

    const eraCrudo = Boolean(stdin.isRaw);
    let escrito = "";

    const restaurar = () => {
      stdin.removeListener("data", alTeclear);
      if (stdin.isTTY) {
        stdin.setRawMode(eraCrudo);
      }
      stdin.pause();
      stdout.write("\n");
    };

    const alTeclear = (tecla) => {
      const texto = tecla.toString("utf8");

      for (const caracter of texto) {
        if (caracter === "\r" || caracter === "\n") {
          restaurar();
          resolve(escrito);
          return;
        }

        if (caracter === "\u0003") {
          // Ctrl+C: salir sin dejar la terminal muda.
          restaurar();
          reject(new Error("Cancelado."));
          return;
        }

        if (caracter === "\u007f" || caracter === "\b") {
          escrito = escrito.slice(0, -1);
          continue;
        }

        escrito += caracter;
      }
    };

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", alTeclear);
  });
}

/**
 * Arma el repositorio sin pasar por `repository.server.ts`. Ese módulo importa
 * "server-only", que Next resuelve con un alias propio y `node` no: el script
 * moría con "Cannot find package 'server-only'" justo después de pedir la
 * contraseña. El adaptador SQL es el mismo, así que no hay dos comportamientos.
 */
export async function createCliRepository(connectionString) {
  const { neon } = await import("@neondatabase/serverless");
  const { createAdminAuthRepository } = await import("../app/admin/auth/repository.ts");
  const sql = neon(connectionString);
  return createAdminAuthRepository((text, params) => sql.query(text, [...params]));
}

async function main() {
  const connectionString = requireDatabaseUrl(process.env);

  // Se conecta ANTES de preguntar nada: si algo falla, que falle antes de que
  // alguien escriba su contraseña dos veces para nada.
  const repositorio = await createCliRepository(connectionString);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  let nombre;
  let correo;
  let rolBruto;
  try {
    nombre = await preguntar(rl, "Nombre visible en el panel: ");
    correo = await preguntar(rl, "Correo electrónico: ");
    rolBruto = await preguntar(rl, `Rol (${ROLES.join("/")}): `);
  } finally {
    rl.close();
  }

  const rolValidado = validarRol(rolBruto.trim());
  if (!rolValidado.ok) {
    console.error(`El rol debe ser uno de: ${ROLES.join(", ")}. No se guardó nada.`);
    process.exit(1);
  }

  // Cerrado a propósito durante el subproyecto 9A: proteger solo las acciones
  // nuevas de envíos dejaría abiertas las de productos y proyectos, que
  // todavía comprueban únicamente que exista sesión. Una cuenta que aparenta
  // una restricción que no existe es peor que no tener roles. La restricción
  // de la base admite los dos valores; el que se cierra aquí es el camino de
  // alta. Ver db/014_roles_admin.sql y docs/superpowers/specs/2026-09-03-envios-tarifas-design.md §7.1.
  if (rolValidado.rol === "empleado") {
    console.error(
      "Durante el subproyecto 9A no se pueden crear cuentas de empleado.\n" +
        "Las acciones de productos y proyectos todavia comprueban solo que exista sesion,\n" +
        "asi que una cuenta 'limitada' tendria esas acciones abiertas.\n" +
        "Primero hay que aplicar la matriz de permisos a todas las acciones existentes.",
    );
    process.exit(1);
  }

  const password = await preguntarSecreto("Contraseña (no se muestra): ");
  const confirmacion = await preguntarSecreto("Repite la contraseña: ");

  if (!validatePasswordConfirmation(password, confirmacion)) {
    console.error("Las dos contraseñas no coinciden. No se guardó nada.");
    process.exit(1);
  }

  const guardado = await saveAdmin(
    { name: nombre, email: correo, password, rol: rolValidado.rol },
    repositorio,
  );

  console.log("");
  console.log(`Listo. Ya puedes entrar en /admin/entrar con ${guardado}.`);
  console.log("Si este correo ya existía, su contraseña quedó reemplazada y sus");
  console.log("sesiones abiertas se cerraron.");
}

// Solo se ejecuta al invocarlo desde la terminal: importarlo desde las pruebas
// no debe lanzar ninguna pregunta.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudo completar el alta.");
    process.exit(1);
  }
}
