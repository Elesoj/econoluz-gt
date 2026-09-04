# Envíos 9A: zonas, tarifas y cálculo — plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA: usa
> `superpowers:subagent-driven-development` (recomendada) o
> `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para poder marcarlos.

**Objetivo:** que ECONOLUZ pueda configurar zonas y tarifas de envío desde `/admin` y que
el servidor calcule el coste de envío de un pedido de forma determinista, sin sembrar ni un
solo importe comercial.

**Arquitectura:** cinco tablas nuevas cuyos invariantes impone PostgreSQL —cobertura con
claves foráneas reales, unicidad parcial por nivel y exclusión por rango para la vigencia—,
un servicio de dominio puro reutilizable por checkout, API y apps móviles, y una sección de
panel que administra configuración, no operaciones.

**Stack:** Next.js 16.3.1 (App Router), TypeScript 5.9.3 estricto, React 19.2.4,
PostgreSQL 18 en Neon con `@neondatabase/serverless`, pruebas con `node --test` y Playwright
(canal `msedge`).

**Especificación:** `docs/superpowers/specs/2026-09-03-envios-tarifas-design.md` — el plan
argumenta desde ella; quien ejecute debe leer las dos.

## Restricciones globales

Copiadas literalmente de la especificación. Se aplican a **todas** las tareas.

- **Todo importe se guarda en centavos enteros** (`integer`), nunca `numeric` ni coma
  flotante. `formatPrice` solo al pintar.
- **Nada que llegue del navegador se acepta como precio o tarifa.** El servidor recalcula
  productos, subtotal, tarifa, descuento e IVA.
- **El precio mostrado ya incluye el IVA del 12 %.**
- **Todo acceso a Postgres desde `app/**` pasa por `app/lib/datos`.** Ningún otro archivo
  importa `@neondatabase/serverless`; `tests/datos-frontera-controlador.test.ts` lo vigila.
- **ECONOLUZ no maneja stock, inventario, bodegas ni reservas.** Nada de lo que se escriba
  aquí puede reintroducirlo.
- **Ningún importe comercial** en migraciones, valores predeterminados ni código de
  producción. Las pruebas sí pueden usar cantidades ficticias, claramente identificadas.
- **Q35 y Q2,500 no se siembran ni se configuran automáticamente**: los carga el dueño.
- **El rol `econoluz_publico` no accede a ninguna tabla nueva**, ni a sus secuencias.
- **Sin `push`, sin `merge`, sin despliegue y sin ninguna escritura en Producción.**
- **Crear las ramas de Neon requiere autorización expresa del dueño** en el momento de
  ejecutarlas. No se crean por iniciativa propia.
- Idioma: **español de España** en comentarios de código nuevos, mensajes de commit y
  resúmenes. No se traducen nombres de variables, funciones, rutas ni salidas de terminal.
- La consola del dueño es **Windows PowerShell 5.1 y no entiende `&&`**: los comandos que
  se le den van en líneas separadas.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `db/012_geografia_gt.sql` | `geo_departamentos`, `geo_municipios` y su siembra |
| `db/013_envios_tarifas.sql` | Zonas, cobertura, tarifas, disparador, columnas de `user_addresses`, revocaciones |
| `db/014_roles_admin.sql` | Columna `rol` en `admin_users`, en tres pasos |
| `db/datos/geografia-gt.json` | Instantánea normalizada del catálogo del INE |
| `app/envios/contratos.ts` | Tipos internos, DTO público y motivos |
| `app/envios/geografia.ts` | Normalización de nombres y emparejamiento inequívoco |
| `app/envios/zonas.ts` | Resolución pura de zona |
| `app/envios/tarifas.ts` | Cálculo puro: límites, gratuidad, plazo |
| `app/envios/validacion.ts` | Límites de entrada y mensajes en castellano |
| `app/envios/envios.server.ts` | Lectura desde `app/lib/datos`, caché y orquestación |
| `app/admin/envios/zonas.ts` / `.server.ts` | Validación y consultas de zonas |
| `app/admin/envios/tarifas.ts` / `.server.ts` | Validación y escrituras de tarifas |
| `app/admin/envios/cobertura.server.ts` | Resumen de cobertura en tres estados |
| `app/admin/envios/actions.ts` | Server Actions del panel |
| `app/admin/(panel)/envios/page.tsx` | Portada de envíos |
| `app/admin/(panel)/envios/[zona]/page.tsx` | Ficha de zona |
| `scripts/verificar-envios.mjs` | `npm run envios:verificar` |
| `scripts/preparar-geografia.mjs` | Genera y verifica la instantánea desde el PDF |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `app/admin/auth/authorization.server.ts` | `verificarPermisoParaAccion` |
| `app/admin/auth/types.ts` | `rol` obligatorio en `UpsertAdminUserInput` |
| `app/admin/auth/repository.server.ts` | Leer y escribir `rol` |
| `scripts/create-admin.mjs` | Exigir rol y rechazar `empleado` |
| `scripts/verificar-permisos.mjs` | Las cinco tablas nuevas |
| `app/cuenta/direcciones/FormularioDireccion.tsx` | Dos `<select>` encadenados |
| `app/identidad/direcciones.ts` / `.server.ts` | Códigos junto al texto |
| `package.json` | Scripts y listas de pruebas |
| `playwright.config.ts` | `testMatch` |
| `CLAUDE.md`, `docs/CONTINUAR-PANEL.md` | Estado, recuento de tablas, fases 9A/9B |

---

## Tarea 1: Cerrar la fuente geográfica

Requisito previo de todo lo demás: sin catálogo verificado no hay migración.

**Archivos:**
- Crear: `scripts/preparar-geografia.mjs`
- Crear: `db/datos/geografia-gt.json`
- Crear: `db/datos/geografia-gt.FUENTE.md`
- Modificar: `docs/superpowers/specs/2026-09-03-envios-tarifas-design.md` §4.2.1 y §4.2.3
- Test: `tests/geografia-instantanea.test.ts`

**Interfaces:**
- Produce: `db/datos/geografia-gt.json` con la forma
  `{ "departamentos": [{ "codigo": "01", "nombre": "Guatemala" }, …],
     "municipios": [{ "codigo": "0101", "departamento": "01", "nombre": "Guatemala" }, …] }`,
  ordenado por `codigo` ascendente y serializado con dos espacios de sangría y salto final.

- [ ] **Paso 1: Descargar el PDF y comprobar su huella**

```bash
curl -sSL -o /tmp/BOLETA-ENEIC_LARGA.pdf "https://www.ine.gob.gt/wp-content/uploads/2025/06/BOLETA-ENEIC_LARGA.pdf"
sha256sum /tmp/BOLETA-ENEIC_LARGA.pdf
```

Esperado exactamente:
`1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e`

**Si la huella no coincide, detente y avisa al dueño.** El INE ha republicado el documento y
la especificación necesita actualizarse antes de seguir.

- [ ] **Paso 2: Registrar las correcciones conocidas**

De la extracción del 03/09/2026 salieron **340 códigos únicos y 339 nombres emparejados
automáticamente**. Las dos correcciones conocidas van a `db/datos/geografia-gt.FUENTE.md`
antes de generar nada:

```markdown
# Procedencia del catálogo geográfico

Fuente primaria: Instituto Nacional de Estadística de Guatemala (INE),
ENEIC 2024-2025, boleta larga, tabla «Lista de códigos de los municipios de la
República de Guatemala», página 7.
SHA-256 del PDF: 1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e

## Correcciones aplicadas

| Código | Como aparece en el PDF | Como se almacena | Motivo |
|---|---|---|---|
| 1330 | Santiago Chimaltenanango | Santiago Chimaltenango | Errata tipográfica del documento |
| 0923 | La Esperanza | La Esperanza | El texto es correcto y legible en la página 7; falló la extracción automática, no la fuente |
```

**`0923` es La Esperanza, Quetzaltenango**, entre `0922 Flores Costa Cuca` y
`0924 Palestina de los Altos`. Está confirmado contra la página 7 por el dueño: **no es un
dato inferido ni una celda vacía**, sino un fallo de la extracción por coordenadas.

Si aparece cualquier otra discrepancia, se añade a esa tabla con su respaldo en la página 7.
**Nada se corrige de memoria ni en silencio.**

- [ ] **Paso 3: Escribir la prueba de la instantánea**

```ts
// tests/geografia-instantanea.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalogo = JSON.parse(readFileSync("db/datos/geografia-gt.json", "utf8"));

test("el catálogo trae 22 departamentos y 340 municipios", () => {
  assert.equal(catalogo.departamentos.length, 22);
  assert.equal(catalogo.municipios.length, 340);
});

test("los códigos de departamento van de 01 a 22 y son únicos", () => {
  const codigos = catalogo.departamentos.map((d) => d.codigo);
  assert.equal(new Set(codigos).size, 22);
  for (const c of codigos) assert.match(c, /^(0[1-9]|1[0-9]|2[0-2])$/);
});

test("cada municipio tiene cuatro dígitos y pertenece a su departamento", () => {
  const departamentos = new Set(catalogo.departamentos.map((d) => d.codigo));
  for (const m of catalogo.municipios) {
    assert.match(m.codigo, /^\d{4}$/, `código inválido: ${m.codigo}`);
    assert.equal(m.codigo.slice(0, 2), m.departamento, `no encaja: ${m.codigo}`);
    assert.ok(departamentos.has(m.departamento), `departamento desconocido: ${m.departamento}`);
  }
});

test("los códigos de municipio son únicos y ningún nombre está vacío", () => {
  const codigos = catalogo.municipios.map((m) => m.codigo);
  assert.equal(new Set(codigos).size, 340);
  for (const m of catalogo.municipios) {
    assert.ok(m.nombre.trim().length > 0, `sin nombre: ${m.codigo}`);
  }
});

test("no se comprueba continuidad: los saltos de código son legítimos", () => {
  // Esta prueba documenta una decisión: un código oficial no tiene por qué
  // ser correlativo, así que la completitud se mide contra este conjunto
  // versionado y no contra una secuencia.
  const numeros = catalogo.municipios.map((m) => Number(m.codigo)).sort((a, b) => a - b);
  assert.ok(numeros.length === 340);
});

// Las tres filas que la extracción automática no resolvió sola. Se prueban por
// su nombre exacto porque son justo las que un refactor del extractor puede
// volver a romper sin que nadie se entere.
const busca = (codigo) => catalogo.municipios.find((m) => m.codigo === codigo);

test("0923 es La Esperanza, y su vecino 0924 sigue siendo Palestina de los Altos", () => {
  assert.deepEqual(busca("0923"), { codigo: "0923", departamento: "09", nombre: "La Esperanza" });
  assert.deepEqual(busca("0924"), { codigo: "0924", departamento: "09", nombre: "Palestina de los Altos" });
});

test("la errata de 1330 está corregida y no reintroducida", () => {
  assert.equal(busca("1330").nombre, "Santiago Chimaltenango");
  assert.equal(catalogo.municipios.some((m) => m.nombre.includes("Chimaltenanango")), false);
});

test("toda corrección aplicada está documentada en el archivo de procedencia", () => {
  const fuente = readFileSync("db/datos/geografia-gt.FUENTE.md", "utf8");
  for (const codigo of ["0923", "1330"]) {
    assert.ok(fuente.includes(codigo), `sin documentar: ${codigo}`);
  }
  assert.match(fuente, /1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e/);
});
```

- [ ] **Paso 4: Ejecutar la prueba y verla fallar**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/geografia-instantanea.test.ts
```

Esperado: FALLA con `ENOENT` sobre `db/datos/geografia-gt.json`.

- [ ] **Paso 5: Escribir `scripts/preparar-geografia.mjs`**

Genera la instantánea desde el PDF y **no la escribe si no cuadra**. Sin dependencias
nuevas: `zlib` de Node basta para inflar los streams.

```js
// Genera db/datos/geografia-gt.json desde la boleta del INE.
// Se niega a escribir si el conteo no es exactamente 22 y 340.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

const HUELLA_PDF = "1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e";
const ESPACIO = 180; // por debajo es kerning, por encima es un espacio real

const pdf = readFileSync(process.argv[2]);
const huella = createHash("sha256").update(pdf).digest("hex");
if (huella !== HUELLA_PDF) {
  console.error(`Huella del PDF inesperada:\n  esperada ${HUELLA_PDF}\n  obtenida ${huella}`);
  process.exit(1);
}
```

**El algoritmo de extracción, ya resuelto y verificado el 03/09/2026.** No lo reinventes:

1. **Inflar los streams.** Recorre los `stream … endstream` del PDF y pasa cada uno por
   `inflateSync`, ignorando los que fallen (imágenes y streams sin comprimir). La tabla vive
   en el único stream que contiene la cadena `Amatitl`.
2. **Reconstruir con coordenadas.** Recorre los operadores `Td`, `TD`, `Tm`, `Tj` y `TJ`
   llevando la posición `(x, y)`. Dentro de un array `TJ`, inserta un espacio **solo** si el
   ajuste numérico es `>= 180` en valor absoluto; por debajo es kerning, y no separarlo es
   lo que evita que salga `San P edro`.
3. **Separar códigos de nombres.** Código es `/^\d{3,4}$/` con valor `< 3000`: los `>= 3000`
   son códigos de país que la misma boleta incluye (`3030` Cuba, `4007` Bélgica, `5008`
   China) y no son municipios.
4. **Emparejar por columna.** El nombre de un código está a su derecha y algo más abajo.
   Tolerancias verificadas: `dx = nombre.x - codigo.x` en `[-30, 110]` y
   `dy = codigo.y - nombre.y` en `[-10, 30]`; entre los candidatos, gana el de menor
   `dy * 2 + |dx|`. Con estas tolerancias salieron **340 códigos únicos y 339 nombres**, y
   se comprobó que ampliarlas desde un margen más estrecho **no alteró ni un solo
   emparejamiento previo**: cero cambios, once huecos rellenados.
5. **Completar con cero inicial** los códigos de tres cifras y derivar el departamento de
   los dos primeros dígitos.

**El objetivo es que el extractor saque `0923 → La Esperanza` por sí solo.** Si con las
tolerancias de arriba sigue sin resolverlo, aplica una **corrección puntual declarada**, que
es preferible a relajar las tolerancias globales y arriesgarse a mover otros 339
emparejamientos:

```js
// Correcciones puntuales respaldadas por la página 7 del PDF y documentadas en
// db/datos/geografia-gt.FUENTE.md. Se aplican DESPUÉS del emparejado automático
// y el script avisa de cada una, para que ninguna pase inadvertida.
const CORRECCIONES = {
  "0923": "La Esperanza",           // legible en la página 7; falla la extracción por coordenadas
  "1330": "Santiago Chimaltenango", // errata tipográfica del documento
};

for (const [codigo, nombre] of Object.entries(CORRECCIONES)) {
  const fila = municipios.find((m) => m.codigo === codigo);
  if (!fila) {
    console.error(`La corrección de ${codigo} no encuentra su fila. Revisa la extracción.`);
    process.exit(1);
  }
  if (fila.nombre !== nombre) {
    console.warn(`Corrección aplicada en ${codigo}: ${JSON.stringify(fila.nombre)} -> ${nombre}`);
    fila.nombre = nombre;
  }
}
```

```js
// La verificación final es la que manda: si no cuadra, no se escribe nada.
if (departamentos.length !== 22 || municipios.length !== 340) {
  console.error(`Conteo inesperado: ${departamentos.length} departamentos, ${municipios.length} municipios.`);
  process.exit(1);
}
if (new Set(municipios.map((m) => m.codigo)).size !== 340) {
  console.error("Hay códigos de municipio repetidos.");
  process.exit(1);
}
if (municipios.some((m) => !m.nombre?.trim())) {
  const huecos = municipios.filter((m) => !m.nombre?.trim()).map((m) => m.codigo);
  console.error(
    `Sin nombre: ${huecos.join(", ")}.\n` +
      "Compruébalos en la página 7 del PDF y declara la corrección en CORRECCIONES.\n" +
      "No los rellenes de memoria, y no des por vacía una celda que quizá sí trae texto.",
  );
  process.exit(1);
}
writeFileSync("db/datos/geografia-gt.json", JSON.stringify({ departamentos, municipios }, null, 2) + "\n");
```

- [ ] **Paso 6: Generar la instantánea y ejecutar las pruebas**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON ./scripts/preparar-geografia.mjs /tmp/BOLETA-ENEIC_LARGA.pdf
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/geografia-instantanea.test.ts
```

Esperado: PASA, ocho pruebas.

- [ ] **Paso 7: Registrar la segunda huella en la especificación**

```bash
sha256sum db/datos/geografia-gt.json
```

Escribe ese valor en la fila «SHA-256 de la instantánea normalizada» de §4.2.1 y comprueba
que la tabla de correcciones de §4.2.3 coincide **exactamente** con `CORRECCIONES` del
script y con `db/datos/geografia-gt.FUENTE.md`: las tres tienen que decir lo mismo.

**Esta tarea no está terminada hasta que la huella esté escrita.** Ninguna migración puede
crearse antes; es el criterio de aceptación 14.

- [ ] **Paso 8: Dar de alta la prueba y hacer commit**

Añade `tests/geografia-instantanea.test.ts` al final de la lista de `test:datos` en
`package.json`, y `"geografia:preparar"` a los scripts.

```bash
git add db/datos scripts/preparar-geografia.mjs tests/geografia-instantanea.test.ts package.json docs/superpowers/specs/2026-09-03-envios-tarifas-design.md
git commit -m "feat(envios): incorporar el catalogo geografico del INE verificado"
```

---

## Tarea 2: Migración `012` — geografía

**Archivos:**
- Crear: `db/012_geografia_gt.sql`
- Test: `tests/geografia-migracion.test.ts`

**Interfaces:**
- Consume: `db/datos/geografia-gt.json` de la tarea 1.
- Produce: tablas `geo_departamentos(codigo, nombre)` y
  `geo_municipios(codigo, departamento_codigo, nombre)`, con `unique (codigo, departamento_codigo)`.

- [ ] **Paso 1: Escribir la prueba estructural del SQL**

```ts
// tests/geografia-migracion.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("db/012_geografia_gt.sql", "utf8");

test("cita la fuente oficial con su huella", () => {
  assert.match(sql, /Instituto Nacional de Estad[íi]stica/i);
  assert.match(sql, /1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e/);
});

test("la clave compuesta que necesita user_addresses existe", () => {
  assert.match(sql, /unique\s*\(\s*codigo\s*,\s*departamento_codigo\s*\)/i);
});

test("el municipio comprueba que pertenece a su departamento", () => {
  assert.match(sql, /left\s*\(\s*codigo\s*,\s*2\s*\)\s*=\s*departamento_codigo/i);
});

test("inserta las 362 filas del catálogo", () => {
  const catalogo = JSON.parse(readFileSync("db/datos/geografia-gt.json", "utf8"));
  const valores = sql.match(/^\s*\('/gm) ?? [];
  assert.equal(valores.length, catalogo.departamentos.length + catalogo.municipios.length);
});

test("no consulta Internet", () => {
  assert.doesNotMatch(sql, /https?:\/\/(?!www\.ine\.gob\.gt)/);
  assert.doesNotMatch(sql, /\bcopy\b.*\bfrom\b.*\bprogram\b/i);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/geografia-migracion.test.ts
```

Esperado: FALLA con `ENOENT` sobre `db/012_geografia_gt.sql`.

- [ ] **Paso 3: Escribir la migración**

Genera los `insert` desde el JSON con un script de un solo uso; no los teclees. Cabecera
obligatoria:

```sql
-- Geografía oficial de Guatemala: departamentos y municipios.
--
-- Fuente primaria: Instituto Nacional de Estadística de Guatemala (INE),
-- Encuesta Nacional de Empleo e Ingresos Continua ENEIC 2024-2025, boleta larga,
-- tabla «Lista de códigos de los municipios de la República de Guatemala», página 7.
-- SHA-256 del PDF: 1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e
-- Universo validado con el DINESE, diciembre de 2023, §2.4: 22 departamentos,
-- 340 municipios, códigos departamentales 01-22.
--
-- Los códigos municipales de tres cifras del PDF se almacenan con cero inicial
-- como char(4); el departamento son sus dos primeros dígitos.
--
-- Las erratas corregidas están en db/datos/geografia-gt.FUENTE.md. Ninguna se
-- aplica sin quedar escrita ahí.

create table if not exists geo_departamentos (
  codigo char(2)  primary key,
  nombre text     not null unique
);

create table if not exists geo_municipios (
  codigo              char(4) primary key,
  departamento_codigo char(2) not null references geo_departamentos(codigo),
  nombre              text    not null,
  constraint geo_municipios_pertenece
    check (left(codigo, 2) = departamento_codigo),
  constraint geo_municipios_nombre_unico unique (departamento_codigo, nombre),
  constraint geo_municipios_codigo_y_departamento unique (codigo, departamento_codigo)
);

insert into geo_departamentos (codigo, nombre) values
  ('01', 'Guatemala'),
  -- … las 22 …
on conflict (codigo) do nothing;

insert into geo_municipios (codigo, departamento_codigo, nombre) values
  ('0101', '01', 'Guatemala'),
  -- … las 340 …
on conflict (codigo) do nothing;

revoke all on geo_departamentos, geo_municipios from econoluz_publico;
```

- [ ] **Paso 4: Ejecutar las pruebas**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/geografia-migracion.test.ts
```

Esperado: PASA, cinco pruebas.

- [ ] **Paso 5: Dar de alta y hacer commit**

```bash
git add db/012_geografia_gt.sql tests/geografia-migracion.test.ts package.json
git commit -m "feat(envios): migracion 012 con la geografia oficial"
```

---

## Tarea 3: Migración `013` — zonas, cobertura y tarifas

**Archivos:**
- Crear: `db/013_envios_tarifas.sql`
- Test: `tests/envios-migracion.test.ts`

**Interfaces:**
- Produce: `shipping_zones`, `shipping_zone_areas`, `shipping_rates` y el disparador
  `shipping_rates_inmutable()`.

- [ ] **Paso 1: Escribir la prueba estructural**

```ts
// tests/envios-migracion.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("db/013_envios_tarifas.sql", "utf8");

test("ninguna clave foránea hacia zonas borra en cascada", () => {
  assert.doesNotMatch(sql, /references\s+shipping_zones\s*\(\s*id\s*\)\s*on\s+delete\s+cascade/i);
  const restricts = sql.match(/references\s+shipping_zones\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/gi) ?? [];
  assert.equal(restricts.length, 2, "cobertura y tarifas deben restringir el borrado");
});

test("la cobertura usa claves foráneas reales y exige exactamente un ámbito", () => {
  assert.match(sql, /departamento_codigo\s+char\(2\)\s+references\s+geo_departamentos/i);
  assert.match(sql, /municipio_codigo\s+char\(4\)\s+references\s+geo_municipios/i);
  assert.match(sql, /num_nonnulls\s*\(\s*departamento_codigo\s*,\s*municipio_codigo\s*\)\s*=\s*1/i);
});

test("hay unicidad parcial por nivel", () => {
  assert.match(sql, /unique index[^;]*\(departamento_codigo\)\s*where\s+departamento_codigo\s+is\s+not\s+null/is);
  assert.match(sql, /unique index[^;]*\(municipio_codigo\)\s*where\s+municipio_codigo\s+is\s+not\s+null/is);
});

test("una sola tarifa publicada vigente por zona", () => {
  assert.match(sql, /exclude\s+using\s+gist\s*\(\s*zone_id\s+with\s+=\s*,\s*periodo\s+with\s+&&\s*\)\s*where\s*\(\s*publicada\s*\)/i);
});

test("user_addresses gana la clave compuesta y su check", () => {
  assert.match(sql, /foreign key\s*\(\s*municipio_codigo\s*,\s*departamento_codigo\s*\)/i);
  assert.match(sql, /municipio_codigo is null or departamento_codigo is not null/i);
});

test("el rol público queda revocado en las tres tablas y sus secuencias", () => {
  for (const t of ["shipping_zones", "shipping_zone_areas", "shipping_rates"]) {
    assert.match(sql, new RegExp(`revoke all[^;]*${t}[^;]*econoluz_publico`, "is"), t);
  }
  assert.match(sql, /revoke all[^;]*sequences[^;]*econoluz_publico/is);
});

test("no siembra ninguna tarifa ni zona", () => {
  assert.doesNotMatch(sql, /insert\s+into\s+shipping_(zones|zone_areas|rates)/i);
});

test("no hay importes comerciales escritos", () => {
  assert.doesNotMatch(sql, /\b3500\b|\b250000\b/);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

Esperado: FALLA con `ENOENT` sobre `db/013_envios_tarifas.sql`.

- [ ] **Paso 3: Escribir la migración**

Copia las tres tablas de la especificación §4.4, §4.5 y §4.7 **tal cual**, y añade el
disparador y los `alter` de `user_addresses` de §4.3:

```sql
-- Impide reescribir una tarifa publicada. La única modificación permitida es
-- cerrar vigente_hasta una vez, de null a una fecha, durante la sustitución.
create or replace function shipping_rates_inmutable() returns trigger as $$
begin
  if old.publicada then
    if new.importe_cents is distinct from old.importe_cents
       or new.umbral_gratis_cents is distinct from old.umbral_gratis_cents
       or new.max_piezas is distinct from old.max_piezas
       or new.max_importe_cents is distinct from old.max_importe_cents
       or new.plazo_min_dias is distinct from old.plazo_min_dias
       or new.plazo_max_dias is distinct from old.plazo_max_dias
       or new.zone_id is distinct from old.zone_id
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'Una tarifa publicada no cambia sus campos economicos';
    end if;
    if not new.publicada then
      raise exception 'Una tarifa publicada no se despublica';
    end if;
    if old.vigente_hasta is not null and new.vigente_hasta is distinct from old.vigente_hasta then
      raise exception 'La vigencia de una tarifa publicada se cierra una sola vez';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger shipping_rates_no_reescribir
  before update on shipping_rates
  for each row execute function shipping_rates_inmutable();

-- Sin programación futura: una tarifa se publica abierta y en el momento.
create or replace function shipping_rates_sin_programar() returns trigger as $$
begin
  if new.publicada then
    if new.vigente_hasta is not null then
      raise exception 'Una tarifa se publica abierta, sin fecha de fin';
    end if;
    if new.vigente_desde > now() then
      raise exception 'Una tarifa se publica en el momento, no con fecha futura';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger shipping_rates_no_programar
  before insert on shipping_rates
  for each row execute function shipping_rates_sin_programar();

-- Borrar una tarifa publicada no está permitido; se sustituye.
create or replace function shipping_rates_no_borrar() returns trigger as $$
begin
  if old.publicada then
    raise exception 'Una tarifa publicada no se borra';
  end if;
  return old;
end;
$$ language plpgsql;

create trigger shipping_rates_borrado_restringido
  before delete on shipping_rates
  for each row execute function shipping_rates_no_borrar();
```

- [ ] **Paso 4: Ejecutar las pruebas**

Esperado: PASA, ocho pruebas.

- [ ] **Paso 5: Commit**

```bash
git add db/013_envios_tarifas.sql tests/envios-migracion.test.ts package.json
git commit -m "feat(envios): migracion 013 con zonas, cobertura y tarifas"
```

---

## Tarea 4: Migración `014` — el rol del panel

**Archivos:**
- Crear: `db/014_roles_admin.sql`
- Modificar: `app/admin/auth/types.ts`, `app/admin/auth/repository.server.ts`,
  `scripts/create-admin.mjs`
- Test: `tests/admin-roles.test.ts`

**Interfaces:**
- Produce: `admin_users.rol` (`'administrador' | 'empleado'`, **sin `default`**), y
  `UpsertAdminUserInput` con `rol: RolAdmin` **obligatorio**.

- [ ] **Paso 1: Escribir la prueba**

```ts
// tests/admin-roles.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarRol, ROLES } from "../app/admin/auth/types";

const sql = readFileSync("db/014_roles_admin.sql", "utf8");

test("la columna nace sin valor por defecto", () => {
  assert.doesNotMatch(sql, /add column\s+rol[^;]*default/i);
});

test("la migración va en tres pasos", () => {
  const orden = ["add column rol text", "update admin_users", "set not null", "check (rol in"];
  let desde = 0;
  for (const trozo of orden) {
    const i = sql.toLowerCase().indexOf(trozo.toLowerCase(), desde);
    assert.ok(i > -1, `falta el paso: ${trozo}`);
    desde = i;
  }
});

test("las cuentas existentes quedan como administrador", () => {
  assert.match(sql, /set rol = 'administrador'\s*\n?\s*where rol is null/i);
});

test("solo hay dos roles válidos", () => {
  assert.deepEqual([...ROLES], ["administrador", "empleado"]);
});

test("validarRol rechaza cualquier otra cosa", () => {
  assert.equal(validarRol("administrador").ok, true);
  assert.equal(validarRol("empleado").ok, true);
  assert.equal(validarRol("root").ok, false);
  assert.equal(validarRol("").ok, false);
  assert.equal(validarRol(undefined).ok, false);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

Esperado: FALLA por `ENOENT` y por `validarRol` inexistente.

- [ ] **Paso 3: Escribir la migración y el tipo**

```sql
-- El rol del panel. Sin default a propósito: un valor predeterminado de
-- administrador convertiría cualquier insert que olvide la columna en una
-- elevación de privilegios silenciosa.
alter table admin_users add column rol text;

update admin_users
set rol = 'administrador'
where rol is null;

alter table admin_users
  alter column rol set not null;

alter table admin_users
  add constraint admin_users_rol_valido
  check (rol in ('administrador', 'empleado'));
```

```ts
// app/admin/auth/types.ts — añadir
export const ROLES = ["administrador", "empleado"] as const;
export type RolAdmin = (typeof ROLES)[number];

export function validarRol(valor: unknown): { ok: true; rol: RolAdmin } | { ok: false } {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor)
    ? { ok: true, rol: valor as RolAdmin }
    : { ok: false };
}
```

`UpsertAdminUserInput` gana `rol: RolAdmin` **sin valor por defecto**, de modo que TypeScript
obligue a decidirlo en cada llamada.

- [ ] **Paso 4: Cerrar el alta de empleados**

En `scripts/create-admin.mjs`, tras validar el rol:

```js
if (rol === "empleado") {
  console.error(
    "Durante el subproyecto 9A no se pueden crear cuentas de empleado.\n" +
      "Las acciones de productos y proyectos todavia comprueban solo que exista sesion,\n" +
      "asi que una cuenta 'limitada' tendria esas acciones abiertas.\n" +
      "Primero hay que aplicar la matriz de permisos a todas las acciones existentes.",
  );
  process.exit(1);
}
```

- [ ] **Paso 5: Ejecutar las pruebas y hacer commit**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/admin-roles.test.ts
git add db/014_roles_admin.sql app/admin/auth scripts/create-admin.mjs tests/admin-roles.test.ts package.json
git commit -m "feat(admin): rol explicito sin valor por defecto"
```

---

## Tarea 5: Autorización por permiso

**Archivos:**
- Modificar: `app/admin/auth/authorization.server.ts`
- Test: `tests/admin-permisos.test.ts`

**Interfaces:**
- Produce: `puedeEscribirEnvios(rol: RolAdmin): boolean` (puro) y
  `verificarPermisoParaAccion(permiso: "envios:escribir"): Promise<SessionUser>`.

- [ ] **Paso 1: Escribir la prueba de la parte pura**

```ts
// tests/admin-permisos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { puedeEscribirEnvios } from "../app/admin/auth/permisos";

test("solo el administrador escribe la configuración de envíos", () => {
  assert.equal(puedeEscribirEnvios("administrador"), true);
  assert.equal(puedeEscribirEnvios("empleado"), false);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

Esperado: FALLA, módulo `permisos` inexistente.

- [ ] **Paso 3: Implementar**

`app/admin/auth/permisos.ts` (puro, sin `server-only`):

```ts
import type { RolAdmin } from "./types";

/** En 9A el empleado solo consulta. Los permisos operativos llegan en 9B. */
export const puedeEscribirEnvios = (rol: RolAdmin): boolean => rol === "administrador";
```

En `authorization.server.ts`, junto a `verificarSesionParaAccion`:

```ts
/**
 * El rol se relee de admin_users en cada acción: nunca se toma de la cookie ni
 * del formulario, y así un cambio de rol surte efecto sobre sesiones abiertas.
 */
