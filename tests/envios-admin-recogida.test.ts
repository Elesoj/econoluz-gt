// tests/envios-admin-recogida.test.ts
//
// La Server Action de recogida en tienda: qué hace y, sobre todo, en qué orden.
//
// Se prueba leyendo el archivo, no ejecutándolo: `actions.ts` lleva la directiva
// "use server" y su import arrastra el entorno entero de Next. La lógica pura ya
// está cubierta en `envios-admin-operativo.test.ts`; lo que aquí importa es que
// la acción esté construida como debe.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuente = readFileSync("app/admin/envios/actions.ts", "utf8");

function cuerpoDe(nombre: string): string {
  const inicio = fuente.indexOf(`export async function ${nombre}`);
  assert.notEqual(inicio, -1, `no existe la Server Action ${nombre}`);
  const resto = fuente.slice(inicio);
  const fin = resto.indexOf("\nexport async function", 1);
  return fin === -1 ? resto : resto.slice(0, fin);
}

test("existe la Server Action de recogida en tienda", () => {
  assert.match(fuente, /export async function guardarRecogidaAction/);
});

test("comprueba el permiso ANTES de mirar el formulario", () => {
  const cuerpo = cuerpoDe("guardarRecogidaAction");
  const permiso = cuerpo.indexOf("verificarPermisoParaAccion");
  const validacion = cuerpo.indexOf("validarFormularioRecogida");

  assert.notEqual(permiso, -1, "debe comprobar el permiso");
  assert.notEqual(validacion, -1, "debe validar el formulario");
  assert.ok(
    permiso < validacion,
    "el permiso se comprueba primero: validar antes sería trabajar para quien no puede guardar",
  );
});

test("exige el permiso envios:escribir", () => {
  assert.match(cuerpoDe("guardarRecogidaAction"), /verificarPermisoParaAccion\("envios:escribir"\)/);
});

test("guarda con la infraestructura que ya existe, sin inventar clave nueva", () => {
  const cuerpo = cuerpoDe("guardarRecogidaAction");
  assert.match(cuerpo, /guardarRecogidaEnTienda/);
  const enUnaLinea = fuente.split("\n").join(" ");
  assert.match(enUnaLinea, /guardarRecogidaEnTienda.*from "\.\.\/\.\.\/lib\/ajustes\.server"/);
  // La clave y la auditoría `configurar_recogida` viven en `ajustes.server.ts`:
  // la acción no las repite ni las reinventa.
  assert.equal(cuerpo.includes("recogida_en_tienda"), false);
  assert.equal(cuerpo.includes("audit_log"), false);
});

test("no deja escapar el error de PostgreSQL a la barra de direcciones", () => {
  const cuerpo = cuerpoDe("guardarRecogidaAction");
  assert.equal(
    /encodeURIComponent\(\s*(mensaje|err|error)\b/.test(cuerpo),
    false,
    "el detalle del fallo va al registro, no a la URL",
  );
  assert.match(cuerpo, /registrar\(/, "debe dejar constancia del fallo");
});

test("redirige con confirmación o con error, como las demás acciones del panel", () => {
  const cuerpo = cuerpoDe("guardarRecogidaAction");
  assert.match(cuerpo, /redirect\("\/admin\/envios\?guardado=1"\)/);
  assert.match(cuerpo, /\/admin\/envios\?error=/);
});