export async function verificarPermisoParaAccion(permiso: "envios:escribir") {
  const usuario = await verificarSesionParaAccion();
  const rol = await leerRolDeLaBase(usuario.id);
  if (permiso === "envios:escribir" && !puedeEscribirEnvios(rol)) {
    redirect("/admin?error=sin-permiso");
  }
  return { ...usuario, rol };
}
```

- [ ] **Paso 4: Ejecutar la prueba y hacer commit**

```bash
git add app/admin/auth tests/admin-permisos.test.ts package.json
git commit -m "feat(admin): comprobar permiso ademas de sesion"
```

---

## Tarea 6: Contratos y validación de entrada

**Archivos:**
- Crear: `app/envios/contratos.ts`, `app/envios/validacion.ts`
- Test: `tests/envios-contratos.test.ts`

**Interfaces:**
- Produce: `DestinoDeEnvio`, `MotivoDeCotizacion`, `ResultadoDeEnvio`, `EnvioPublico`,
  `aEnvioPublico(r: ResultadoDeEnvio): EnvioPublico`, y de `validacion.ts`:
  `LIMITES`, `validarZona`, `validarTarifa`, `validarLineasEstimacion`.

- [ ] **Paso 1: Escribir la prueba**

```ts
// tests/envios-contratos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { aEnvioPublico } from "../app/envios/contratos";
import { validarZona, validarTarifa, validarLineasEstimacion } from "../app/envios/validacion";

const MOTIVOS = [
  "sin_cobertura", "zona_inactiva", "cobertura_desactivada",
  "sin_tarifa_vigente", "direccion_sin_codigos", "pedido_grande",
] as const;

test("los seis motivos internos producen el mismo estado público", () => {
  for (const motivo of MOTIVOS) {
    const publico = aEnvioPublico({ estimacion: false, tipo: "requiere_cotizacion", motivo });
    assert.equal(publico.estado, "cotizacion_requerida");
    assert.equal(JSON.stringify(publico).includes(motivo), false, `se filtró ${motivo}`);
  }
});

test("el DTO público no lleva identificadores internos", () => {
  const publico = aEnvioPublico({
    estimacion: false, tipo: "con_tarifa", zonaCodigo: "capital", zonaNombre: "Capital",
    metodo: "mensajero_propio", envioCents: 3500, gratuito: false,
    faltanParaGratisCents: 1000, plazoMinDias: 2, plazoMaxDias: 3,
  });
  const texto = JSON.stringify(publico);
  assert.equal(texto.includes("capital"), false);
  assert.equal(texto.includes("Capital"), false);
  assert.equal(texto.includes("mensajero_propio"), false);
});

test("carrito_no_comprable sí puede nombrar referencias públicas", () => {
  const publico = aEnvioPublico({
    estimacion: false, tipo: "carrito_no_comprable", referencias: ["ECO-0001"],
  });
  assert.equal(publico.estado, "carrito_no_comprable");
  assert.deepEqual(publico.referencias, ["ECO-0001"]);
});

test("la avería no se confunde con una cotización", () => {
  const publico = aEnvioPublico({ estimacion: false, tipo: "no_disponible", causa: "datos" });
  assert.equal(publico.estado, "servicio_no_disponible");
});

test("la recogida desactivada tiene su propio estado", () => {
  const publico = aEnvioPublico({
    estimacion: false, tipo: "metodo_no_disponible", metodo: "recogida_en_tienda",
  });
  assert.equal(publico.estado, "recogida_no_disponible");
});

test("la marca de estimación se conserva", () => {
  const publico = aEnvioPublico({ estimacion: true, tipo: "requiere_cotizacion", motivo: "sin_cobertura" });
  assert.equal(publico.estimacion, true);
});

test("el slug de zona respeta formato y longitud", () => {
  assert.equal(validarZona({ codigo: "capital", nombre: "Capital", notas: "" }).ok, true);
  assert.equal(validarZona({ codigo: "Capital", nombre: "Capital", notas: "" }).ok, false);
  assert.equal(validarZona({ codigo: "a", nombre: "Capital", notas: "" }).ok, false);
  assert.equal(validarZona({ codigo: "con espacio", nombre: "X", notas: "" }).ok, false);
  assert.equal(validarZona({ codigo: "z".repeat(41), nombre: "X", notas: "" }).ok, false);
});

test("los importes y límites de tarifa respetan sus rangos", () => {
  const base = { importeCents: 3500, umbralGratisCents: null, maxPiezas: null,
                 maxImporteCents: null, plazoMinDias: 2, plazoMaxDias: 3 };
  assert.equal(validarTarifa(base).ok, true);
  assert.equal(validarTarifa({ ...base, importeCents: -1 }).ok, false);
  assert.equal(validarTarifa({ ...base, importeCents: 100001 }).ok, false);
  assert.equal(validarTarifa({ ...base, maxPiezas: 0 }).ok, false);
  assert.equal(validarTarifa({ ...base, maxPiezas: 1000 }).ok, false);
  assert.equal(validarTarifa({ ...base, plazoMaxDias: 1 }).ok, false);
  assert.equal(validarTarifa({ ...base, plazoMaxDias: 61 }).ok, false);
  // El umbral NO se compara con el importe: es una promoción legítima.
  assert.equal(validarTarifa({ ...base, umbralGratisCents: 2000 }).ok, true);
});

test("la estimación anónima acota líneas y cantidades", () => {
  const linea = { econoluzReference: "ECO-0001", cantidad: 1 };
  assert.equal(validarLineasEstimacion([linea]).ok, true);
  assert.equal(validarLineasEstimacion([]).ok, false);
  assert.equal(validarLineasEstimacion(Array(101).fill(linea)).ok, false);
  assert.equal(validarLineasEstimacion([{ ...linea, cantidad: 0 }]).ok, false);
  assert.equal(validarLineasEstimacion([{ ...linea, cantidad: 1000 }]).ok, false);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

Esperado: FALLA, módulos inexistentes.

- [ ] **Paso 3: Implementar los dos módulos**

Copia los tipos de la especificación §5.3 y §5.4 tal cual. `LIMITES` recoge la tabla de
§5.6 bis:

```ts
export const LIMITES = {
  zonaCodigo: { patron: /^[a-z0-9]+(-[a-z0-9]+)*$/, min: 2, max: 40 },
  zonaNombre: { min: 2, max: 80 },
  zonaNotas: { min: 0, max: 500 },
  importeCents: { min: 0, max: 100_000 },
  umbralGratisCents: { min: 1, max: 10_000_000 },
  maxPiezas: { min: 1, max: 999 },
  maxImporteCents: { min: 1, max: 10_000_000 },
  plazoDias: { min: 0, max: 60 },
  lineasEstimacion: { max: 100 },
  cantidadPorLinea: { min: 1, max: 999 },
} as const;
```

`aEnvioPublico` es un `switch` exhaustivo sobre `tipo`. **No copia campos por difusión**
(`...r`): enumera uno a uno los que salen, que es lo que impide que un campo nuevo se filtre
sin que nadie lo decida.

- [ ] **Paso 4: Ejecutar las pruebas y hacer commit**

Esperado: PASA, diez pruebas.

```bash
git add app/envios tests/envios-contratos.test.ts package.json
git commit -m "feat(envios): contratos tipados y limites de entrada"
```

---

## Tarea 7: Resolución de zona

**Archivos:**
- Crear: `app/envios/zonas.ts`
- Test: `tests/envios-zonas.test.ts`

**Interfaces:**
- Consume: tipos de `contratos.ts`.
- Produce:
  `resolverZona(cobertura: readonly Cobertura[], destino: { departamentoCodigo: string; municipioCodigo: string }): ResolucionDeZona`,
  con `type Cobertura = { zoneId: number; departamentoCodigo: string | null; municipioCodigo: string | null; activa: boolean }`
  y `type ResolucionDeZona = { tipo: "zona"; zoneId: number } | { tipo: "sin_cobertura" } | { tipo: "cobertura_desactivada" }`.

- [ ] **Paso 1: Escribir la prueba**

```ts
// tests/envios-zonas.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { resolverZona } from "../app/envios/zonas";

const capital = { zoneId: 1, departamentoCodigo: null, municipioCodigo: "0101", activa: true };
const resto = { zoneId: 2, departamentoCodigo: "01", municipioCodigo: null, activa: true };
const enCapital = { departamentoCodigo: "01", municipioCodigo: "0101" };
const enMixco = { departamentoCodigo: "01", municipioCodigo: "0108" };

test("el municipio gana al departamento", () => {
  assert.deepEqual(resolverZona([capital, resto], enCapital), { tipo: "zona", zoneId: 1 });
});

test("sin cobertura municipal se cae al departamento", () => {
  assert.deepEqual(resolverZona([capital, resto], enMixco), { tipo: "zona", zoneId: 2 });
});

test("una cobertura municipal inactiva NO cae al departamento", () => {
  const apagada = { ...capital, activa: false };
  assert.deepEqual(resolverZona([apagada, resto], enCapital), { tipo: "cobertura_desactivada" });
});

test("una cobertura departamental inactiva tampoco resuelve", () => {
  const apagado = { ...resto, activa: false };
  assert.deepEqual(resolverZona([apagado], enMixco), { tipo: "cobertura_desactivada" });
});

test("sin ningún registro no hay cobertura", () => {
  assert.deepEqual(resolverZona([], enCapital), { tipo: "sin_cobertura" });
});

test("el orden de la lista no cambia el resultado", () => {
  assert.deepEqual(resolverZona([resto, capital], enCapital), { tipo: "zona", zoneId: 1 });
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

Esperado: FALLA, `resolverZona` no existe.

- [ ] **Paso 3: Implementar**

```ts
/**
 * Precedencia por especificidad, fija y no configurable: el municipio manda
 * sobre el departamento. Si existe una cobertura municipal, esa decide aunque
 * esté inactiva — «aquí no entregamos» no es lo mismo que «aquí aplica la regla
 * general», y por eso no se cae al nivel superior.
 */
export function resolverZona(cobertura, destino) {
  const porMunicipio = cobertura.find((c) => c.municipioCodigo === destino.municipioCodigo);
  if (porMunicipio) {
    return porMunicipio.activa
      ? { tipo: "zona", zoneId: porMunicipio.zoneId }
      : { tipo: "cobertura_desactivada" };
  }
  const porDepartamento = cobertura.find((c) => c.departamentoCodigo === destino.departamentoCodigo);
  if (porDepartamento) {
    return porDepartamento.activa
      ? { tipo: "zona", zoneId: porDepartamento.zoneId }
      : { tipo: "cobertura_desactivada" };
  }
  return { tipo: "sin_cobertura" };
}
```

- [ ] **Paso 4: Ejecutar y hacer commit**

```bash
git add app/envios/zonas.ts tests/envios-zonas.test.ts package.json
git commit -m "feat(envios): resolucion de zona por especificidad"
```

---

## Tarea 8: Cálculo de la tarifa

**Archivos:**
- Crear: `app/envios/tarifas.ts`
- Test: `tests/envios-tarifas.test.ts`

**Interfaces:**
- Produce:
  `calcularEnvio(tarifa: Tarifa, zona: Zona, pedido: { piezas: number; subtotalCents: number }, ahora: Date): ResultadoDeEnvio`
  y `estaVigente(tarifa: Tarifa, ahora: Date): boolean`.

- [ ] **Paso 1: Escribir la prueba**

```ts
// tests/envios-tarifas.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { calcularEnvio, estaVigente } from "../app/envios/tarifas";

// Cantidades ficticias de prueba: NO son las tarifas reales de ECONOLUZ.
const zona = { codigo: "z-prueba", nombre: "Zona de prueba", metodo: "paqueteria" } as const;
const tarifa = {
  importeCents: 5000, umbralGratisCents: 200_000, maxPiezas: 6,
  maxImporteCents: 500_000, plazoMinDias: 2, plazoMaxDias: 3,
  publicada: true, vigenteDesde: new Date("2026-01-01T00:00:00Z"), vigenteHasta: null,
};
const ahora = new Date("2026-06-01T00:00:00Z");

test("por debajo del umbral se cobra la tarifa", () => {
  const r = calcularEnvio(tarifa, zona, { piezas: 2, subtotalCents: 100_000 }, ahora);
  assert.equal(r.tipo, "con_tarifa");
  assert.equal(r.envioCents, 5000);
  assert.equal(r.gratuito, false);
  assert.equal(r.faltanParaGratisCents, 100_000);
});

test("el umbral es inclusive", () => {
  const justo = calcularEnvio(tarifa, zona, { piezas: 2, subtotalCents: 200_000 }, ahora);
  assert.equal(justo.envioCents, 0);
  assert.equal(justo.gratuito, true);
  const uncentavoMenos = calcularEnvio(tarifa, zona, { piezas: 2, subtotalCents: 199_999 }, ahora);
  assert.equal(uncentavoMenos.gratuito, false);
  assert.equal(uncentavoMenos.faltanParaGratisCents, 1);
});

test("faltanParaGratisCents es 0 al alcanzar el umbral y null si no hay umbral", () => {
  const alcanzado = calcularEnvio(tarifa, zona, { piezas: 1, subtotalCents: 250_000 }, ahora);
  assert.equal(alcanzado.faltanParaGratisCents, 0);
  const sinUmbral = calcularEnvio({ ...tarifa, umbralGratisCents: null }, zona,
    { piezas: 1, subtotalCents: 250_000 }, ahora);
  assert.equal(sinUmbral.faltanParaGratisCents, null);
  assert.equal(sinUmbral.gratuito, false);
});

test("los límites se evalúan ANTES que la gratuidad", () => {
  // Supera las piezas y también el umbral: manda el bulto, no el dinero.
  const r = calcularEnvio(tarifa, zona, { piezas: 7, subtotalCents: 900_000 }, ahora);
  assert.equal(r.tipo, "requiere_cotizacion");
  assert.equal(r.motivo, "pedido_grande");
});

test("exactamente el máximo todavía se admite", () => {
  const enElLimite = calcularEnvio(tarifa, zona, { piezas: 6, subtotalCents: 500_000 }, ahora);
  assert.equal(enElLimite.tipo, "con_tarifa");
  const unaMas = calcularEnvio(tarifa, zona, { piezas: 7, subtotalCents: 1000 }, ahora);
  assert.equal(unaMas.tipo, "requiere_cotizacion");
  const unCentavoMas = calcularEnvio(tarifa, zona, { piezas: 1, subtotalCents: 500_001 }, ahora);
  assert.equal(unCentavoMas.tipo, "requiere_cotizacion");
});

test("los límites nulos no limitan", () => {
  const sinLimites = { ...tarifa, maxPiezas: null, maxImporteCents: null };
  const r = calcularEnvio(sinLimites, zona, { piezas: 999, subtotalCents: 9_000_000 }, ahora);
  assert.equal(r.tipo, "con_tarifa");
});

test("la vigencia se mide en el instante inicial, antes del final y en el final", () => {
  const cerrada = { ...tarifa, vigenteHasta: new Date("2026-07-01T00:00:00Z") };
  assert.equal(estaVigente(cerrada, new Date("2026-01-01T00:00:00Z")), true);
  assert.equal(estaVigente(cerrada, new Date("2026-06-30T23:59:59Z")), true);
  assert.equal(estaVigente(cerrada, new Date("2026-07-01T00:00:00Z")), false);
  assert.equal(estaVigente(cerrada, new Date("2025-12-31T23:59:59Z")), false);
});

test("una tarifa sin publicar no está vigente", () => {
  assert.equal(estaVigente({ ...tarifa, publicada: false }, ahora), false);
});

test("todo el cálculo es en enteros", () => {
  const r = calcularEnvio(tarifa, zona, { piezas: 3, subtotalCents: 133_333 }, ahora);
  assert.equal(Number.isInteger(r.envioCents), true);
  assert.equal(Number.isInteger(r.faltanParaGratisCents), true);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

Esperado: FALLA, `calcularEnvio` no existe.

- [ ] **Paso 3: Implementar respetando el orden de la especificación §5.5**

Pasos 7, 8 y 9: **límites primero, gratuidad después**. El intervalo de vigencia es `[)`:
`vigenteDesde <= ahora` y (`vigenteHasta` nulo o `ahora < vigenteHasta`).

- [ ] **Paso 4: Ejecutar y hacer commit**

Esperado: PASA, nueve pruebas.

```bash
git add app/envios/tarifas.ts tests/envios-tarifas.test.ts package.json
git commit -m "feat(envios): calculo de tarifa con limites antes que gratuidad"
```

---

## Tarea 9: Orquestación en el servidor

**Archivos:**
- Crear: `app/envios/envios.server.ts`
- Test: `tests/envios-servicio.test.ts`

**Interfaces:**
- Consume: `resolverZona`, `calcularEnvio`, `aEnvioPublico`, `leerCarritoCon`,
  `resolverCarrito` de `app/tienda/lineas.ts`, `leer` de `app/lib/datos`.
- Produce: `cotizarEnvioDelCliente(destino)` y `estimarEnvio(destino, lineas)`, ambas
  devolviendo `Promise<ResultadoDeEnvio>`.

- [ ] **Paso 1: Escribir la prueba con dobles**

```ts
// tests/envios-servicio.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { orquestar } from "../app/envios/envios.server";
import { ErrorDeDatos } from "../app/lib/datos/errores";

// `orquestar` recibe sus dependencias como parámetro para poder probarse sin Neon.
const deps = (parches = {}) => ({
  leerConfiguracion: async () => ({ recogidaActiva: true, cobertura: [], zonas: [], tarifas: [] }),
  leerCarrito: async () => ({ lineas: [{ econoluzReference: "ECO-0001", cantidad: 2 }] }),
  resolverProductos: async () => ({ piezas: 2, subtotalCents: 100_000, descartadas: [] }),
  ahora: () => new Date("2026-06-01T00:00:00Z"),
  ...parches,
});

test("la recogida activa devuelve Q0 sin plazo y sin tocar geografía", async () => {
  let miroGeografia = false;
  const r = await orquestar({ tipo: "recogida_en_tienda" }, deps({
    leerConfiguracion: async () => { miroGeografia = true; return { recogidaActiva: true }; },
  }));
  assert.equal(r.tipo, "sin_coste");
  assert.equal(r.envioCents, 0);
  assert.equal("plazoMinDias" in r, false);
});

test("la recogida desactivada no cae al paso geográfico", async () => {
  const r = await orquestar({ tipo: "recogida_en_tienda" }, deps({
    leerConfiguracion: async () => ({ recogidaActiva: false }),
  }));
  assert.equal(r.tipo, "metodo_no_disponible");
});

test("un carrito con líneas no comprables detiene el cálculo", async () => {
  const r = await orquestar({ tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({ resolverProductos: async () => ({ piezas: 0, subtotalCents: 0, descartadas: ["ECO-0009"] }) }));
  assert.equal(r.tipo, "carrito_no_comprable");
  assert.deepEqual(r.referencias, ["ECO-0009"]);
});

test("el carrito se comprueba antes que la recogida", async () => {
  const r = await orquestar({ tipo: "recogida_en_tienda" },
    deps({ resolverProductos: async () => ({ piezas: 0, subtotalCents: 0, descartadas: ["ECO-0009"] }) }));
  assert.equal(r.tipo, "carrito_no_comprable");
});

test("un fallo de datos no es una cotización", async () => {
  const r = await orquestar({ tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({ leerConfiguracion: async () => { throw new ErrorDeDatos("consulta", "falló"); } }));
  assert.equal(r.tipo, "no_disponible");
  assert.equal(r.causa, "datos");
});

test("una dirección sin códigos pide cotización con su motivo", async () => {
  const r = await orquestar({ tipo: "direccion_guardada", direccionId: "7" }, deps({
    leerDireccion: async () => ({ departamentoCodigo: null, municipioCodigo: null }),
  }));
  assert.equal(r.tipo, "requiere_cotizacion");
  assert.equal(r.motivo, "direccion_sin_codigos");
});

test("un destino directo con códigos que no se corresponden se rechaza", async () => {
  const r = await orquestar({ tipo: "destino_directo", departamentoCodigo: "02", municipioCodigo: "0101" },
    deps());
  assert.equal(r.tipo, "requiere_cotizacion");
  assert.equal(r.motivo, "direccion_sin_codigos");
});

test("dos filas aplicables son un error interno, no un precio al azar", async () => {
  await assert.rejects(() => orquestar(
    { tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps({ leerConfiguracion: async () => ({
      recogidaActiva: true,
      cobertura: [{ zoneId: 1, municipioCodigo: "0101", departamentoCodigo: null, activa: true }],
      zonas: [{ id: 1, codigo: "a", nombre: "A", metodo: "paqueteria", activa: true }],
      tarifas: [{ zoneId: 1, publicada: true }, { zoneId: 1, publicada: true }],
    }) }),
  ));
});

test("la estimación anónima se marca como tal", async () => {
  const r = await orquestar({ tipo: "destino_directo", departamentoCodigo: "01", municipioCodigo: "0101" },
    deps(), { estimacion: true, lineas: [{ econoluzReference: "ECO-0001", cantidad: 1 }] });
  assert.equal(r.estimacion, true);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

Esperado: FALLA, `orquestar` no existe.

- [ ] **Paso 3: Implementar el algoritmo de §5.5**

`orquestar(destino, deps, opciones)` es la función probable; `cotizarEnvioDelCliente` y
`estimarEnvio` son envoltorios finos que inyectan las dependencias reales. El orden es el de
la especificación: **carrito, recogida, códigos, zona, zona activa, tarifa vigente, límites,
gratuidad**.

`ahora` se obtiene de `deps.ahora()`, nunca de un parámetro externo.

- [ ] **Paso 4: Ejecutar y hacer commit**

Esperado: PASA, nueve pruebas.

```bash
git add app/envios/envios.server.ts tests/envios-servicio.test.ts package.json
git commit -m "feat(envios): orquestacion con carrito del servidor"
```

---

## Tarea 10: Verificación contra base real

**Archivos:**
- Crear: `scripts/verificar-envios.mjs`
- Modificar: `package.json`, `scripts/verificar-permisos.mjs`

**Interfaces:**
- Consume: `scripts/guarda-neon.mjs`.
- Produce: `npm run envios:verificar`.

- [x] **Paso 1: Pedir autorización para crear la rama de Neon**

**Detente aquí.** Crear `envios-tarifas-dev` desde Producción es una acción operativa sobre
la infraestructura y **necesita el visto bueno expreso del dueño**. No la crees por tu
cuenta ni reutilices otra rama existente.

- [x] **Paso 2: Aplicar las migraciones en simulación**

```bash
npm run db:migrar -- --simular
```

Esperado: prueba las tres pendientes y termina en `ROLLBACK`, sin escribir.

- [x] **Paso 3: Aplicarlas de verdad y comprobar la idempotencia**

```bash
npm run db:migrar
npm run db:migrar
```

Esperado: la primera aplica `012`, `013` y `014`; la segunda informa de que **no queda nada
pendiente**.

- [x] **Paso 4: Escribir `scripts/verificar-envios.mjs`**

Se niega en Producción, igual que `carrito:verificar`, y ejecuta todo dentro de una
transacción que **siempre** revierte. Comprobaciones, cada una con su mensaje:

1. Un municipio en dos zonas → rechazado.
2. Un departamento en dos zonas → rechazado.
3. Dos tarifas publicadas solapadas en la misma zona → rechazado.
4. Periodos contiguos → aceptados.
5. `update` del importe de una tarifa publicada → rechazado.
6. Despublicar una tarifa publicada → rechazado.
7. Cerrar `vigente_hasta` una vez → aceptado; una segunda vez → rechazado.
8. Insertar publicada con `vigente_hasta` informado o `vigente_desde` futuro → rechazado.
9. Borrar una tarifa publicada → rechazado; una nunca publicada → aceptado.
10. Borrar una zona con coberturas o tarifas → rechazado; desactivarla → aceptado.
11. Borrar una zona sin nada colgando → aceptado.
12. Municipio de otro departamento en `user_addresses` → rechazado.
13. Municipio con departamento nulo → rechazado.
14. Dos sustituciones concurrentes con `for update` → queda **una sola** publicada vigente.
15. `audit_log` recibe `antes` y `despues` en la misma transacción.
16. Las cuentas existentes quedan como `administrador`.

- [x] **Paso 5: Ejecutar la verificación**

```bash
npm run envios:verificar
```

Esperado: las dieciséis en verde y la transacción revertida. Después, las tres tablas de
configuración siguen con **cero filas**:

```bash
npm run envios:verificar -- --contar
```

- [x] **Paso 6: Ampliar `test:permisos` y ejecutarlo**

Añade las cinco tablas nuevas a la lista de `scripts/verificar-permisos.mjs`.

```bash
npm run test:permisos
```

Esperado: las cinco denegadas al rol público, y sus secuencias también.

- [x] **Paso 7: Commit**

```bash
git add scripts/verificar-envios.mjs scripts/verificar-permisos.mjs package.json
git commit -m "feat(envios): verificacion de invariantes contra base real"
```

---

## Tarea 11: Panel — consultas y portada

**Archivos:**
- Crear: `app/admin/envios/cobertura.ts` (puro), `app/admin/envios/cobertura.server.ts`
  (lectura desde Neon), `app/admin/envios/zonas.server.ts`,
  `app/admin/(panel)/envios/page.tsx`
- Test: `tests/envios-cobertura.test.ts`

**Interfaces:**
- Produce:
  `resumirCobertura(municipios, cobertura, zonas, tarifas): { codigo: string; nombre: string; estado: "completa" | "parcial" | "sin_cobertura"; municipiosExcluidos: string[] }[]`.

- [x] **Paso 1: Escribir la prueba**

```ts
// tests/envios-cobertura.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { resumirCobertura } from "../app/admin/envios/cobertura";

const municipios = [
  { codigo: "0101", departamento: "01", nombre: "Guatemala" },
  { codigo: "0108", departamento: "01", nombre: "Mixco" },
];
const zonas = [{ id: 1, activa: true }, { id: 2, activa: true }];
const conTarifa = [{ zoneId: 1, publicada: true }, { zoneId: 2, publicada: true }];

test("un departamento con todos sus municipios resueltos es completa", () => {
  const cobertura = [{ zoneId: 1, departamentoCodigo: "01", municipioCodigo: null, activa: true }];
  const r = resumirCobertura(municipios, cobertura, zonas, conTarifa);
  assert.equal(r[0].estado, "completa");
  assert.deepEqual(r[0].municipiosExcluidos, []);
});

test("una excepción municipal inactiva lo deja parcial y nombra el municipio", () => {
  const cobertura = [
    { zoneId: 1, departamentoCodigo: "01", municipioCodigo: null, activa: true },
    { zoneId: 2, departamentoCodigo: null, municipioCodigo: "0101", activa: false },
  ];
  const r = resumirCobertura(municipios, cobertura, zonas, conTarifa);
  assert.equal(r[0].estado, "parcial");
  assert.deepEqual(r[0].municipiosExcluidos, ["Guatemala"]);
});

test("una zona sin tarifa publicada deja el departamento sin cobertura", () => {
  const cobertura = [{ zoneId: 1, departamentoCodigo: "01", municipioCodigo: null, activa: true }];
  const r = resumirCobertura(municipios, cobertura, zonas, []);
  assert.equal(r[0].estado, "sin_cobertura");
});

test("sin ningún registro el departamento no tiene cobertura", () => {
  const r = resumirCobertura(municipios, [], zonas, conTarifa);
  assert.equal(r[0].estado, "sin_cobertura");
});
```

- [x] **Paso 2: Ejecutar y verla fallar**

- [x] **Paso 3: Implementar `resumirCobertura` municipio a municipio**

Reutiliza `resolverZona` de la tarea 7: cada municipio se resuelve igual que en el checkout,
y el estado del departamento se agrega después. Así el panel y el cliente **no pueden
discrepar**.

- [x] **Paso 4: Escribir la portada**

Componente de servidor. Abre con el recuento y la frase honesta:

```tsx
<p className="text-lg">
  <strong>{sinCobertura.length} departamentos no calculan envío</strong>: sus clientes
  no podrán pagar en línea cuando exista el checkout.
</p>
```

Y una tabla con los tres estados, nombrando los municipios excluidos de los parciales.

- [x] **Paso 5: Ejecutar, comprobar en el navegador y hacer commit**

```bash
npm run typecheck
npm run lint
```

---

## Tarea 12: Panel — Server Actions

**Archivos:**
- Crear: `app/admin/envios/actions.ts`, `app/admin/envios/tarifas.server.ts`,
  `app/admin/(panel)/envios/[zona]/page.tsx`
- Test: `tests/envios-admin.test.ts`

**Interfaces:**
- Consume: `verificarPermisoParaAccion`, `escribir` de `app/lib/datos`, `validarZona`,
  `validarTarifa`.
- Produce: `crearZona`, `editarZona`, `activarZona`, `asignarCobertura`,
  `activarCobertura`, `publicarTarifa`, `borrarBorradorDeTarifa`.

- [ ] **Paso 1: Escribir la prueba de la secuencia de sustitución**

```ts
// tests/envios-admin.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { pasosDeSustitucion } from "../app/admin/envios/tarifas";

test("la sustitución bloquea, cierra, inserta y audita, en ese orden", () => {
  const pasos = pasosDeSustitucion();
  assert.deepEqual(pasos.map((p) => p.tipo), ["bloquear", "cerrar", "insertar", "auditar"]);
  assert.match(pasos[0].sql, /for update/i);
});

test("la invalidación de caché NO forma parte de la transacción", () => {
  const pasos = pasosDeSustitucion();
  assert.equal(pasos.some((p) => p.tipo === "invalidar-cache"), false);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

- [ ] **Paso 3: Implementar la sustitución**

```ts
export async function publicarTarifa(zoneId: number, datos: DatosDeTarifa) {
  const { id: actorId } = await verificarPermisoParaAccion("envios:escribir");
  const validacion = validarTarifa(datos);
  if (!validacion.ok) return { ok: false, mensaje: validacion.mensaje };

  await escribir(async (ejecutar) => {
    // 1. Bloquear: dos administradores simultáneos se serializan aquí.
    const vigentes = await ejecutar(SQL_BLOQUEAR_TARIFA_VIGENTE, [zoneId]);
    // 2. Cerrar la anterior, si la hay.
    if (vigentes[0]) await ejecutar(SQL_CERRAR_TARIFA, [vigentes[0].id]);
    // 3. Insertar la nueva, abierta y publicada.
    const nueva = await ejecutar(SQL_INSERTAR_TARIFA, [zoneId, /* … */]);
    // 4. Auditar dentro de la MISMA transacción.
    await ejecutar(SQL_AUDITAR, ["admin", actorId, "publicar", "shipping_rate",
                                 String(nueva[0].id), vigentes[0] ?? null, nueva[0]]);
  }, { suceso: "publicar-tarifa" });

  // Fuera de la transacción: PostgreSQL no puede deshacer esto, y su fallo
  // no debe revertir un cambio ya confirmado.
  try {
    updateTag("envios-tarifas");
  } catch (error) {
    registrar({
      suceso: "cache-envios-no-invalidada",
      clase: error instanceof Error ? error.constructor.name : "desconocida",
    });
  }
}
```

`registrar` es el de `app/lib/datos`, que **solo admite escalares**. No le pases el error
entero, ni el `zoneId` del cliente, ni nada de la configuración: la clase basta para saber
qué pasó, y la caducidad corta de la caché repara el resto sola.

- [ ] **Paso 4: Comprobar el rechazo por permiso**

Con un usuario de rol `empleado` escrito directamente en la base reversible, invocar la
acción debe redirigir sin escribir nada.

- [ ] **Paso 5: Ejecutar y hacer commit**

---

## Tarea 13: Direcciones con códigos

**Archivos:**
- Crear: `app/envios/geografia.ts`
- Modificar: `app/identidad/direcciones.ts`, `app/identidad/direcciones.server.ts`,
  `app/cuenta/direcciones/FormularioDireccion.tsx`
- Test: `tests/envios-geografia-emparejado.test.ts`

**Interfaces:**
- Produce: `emparejarMunicipio(catalogo, departamentoTexto, municipioTexto): { codigo: string; departamento: string } | null`.

- [ ] **Paso 1: Escribir la prueba**

```ts
// tests/envios-geografia-emparejado.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { emparejarMunicipio, normalizar } from "../app/envios/geografia";

const catalogo = [
  { codigo: "0101", departamento: "01", nombre: "Guatemala" },
  { codigo: "0108", departamento: "01", nombre: "Mixco" },
];

test("normaliza tildes, mayúsculas y espacios de más", () => {
  assert.equal(normalizar("  SAN JOSÉ   PINULA "), "san jose pinula");
});

test("empareja lo inequívoco", () => {
  assert.deepEqual(emparejarMunicipio(catalogo, "Guatemala", "MIXCO"),
    { codigo: "0108", departamento: "01" });
});

test("no empareja lo que no está", () => {
  assert.equal(emparejarMunicipio(catalogo, "Guatemala", "Guate"), null);
  assert.equal(emparejarMunicipio(catalogo, "Izabal", "Mixco"), null);
});

test("no inventa cuando el texto es ambiguo", () => {
  assert.equal(emparejarMunicipio(catalogo, "", "Mixco"), null);
});
```

- [ ] **Paso 2: Ejecutar, implementar y volver a ejecutar**

- [ ] **Paso 3: Migrar las direcciones existentes sin tocar su texto**

Un paso de `013` recorre `user_addresses` y rellena los códigos **solo** cuando
`emparejarMunicipio` devuelve algo. `departamento` y `municipio` **no se modifican nunca**.

- [ ] **Paso 4: Cambiar el formulario a dos `<select>` encadenados**

`departamento` primero; `municipio` se filtra por él. Los dos campos de texto libre
desaparecen del formulario, pero **las columnas de texto siguen existiendo** y se rellenan
con el nombre oficial elegido.

- [ ] **Paso 5: Ejecutar todo y hacer commit**

```bash
npm run test:datos
npm run typecheck
```

---

## Tarea 14: La recogida en tienda como ajuste

No es una zona geográfica: es un método de entrega a Q0 que vive en `app_settings`, la tabla
que ya existe para esto. Sin esta tarea, `leerConfiguracion` de la tarea 9 no tiene de dónde
sacar `recogidaActiva`.

**Archivos:**
- Modificar: `app/lib/ajustes.ts`, `app/lib/ajustes.server.ts`,
  `app/admin/envios/actions.ts`, `app/admin/(panel)/envios/page.tsx`
- Test: `tests/envios-recogida.test.ts`

**Interfaces:**
- Produce: `leerRecogidaEnTienda(valor: unknown): RecogidaEnTienda` con
  `type RecogidaEnTienda = { activa: boolean; texto: string }`, y la acción
  `configurarRecogida(activa: boolean, texto: string)`.

- [ ] **Paso 1: Escribir la prueba**

```ts
// tests/envios-recogida.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { leerRecogidaEnTienda } from "../app/lib/ajustes";

test("sin ajuste guardado la recogida está apagada", () => {
  assert.deepEqual(leerRecogidaEnTienda(undefined), { activa: false, texto: "" });
  assert.deepEqual(leerRecogidaEnTienda(null), { activa: false, texto: "" });
});

test("un valor corrupto no enciende la recogida", () => {
  assert.equal(leerRecogidaEnTienda("sí").activa, false);
  assert.equal(leerRecogidaEnTienda({ activa: "true" }).activa, false);
  assert.equal(leerRecogidaEnTienda(42).activa, false);
});

test("solo el booleano verdadero la enciende", () => {
  assert.deepEqual(
    leerRecogidaEnTienda({ activa: true, texto: "21 Avenida 0-18, zona 15" }),
    { activa: true, texto: "21 Avenida 0-18, zona 15" },
  );
});

test("el texto se recorta y se acota", () => {
  assert.equal(leerRecogidaEnTienda({ activa: true, texto: "  x  " }).texto, "x");
  assert.equal(leerRecogidaEnTienda({ activa: true, texto: "x".repeat(300) }).texto.length, 200);
});
```

- [ ] **Paso 2: Ejecutar y verla fallar**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --import ./scripts/register-ts.mjs tests/envios-recogida.test.ts
```

Esperado: FALLA, `leerRecogidaEnTienda` no existe.

- [ ] **Paso 3: Implementar la lectura conservadora**

Sigue el patrón que `app/lib/ajustes.ts` ya usa: ante cualquier duda, **el valor más
conservador**. Aquí eso significa `activa: false` — ofrecer una recogida que no existe
mandaría a un cliente a la tienda a por un paquete que nadie ha preparado.

**No hay importe configurable**: la recogida cuesta 0 por definición, y esa constante vive en
el servicio, no en la base.

- [ ] **Paso 4: Añadir el control al panel**

Un interruptor y un campo de texto en la portada de envíos, con su Server Action protegida
por `verificarPermisoParaAccion("envios:escribir")` y su entrada en `audit_log`.

- [ ] **Paso 5: Ejecutar, dar de alta la prueba y hacer commit**

```bash
git add app/lib/ajustes.ts app/lib/ajustes.server.ts app/admin/envios tests/envios-recogida.test.ts package.json
git commit -m "feat(envios): recogida en tienda como ajuste, apagada por defecto"
```

---

## Tarea 15: Playwright, documentación y cierre

**Archivos:**
- Crear: `tests/admin-envios.spec.ts`
- Modificar: `playwright.config.ts`, `package.json`, `CLAUDE.md`,
  `docs/CONTINUAR-PANEL.md`

- [ ] **Paso 1: Pedir autorización para la segunda rama de Neon**

**Detente.** `envios-tarifas-e2e` necesita autorización expresa, igual que la primera.
Playwright escribe de verdad: **no puede correr contra `envios-tarifas-dev`**, que debe
quedar con las tablas de configuración vacías.

- [ ] **Paso 2: Preparar la sesión administrativa de prueba**

El Playwright actual solo comprueba el acceso **sin** sesión. Hace falta un helper que cree
el administrador de prueba en la rama e2e y guarde su cookie de sesión. Los fixtures son
**idempotentes**: reejecutarlos no acumula zonas.

- [ ] **Paso 3: Escribir el spec del panel**

Crear zona, asignarle un municipio, publicar una tarifa con cantidades ficticias, ver el
estado deducido pasar a «calcula envío» y el resumen mostrar el departamento como parcial.

- [ ] **Paso 4: Dar de alta el spec**

Añade `"admin-envios.spec.ts"` al `testMatch` de `playwright.config.ts`. **Sin esto la
prueba no se ejecuta y nadie se entera.**

- [ ] **Paso 5: Comprobar que todo está dado de alta**

```bash
node -e "const p=require('./package.json');const fs=require('fs');const listados=[...p.scripts['test:datos'].matchAll(/tests\/[\w.-]+/g),...p.scripts['test:admin'].matchAll(/tests\/[\w.-]+/g)].map(m=>m[0]);const pw=fs.readFileSync('playwright.config.ts','utf8');const todos=fs.readdirSync('tests').filter(f=>f.endsWith('.test.ts')||f.endsWith('.spec.ts'));const huerfanos=todos.filter(f=>!listados.includes('tests/'+f)&&!pw.includes(f));console.log(huerfanos.length?'SIN DAR DE ALTA: '+huerfanos.join(', '):'todos dados de alta');"
```

Esperado: `todos dados de alta`.

- [ ] **Paso 6: Batería completa**

```bash
npm run test:datos
npm run test:admin
npm run test:proveedores
npm run test:permisos
npm run envios:verificar
npm run typecheck
npm run lint
npm run build
npx playwright test
```

- [ ] **Paso 7: Actualizar la documentación**

En `CLAUDE.md`: recuento de tablas **25 → 30** (corrigiendo de paso las 23 desfasadas de §4),
la división del subproyecto 9 en **9A y 9B**, la fuente geográfica con su huella, el estado
del rol `empleado` y los comandos nuevos. En `docs/CONTINUAR-PANEL.md`: qué queda hecho, qué
tiene que cargar el dueño y las dos ramas de Neon creadas.

- [ ] **Paso 8: Commit final**

```bash
git add -A
git commit -m "feat(envios): cerrar el subproyecto 9A con panel y pruebas"
```

**No hagas `push`, `merge` ni despliegue.** El dueño lo autoriza por separado.

---

## Criterios de aceptación

Los dieciséis de la especificación §9, comprobados uno a uno con su evidencia. Los que más
se olvidan:

- Las tres tablas de configuración con **cero filas** tras migrar.
- **Ningún importe comercial** en migraciones, valores predeterminados ni código.
- Los archivos de prueba nuevos **dados de alta** en `package.json` y `playwright.config.ts`.
- **Producción sin ninguna escritura**, comprobable en su historial de migraciones.
- §4.2.1 con **las dos huellas** y §4.2.3 sin municipios sin nombre.
