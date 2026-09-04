# Envíos: zonas, tarifas y cálculo — diseño del subproyecto 9A

Fecha: 03/09/2026. Aprobado por secciones por el dueño el mismo día.

Este documento diseña **la primera fase del subproyecto 9**. No autoriza a implementar
nada: el plan de implementación se escribe aparte, en
`docs/superpowers/plans/2026-09-03-envios-tarifas.md`.

---

## 1. La contradicción del diseño global, y cómo se resuelve

`docs/superpowers/specs/2026-08-30-backend-relacional-v2-design.md` §10 declara que el
subproyecto 6, checkout y pedidos, **depende del 9, envíos**, y §5.6 mete en el 9 cuatro
tablas: `shipping_zones`, `shipping_rates`, `shipments` y `shipment_events`. Pero el
diagrama de relaciones de §5.8 dice `orders ||--o{ shipments`, y `orders` no existe hasta
el subproyecto 6.

**El 9 completo no puede ir antes del 6, porque la mitad de sus tablas cuelga de una tabla
que todavía no existe.**

La contradicción no está en el orden, sino en la granularidad: el subproyecto 9 mezcla dos
piezas con dependencias opuestas.

| Pieza | Depende de | Desbloquea |
|---|---|---|
| Zonas, tarifas y cálculo | Subproyectos 2 y 3, ambos terminados | El importe de envío del checkout |
| Envíos y seguimiento | `orders`, del subproyecto 6 | Nada del checkout: es posterior a la venta |

### 1.1 Dependencia aprobada: 9A → 6 → 9B

- **9A** — `shipping_zones`, `shipping_rates` y su cobertura, el servicio de dominio de
  cálculo y la administración en `/admin`. **Es este documento.**
- **6** — checkout y pedidos. Consume el servicio de 9A para fijar el importe de envío del
  pedido y guarda la instantánea de la dirección. Aquí se persisten también las
  cotizaciones individuales de envío (§5.6).
- **9B** — `shipments`, `shipment_events` y seguimiento. Después del 6.

Los números globales **9 y 6 se conservan**. Las fases 9A y 9B se documentan como tales,
igual que se hizo con las fases A–D del subproyecto 3. **No se renumera ningún subproyecto
ni ninguna migración anterior.**

### 1.2 Punto de partida comprobado el 03/09/2026

- `main` local en `d643269c4c52cfcf84c993e39f9303dfd0ef3ca3`, un commit por delante de
  `origin/main` (`14f6e0174c022834e5400729f077746f5b94334d`). Ese commit contiene
  únicamente el cierre documental del subproyecto 5. **El trabajo de 9A parte de ese
  `main` local.**
- Producción: **once migraciones y veinticinco tablas**. `CLAUDE.md` §4 documenta
  veintitrés tablas y diez migraciones, cifra **desfasada**: no recoge `carts` ni
  `cart_items`. Se corrige como parte de este subproyecto. No se consultó Producción para
  comprobarlo, porque este diseño no la toca; el dato lo aportó el dueño y concuerda con
  que el código del carrito persistente esté en el árbol.
- Firebase de Producción sigue sin configurar; pasarela de pago y certificador FEL, sin
  contratar. Nada de 9A depende de los tres.

---

## 2. Decisiones de negocio del dueño (03/09/2026)

Se recogen aquí para que quien retome el trabajo no vuelva a preguntarlas.

| # | Decisión |
|---|---|
| 1 | **Cobertura nacional**: los 22 departamentos. Nadie queda excluido del sitio |
| 2 | **Ciudad de Guatemala y el resto de su departamento son dos zonas distintas.** Obliga a granularidad de municipio |
| 3 | **Recogida en tienda a Q0**, sin dirección. Es un método de entrega, no una zona geográfica |
| 4 | Guatex cobra por peso, pero **al cliente se le cobra tarifa fija por zona**; el pedido grande se cotiza aparte |
| 5 | «Grande» = supera **N piezas o Q X**, lo que se alcance primero. Dos límites por zona |
| 6 | **Ninguna zona ni tarifa ficticia.** Los 21 departamentos del interior arrancan sin tarifa activa |
| 7 | Sin tarifa aplicable **no se puede pagar**. Se conservan carrito y dirección y se deriva a la asesoría. Nunca se cobra el producto dejando el envío pendiente fuera del sistema |
| 8 | La cotización manual vale **para ese pedido concreto**, no se generaliza a la zona |
| 9 | Ningún importe se siembra: los carga el dueño desde `/admin` |
| 10 | **Zona Capital**: Q35.00 (`3500`) y envío gratis desde Q2,500.00 (`250000`) inclusive. Configuración del panel, **no se siembra ni se codifica**. No se extiende a otras zonas sin su indicación |
| 11 | Plazo estimado **2 a 3 días hábiles** (48–72 horas hábiles), igual en todas las zonas por ahora |

### 2.1 Restricciones heredadas que este diseño respeta

ECONOLUZ **no maneja stock, inventario, bodegas ni reservas**. Los envíos se calculan por
**zonas geográficas, no por peso**. **Todo importe se guarda en centavos enteros.** **Nada
que llegue del navegador se acepta como precio o tarifa**: el servidor recalcula productos,
subtotal, tarifa, descuento e IVA. El precio mostrado **ya incluye el IVA del 12 %**. El
rol `econoluz_publico` **no accede a ninguna tabla de envíos**. **No se contrata ni se
integra ninguna transportista.** No se implementan pagos, FEL, pedidos ni checkout.

---

## 3. Enfoque elegido

Se evaluaron tres opciones. El dueño aprobó **A con C integrado**.

- **A. Zonas y tarifas configurables desde el panel.** Es el único que soporta capital
  distinta del resto, métodos distintos, tarifas que nacen vacías y un umbral que solo
  aplica a una zona. Permite completar el país sin programador, que es como quiere
  trabajar el dueño. Riesgo: la configuración puede quedar ambigua, y por eso los
  invariantes se imponen en el esquema (§4). Es el de mayor coste.
- **B. Una tarifa nacional única.** Descartado por **incompatible**, no por caro: no puede
  representar ninguna de las decisiones 2, 3, 6 ni 10.
- **C. Cotización manual sin cobertura.** Imprescindible como complemento —hoy es el
  camino de 21 de los 22 departamentos— e insuficiente como motor. Se construye **dentro
  de A**, como un resultado tipado más del servicio.

---

## 4. Modelo de datos

### 4.1 El problema previo: la geografía es texto libre

`user_addresses.departamento` y `municipio` son hoy `text not null` escritos a mano en un
`<input type="text">` (`app/cuenta/direcciones/FormularioDireccion.tsx`). Comparar ese
texto fallaría con «Guatemala», «guatemala», «Guate» y «Ciudad de Guatemala». Y la
decisión 2 exige resolver por **municipio**.

### 4.2 Geografía oficial

```sql
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
  -- Necesaria para la clave foránea compuesta de user_addresses (§4.3).
  constraint geo_municipios_codigo_y_departamento unique (codigo, departamento_codigo)
);
```

#### 4.2.1 Fuente primaria — cerrada y verificada el 03/09/2026

| Campo | Valor |
|---|---|
| **Emisor** | Instituto Nacional de Estadística de Guatemala (**INE**) |
| **Publicación** | Encuesta Nacional de Empleo e Ingresos Continua, **ENEIC 2024–2025 — Boleta larga** |
| **Contenido usado** | Tabla «Lista de códigos de los municipios de la República de Guatemala», **página 7** |
| **URL de descarga** | `https://www.ine.gob.gt/wp-content/uploads/2025/06/BOLETA-ENEIC_LARGA.pdf` |
| **Tamaño** | 436 417 bytes |
| **SHA-256 del PDF** | `1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e` |
| **SHA-256 de la instantánea normalizada** | `33297eebe05a155b3e63f0fac15d21a1306a0257b8b7b3f2149f08ce926a7e66` |

**Validación del universo y del formato:** *Metodología de actualización del Directorio
Nacional Estadístico de Empresas (DINESE)*, INE, diciembre de 2023
(`https://www.ine.gob.gt/wp-content/uploads/2023/12/METODOLOGIA-DE-ACTUALIZACION-DINESE.pdf`,
SHA-256 `09821d80a446ed0387d15654d4915e6fb7d44a80f33a9ba657a972b1a724dcf2`), §2.4, página 7 —
**22 departamentos, 340 municipios**, códigos departamentales **01–22**. Este documento
confirma el **conteo**; no enumera los 22 pares nombre↔código de departamento — ver la
limitación declarada en §4.2.3.

**Fuentes de contraste, que no gobiernan la migración:** el Instituto Geográfico Nacional
(IGN) y GeoQuetzal pueden consultarse para cotejar, pero **la fuente primaria es el INE** y
es la única que decide qué entra en `012_geografia_gt.sql`.

La instantánea validada queda **versionada en el repositorio**, y la migración **nunca
consulta Internet**. Esta siembra es dato oficial verificable, no una tarifa comercial
inventada, así que no contradice la decisión 6.

#### 4.2.2 Transformación aplicada

Los códigos municipales de los departamentos **01 a 09 aparecen en el PDF con tres cifras**
(`101`, `923`) y los de **10 a 22 con cuatro** (`1215`, `2217`). Se **completan con un cero
inicial** para almacenarlos siempre como `char(4)`, y **el departamento son sus dos primeros
dígitos**: `101` → `0101`, cuyo departamento es `01`.

Esa regla es la que hace cierta la restricción `left(codigo, 2) = departamento_codigo` de
§4.2.

#### 4.2.3 Estado real de la extracción, cerrada en la tarea 1

El PDF se descargó y se procesó el 03/09/2026 con `scripts/preparar-geografia.mjs`.
Resultados **verificados sobre el archivo cuya huella figura arriba**, y contrastados
además contra una extracción independiente (`pdftotext -raw`, ajena a este script) que
coincidió en los 340 códigos:

- **340 códigos municipales únicos**, que coinciden exactamente con el universo declarado
  por el DINESE. Descartados los códigos de país que la misma boleta incluye (`3030` Cuba,
  `4007` Bélgica, `5008` China…), todos ≥ 3000.
- **Los 340 nombres quedaron emparejados automáticamente**, sin ningún hueco. El emparejado
  se hace por coordenadas con una asignación global (todas las parejas candidatas dentro de
  tolerancia, confirmadas de mejor a peor puntaje, sin repetir código ni nombre) y descarta
  de antemano los rótulos en mayúsculas (países y encabezados de continente), que de otro
  modo podían ganarle el emparejado a un nombre real de municipio.
- **El municipio `0923` es La Esperanza, Quetzaltenango**, y está **confirmado por el dueño
  contra la página 7**, entre `0922 Flores Costa Cuca` y `0924 Palestina de los Altos`. La
  extracción automática ya lo resuelve sola: la corrección de la tabla de abajo queda
  declarada de todas formas por si un cambio futuro en el extractor volviera a romperlo, tal
  como exige el criterio de aceptación 14, y el script solo avisa si de verdad tiene efecto.

**Limitación declarada: los 22 nombres de departamento no tienen huella verificable en
este repositorio.** El PDF de la boleta solo lista municipios; el DINESE citado en §4.2.1
solo confirma el conteo. `Baja Verapaz`, `Alta Verapaz`, `Petén` e `Izabal` no aparecen ni
una sola vez en el PDF, y los otros 18 solo aparecen ahí como nombre de un *municipio* que
coincide con el de su departamento (`0101 Guatemala`), no como rótulo de departamento. Los
22 nombres de `NOMBRES_DEPARTAMENTOS` en `scripts/preparar-geografia.mjs` son la división
administrativa oficial de Guatemala, pública y verificable por cualquiera que conozca la
geografía del país, pero es el **único dato del catálogo cuya procedencia no se puede
auditar** solo con lo que hay en este repositorio. Prefiero declarar esto con todas las
letras a inventar una cita que encaje. El detalle está en `db/datos/geografia-gt.FUENTE.md`.

**Corrección de un error de informe, para que no se repita.** Una versión anterior de esta
sección afirmaba que la celda de `0923` **estaba vacía en el PDF**. Es falso: el nombre está
en el documento y **lo que falló fue la extracción por coordenadas**. Son dos cosas
distintas —que la fuente no traiga un dato, y que la herramienta no lo saque— y confundirlas
lleva a conclusiones equivocadas sobre la calidad de la fuente.

**Erratas y correcciones puntuales, que no se aplican en silencio:**

| Código | Como aparece en el PDF | Como se almacena | Motivo |
|---|---|---|---|
| `1330` | `Santiago Chimaltenanango` | `Santiago Chimaltenango` | Errata tipográfica del documento |
| `0923` | `La Esperanza` (legible en la página 7) | `La Esperanza` | El texto es correcto; falló la extracción automática, no la fuente |

Cada corrección adicional que aparezca al completar la extracción **se añade a esta tabla**,
con su código, el texto original, el almacenado y el motivo. Ninguna se aplica sin quedar
escrita aquí y sin respaldo en la página 7. Esta tabla, la de
`db/datos/geografia-gt.FUENTE.md` y el mapa `CORRECCIONES` de
`scripts/preparar-geografia.mjs` dicen exactamente lo mismo.

**La segunda huella ya está registrada** (§4.2.1): la instantánea se generó al ejecutar la
tarea 1 del plan, `db/datos/geografia-gt.json` existe con 22 departamentos y 340
municipios, y su SHA-256 quedó escrito **antes de que `012_geografia_gt.sql` exista**; el
criterio de aceptación 14 lo exigía y ninguna migración se ha escrito todavía.

**La completitud se verifica contra este conjunto exacto versionado** —22 departamentos y
340 municipios—, nunca comprobando que los códigos formen una secuencia numérica continua:
un código oficial no tiene ninguna obligación de ser correlativo, así que esa prueba
fallaría por motivos legítimos o daría falsa confianza.

### 4.3 Las direcciones ganan códigos sin perder su texto

```sql
alter table user_addresses
  add column if not exists departamento_codigo char(2) references geo_departamentos(codigo),
  add column if not exists municipio_codigo     char(4) references geo_municipios(codigo);

alter table user_addresses
  add constraint user_addresses_municipio_del_departamento
    foreign key (municipio_codigo, departamento_codigo)
    references geo_municipios (codigo, departamento_codigo),
  add constraint user_addresses_municipio_exige_departamento
    check (municipio_codigo is null or departamento_codigo is not null);
```

Dos claves foráneas sueltas solo prueban que cada código existe, **no que el municipio sea
de ese departamento**; la compuesta sí. Es `match simple`, de modo que una dirección a
medio resolver sigue siendo legal, y el `check` cierra el hueco de un municipio sin su
departamento.

**Los textos históricos se conservan intactos.** Los códigos se rellenan **solo cuando el
emparejamiento normalizado —sin tildes, mayúsculas ni espacios de más— sea inequívoco**.
Ambiguo o sin coincidencia: código nulo, texto original sin tocar, y la próxima vez que el
cliente use esa dirección se le pide elegir su municipio de una lista.

El formulario pasa a dos `<select>` encadenados. **Esto modifica una tabla y una pantalla
del subproyecto 2, ya desplegado**, y consta como ampliación de alcance.

### 4.4 `shipping_zones` — solo zonas geográficas

```sql
create table if not exists shipping_zones (
  id             bigserial   primary key,
  codigo         text        not null unique,
  nombre         text        not null,
  metodo         text        not null,
  activa         boolean     not null default false,
  notas          text        not null default '',
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint shipping_zones_metodo_valido
    check (metodo in ('mensajero_propio', 'paqueteria'))
);
```

`activa` nace en `false`: una zona sin tarifa cargada no debe resolver nada.

### 4.5 Cobertura, con claves foráneas reales

```sql
create table if not exists shipping_zone_areas (
  id                  bigserial   primary key,
  zone_id             bigint      not null references shipping_zones(id) on delete restrict,
  departamento_codigo char(2)     references geo_departamentos(codigo),
  municipio_codigo    char(4)     references geo_municipios(codigo),
  activa              boolean     not null default true,
  creado_en           timestamptz not null default now(),

  constraint shipping_zone_areas_un_solo_ambito
    check (num_nonnulls(departamento_codigo, municipio_codigo) = 1)
);

create unique index if not exists shipping_zone_areas_departamento_unico
  on shipping_zone_areas (departamento_codigo) where departamento_codigo is not null;

create unique index if not exists shipping_zone_areas_municipio_unico
  on shipping_zone_areas (municipio_codigo) where municipio_codigo is not null;
```

Un `check` con expresión regular validaría la forma del código pero **no que el destino
exista**: un código bien formado e inexistente entraría sin protesta. Por eso dos columnas
nullable con clave foránea real, exactamente una informada, y unicidad parcial por nivel.

**No hay columna de prioridad, y es deliberado.** Una prioridad editable es donde se cuelan
las configuraciones ambiguas: dos zonas con la misma prioridad reclamando el mismo sitio, y
un empate que resuelve el `order by` como le apetezca. La precedencia es **la
especificidad, fija y no configurable**.

### 4.6 Precedencia — norma, no comentario

> Una dirección resuelve su zona buscando **primero por `municipio_codigo`**. **Si existe
> una cobertura municipal, esa manda, esté activa o no**: inactiva significa «aquí no
> entregamos», que no es lo mismo que «aquí aplica la regla general del departamento», y
> por eso **no se cae al nivel superior**. Solo cuando **ningún** registro reclama ese
> municipio se busca por `departamento_codigo`. Dentro de cada nivel la unicidad parcial
> garantiza como máximo una asignación, así que el resultado es **cero o una zona**, nunca
> dos.
>
> Una cobertura **departamental inactiva** tampoco resuelve: significa «este departamento
> está suspendido», y no hay nivel superior al que recurrir.

Capital es el municipio `0101`; otra zona cubre el departamento `01` completo, y los demás
municipios caen en ella sin listarlos uno a uno.

### 4.7 `shipping_rates`

```sql
create table if not exists shipping_rates (
  id                  bigserial   primary key,
  zone_id             bigint      not null references shipping_zones(id) on delete restrict,
  importe_cents       integer     not null,
  umbral_gratis_cents integer,
  max_piezas          integer,
  max_importe_cents   integer,
  plazo_min_dias      smallint    not null default 2,
  plazo_max_dias      smallint    not null default 3,
  publicada           boolean     not null default false,
  vigente_desde       timestamptz not null default now(),
  vigente_hasta       timestamptz,
  periodo tstzrange generated always as
    (tstzrange(vigente_desde, vigente_hasta, '[)')) stored,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint shipping_rates_importe_valido      check (importe_cents >= 0),
  constraint shipping_rates_umbral_valido       check (umbral_gratis_cents is null or umbral_gratis_cents > 0),
  constraint shipping_rates_max_piezas_valido   check (max_piezas is null or max_piezas > 0),
  constraint shipping_rates_max_importe_valido  check (max_importe_cents is null or max_importe_cents > 0),
  constraint shipping_rates_plazo_valido        check (plazo_min_dias >= 0 and plazo_max_dias >= plazo_min_dias),
  constraint shipping_rates_vigencia_valida     check (vigente_hasta is null or vigente_hasta > vigente_desde),

  constraint shipping_rates_sin_solape_vigencia
    exclude using gist (zone_id with =, periodo with &&) where (publicada)
);
```

`btree_gist` ya está instalada desde la migración `010`, así que el `exclude` no añade
ninguna extensión nueva. Es **parcial**: solo alcanza a las publicadas, de modo que caben
borradores sin publicar sin que se estorben. **No sirve para programar tarifas futuras**;
ver §4.8.1.

**`umbral_gratis_cents` no se valida contra `importe_cents`.** Son magnitudes distintas
—un subtotal de pedido frente a un coste de envío— y compararlas no significa nada. Cobrar
Q35 y regalar el envío desde Q20 puede ser una promoción deliberada. El panel advierte,
no bloquea (§6.5).

### 4.8 Lo publicado no se reescribe ni se borra

Un disparador rechaza cualquier `update` de los campos económicos —importe, umbral,
límites, plazos— sobre una fila con `publicada = true`. La **única** modificación permitida
sobre una tarifa publicada es **cerrar `vigente_hasta` una vez** —de `null` a una fecha,
nunca de una fecha a otra—, durante la sustitución controlada de §6.4, junto con el
`actualizado_en` que la acompaña. No se puede borrar ni despublicar.

**Nota sobre los valores predeterminados de plazo.** `plazo_min_dias = 2` y
`plazo_max_dias = 3` son el dato que dio el dueño en la decisión 11, y no son un importe:
el criterio de aceptación 4 prohíbe importes comerciales predeterminados, no plazos. Son
editables por zona desde el panel.

Las dos reglas de borrado, definidas por separado porque no son la misma:

| Entidad | Se puede borrar | En cualquier otro caso |
|---|---|---|
| **Tarifa** | Solo si **nunca fue publicada** | Se cierra su vigencia; no se borra ni se despublica |
| **Zona** | Solo si **no tiene ninguna cobertura ni ninguna tarifa**, publicada o no | **Se desactiva** |

Ambas claves foráneas hacia `shipping_zones` son `on delete restrict` —tanto la de
`shipping_zone_areas` como la de `shipping_rates`—, así que la base impide el borrado
aunque el código se equivoque. **No hay borrado en cascada de coberturas**: eliminar una
zona nunca puede llevarse por delante en silencio el reparto del país. Todo borrado
permitido deja igualmente su entrada en `audit_log`.

Es el mismo patrón que `product_prices`, que cierra el precio anterior antes de insertar el
nuevo, y responde a una necesidad concreta: un pedido antiguo tiene que poder explicar con
qué configuración se calculó.

### 4.8.1 Sin programación futura

**Las tarifas se publican inmediatamente.** Al publicar, `vigente_desde` es el instante
del servidor y `vigente_hasta` es `null`: la tarifa nace **abierta** y se cierra **una sola
vez**, al sustituirla.

El disparador rechaza, además de lo anterior, insertar una fila `publicada` con
`vigente_desde` en el futuro o con `vigente_hasta` ya informado.

El motivo es que la programación, tal como estaba escrita, se contradecía con la
inmutabilidad: una tarifa publicada con `vigente_hasta` fijado no podría adelantarse ni
cancelarse, y una sustitución urgente se quedaría sin salida. **El dueño no pidió
programación**, así que sale de 9A. Si algún día se quiere, habrá que diseñar a la vez su
cancelación y su sustitución anticipada.

### 4.9 La recogida en tienda no es una zona

Vive en `app_settings`, con su forma tipada: si está activa y el texto del punto de
recogida. **Su importe es 0 por definición**, no una tarifa configurable —cero no es un
dato comercial que pueda estar mal cargado— y no consume dirección ni geografía. Si algún
día la recogida costara dinero dejaría de ser un ajuste y pasaría a ser una tarifa; hoy esa
opción está descartada, así que no se construye por si acaso.

### 4.10 Lo que no se crea

Ni `shipments`, ni `shipment_events`, ni la tabla de cotizaciones individuales. Las tres
esperan a tener `orders` delante.

### 4.11 Recuento de tablas

9A añade **cinco**: `geo_departamentos`, `geo_municipios`, `shipping_zones`,
`shipping_zone_areas` y `shipping_rates`. Las de geografía y cobertura no estaban previstas
en el diseño global, que solo contemplaba `shipping_zones` y `shipping_rates`.

| | Antes | Después |
|---|---|---|
| Tablas en Producción | 25 | 30 |
| Total previsto del diseño global | 32 | 35 |

---

## 5. Servicio de dominio

### 5.1 Estructura

```text
app/envios/
  contratos.ts        tipos internos, DTO público y motivos
  geografia.ts        normalización de nombres y emparejamiento inequívoco
  zonas.ts            resolución pura: cobertura + destino -> zona
  tarifas.ts          cálculo puro: límites, gratuidad, plazo
  envios.server.ts    lectura desde app/lib/datos, caché y orquestación
```

Los módulos puros no importan `server-only` ni el controlador de Neon; `envios.server.ts`
es el único que lee la base de datos, siempre a través de `app/lib/datos`.

El cálculo es puro **porque va a tener tres consumidores**: el checkout del subproyecto 6,
`/api/v1` del 10, y las apps de iOS y Android a través de ese endpoint. Dos
implementaciones del precio del envío acabarían discrepando.

### 5.2 Entrada

```ts
export type DestinoDeEnvio =
  | { tipo: "recogida_en_tienda" }
  | { tipo: "direccion_guardada"; direccionId: string }
  | { tipo: "destino_directo"; departamentoCodigo: string; municipioCodigo: string };
```

**Hay dos contratos distintos, no uno con un campo opcional.** Sin sesión no existe carrito
persistente que leer, así que un único contrato «sin líneas» haría imposible el cálculo
anónimo.

```ts
/** Cálculo autenticado. Recibe SOLO el destino. */
export function cotizarEnvioDelCliente(destino: DestinoDeEnvio): Promise<ResultadoDeEnvio>;

/** Estimación anónima. Recibe referencias públicas y cantidades. NUNCA precios. */
export function estimarEnvio(
  destino: DestinoDeEnvio,
  lineas: readonly { econoluzReference: string; cantidad: number }[],
): Promise<ResultadoDeEnvio>;
```

| | Autenticado | Estimación anónima |
|---|---|---|
| Origen del carrito | **Neon**, con `leerCarritoCon` de `app/tienda/carritoRepositorio.ts`, por la cookie de sesión | Referencias y cantidades del navegador |
| Precios | Del servidor | Del servidor: las referencias **se vuelven a resolver** contra el catálogo |
| Marca del resultado | `estimacion: false` | **`estimacion: true`**, siempre |
| Puede convertirse en pedido | Sí, en el subproyecto 6 | **Nunca directamente** |

En los dos casos **ningún importe llega del navegador**. Lo que la estimación anónima
acepta son referencias públicas y cantidades —lo mismo que ya guarda el carrito local— y el
servidor resuelve los productos por su cuenta. Si alguien altera su `localStorage`, lo
único que consigue es estimar otro pedido, no cambiar lo que valen las cosas.

- La función **pura** `calcularEnvio` recibe líneas ya resueltas y confiables: es su
  contrato interno, no una entrada externa.
- **`ahora` no es un campo de ninguno de los dos contratos externos.** El servidor fija el instante
  efectivo; la inyección existe solo en la firma de las funciones puras, para las pruebas.
  Ni el navegador ni la API pueden proponer una fecha y hacer revivir una tarifa caducada.
- `direccionId` se resuelve **filtrando por el cliente de la sesión**. Una dirección ajena
  no aparece: no es un error de permisos que devuelva datos, es un destino que no existe.
- `destino_directo` **no es un atajo**: sus dos códigos se validan contra las tablas de
  geografía **y contra su correspondencia**, igual que los de una dirección guardada. Para
  tarifa automática hacen falta **los dos**.

### 5.3 Salida interna

```ts
export type MotivoDeCotizacion =
  | "sin_cobertura"
  | "zona_inactiva"
  | "cobertura_desactivada"
  | "sin_tarifa_vigente"
  | "direccion_sin_codigos"
  | "pedido_grande";

export type ResultadoDeEnvio = { estimacion: boolean } & (
  | { tipo: "sin_coste"; metodo: "recogida_en_tienda"; envioCents: 0 }
  | { tipo: "con_tarifa"; zonaCodigo: string; zonaNombre: string;
      metodo: "mensajero_propio" | "paqueteria";
      envioCents: number; gratuito: boolean;
      faltanParaGratisCents: number | null;
      plazoMinDias: number; plazoMaxDias: number }
  | { tipo: "requiere_cotizacion"; motivo: MotivoDeCotizacion }
  | { tipo: "metodo_no_disponible"; metodo: "recogida_en_tienda" }
  | { tipo: "carrito_no_comprable"; referencias: readonly string[] }
  | { tipo: "no_disponible"; causa: "datos" | "configuracion" }
);
```

Formas distintas, no una con campos opcionales: quien consuma esto tiene que decidir
explícitamente qué hace con cada caso, y no puede tratar «sin tarifa» como «envío gratis»
por olvidarse de mirar una bandera.

**`sin_coste` no lleva plazo.** El dueño decidió únicamente que la recogida en tienda
cuesta Q0; los plazos de 2 a 3 días hábiles son de mensajería y paquetería, y atribuirle
uno a la recogida sería inventarle una promesa que nadie tomó.

**`metodo_no_disponible` es su propio caso.** Si llega un destino `recogida_en_tienda` con
el ajuste desactivado, no es una cotización —no hay nada que cotizar— ni una avería —nada
ha fallado—: es un método de entrega que ahora mismo no se ofrece. Sin este tipo, la
petición caía al paso geográfico con un destino que no tiene códigos.

### 5.4 DTO público

```ts
export type EnvioPublico = { estimacion: boolean } & (
  | { estado: "calculado"; envioCents: number; gratuito: boolean;
      faltanParaGratisCents: number | null; plazoMinDias: number; plazoMaxDias: number }
  | { estado: "recogida_en_tienda"; envioCents: 0 }
  | { estado: "cotizacion_requerida" }
  | { estado: "recogida_no_disponible" }
  | { estado: "carrito_no_comprable"; referencias: readonly string[] }
  | { estado: "servicio_no_disponible" }
);
```

**Ningún motivo interno viaja, sin excepciones.** Los seis —`sin_cobertura`,
`zona_inactiva`, `cobertura_desactivada`, `sin_tarifa_vigente`, `direccion_sin_codigos` y
`pedido_grande`— producen todos el mismo `cotizacion_requerida`. Tampoco viajan
`max_piezas`, `max_importe_cents` ni las notas de la zona.

**Qué identificadores están prohibidos y cuáles no.** Lo prohibido son los identificadores
**internos**: claves de base de datos, `zonaCodigo`, `zonaNombre` y cualquier referencia a
la tarifa. **Las referencias públicas de producto sí pueden viajar** —son las que el
navegador ya conoce y usa—, y por eso `carrito_no_comprable` puede nombrar las suyas: el
cliente necesita saber qué línea de su carrito es el problema.

La traducción de interno a público ocurre **en un único punto**, como hace
`publicProduct.ts` con el catálogo, para que no haya dos sitios donde olvidarse de filtrar.

`faltanParaGratisCents` **sí es público**: es una promoción, sirve para vender y el cliente
tiene derecho a saber cuánto le falta. Vale **`0` cuando el umbral ya se alcanzó** y `null`
**únicamente cuando la tarifa no tiene umbral**: son dos situaciones distintas y no pueden
compartir valor.

### 5.5 Algoritmo

1. **Reconstruir el carrito desde el servidor.** Si aparece **cualquier** descarte
   —`inexistente`, `despublicado` o `sin-precio`, el vocabulario que ya define
   `app/tienda/carritoServidor.ts`—, **el cálculo se detiene** y devuelve
   `carrito_no_comprable`. Nunca se suman piezas sobre un carrito mutilado.
   **Esta comprobación va la primera, incluida la recogida en tienda:** decirle «Q0» a
   quien lleva un producto que ya no se puede comprar sería confirmarle un pedido
   imposible.
2. **Recogida en tienda.** Si el destino es recogida y el ajuste está **activo**, devuelve
   `sin_coste` **sin consultar geografía y sin plazo**. Si el ajuste está **inactivo**,
   devuelve `metodo_no_disponible` y **tampoco** continúa: ese destino no tiene códigos
   geográficos que resolver.
3. **Resolver el destino a códigos.** Dirección sin códigos → `direccion_sin_codigos`.
4. **Resolver la zona** por la precedencia de §4.6. Sin resultado → `sin_cobertura`.
   Cobertura **inactiva** —municipal o departamental— → `cobertura_desactivada`. En el caso
   municipal, **sin** caer al departamento.
5. **Zona activa.** Si no → `zona_inactiva`.
6. **Tarifa publicada y vigente en el instante del servidor.** Si no →
   `sin_tarifa_vigente`. Las tres condiciones —zona activa, tarifa publicada y periodo
   abierto— se exigen a la vez; si falta cualquiera, el resultado nunca es un importe.
7. **Límites, antes que nada económico.** `max_piezas` informado y `piezas > max_piezas`
   → `pedido_grande`. `max_importe_cents` informado y `subtotalCents > max_importe_cents`
   → `pedido_grande`. **Exactamente el máximo todavía se admite.** Se evalúan aquí a
   propósito: un pedido grande va a cotización **aunque supere el umbral de envío gratis**,
   porque el problema es el bulto, no el dinero.
8. **Gratuidad.** `umbral_gratis_cents` informado y `subtotalCents >= umbral` →
   `envioCents = 0`, `gratuito = true`. El `>=` es la regla del dueño: gratis desde
   Q2,500 **inclusive**. El umbral se evalúa sobre el subtotal de productos con precios
   vigentes del servidor, **después de descuentos y antes de sumar el envío**; hoy no
   existen descuentos, y el orden queda fijado para cuando existan.
9. **Si no**, `envioCents = importe_cents` y `faltanParaGratisCents = umbral - subtotal`
   cuando haya umbral. Cuando el umbral ya se alcanzó vale **`0`**; `null` queda reservado
   a las tarifas **sin umbral**.

Todo el cálculo en **centavos enteros**.

### 5.6 La cotización individual pertenece al subproyecto 6

En 9A **solo se modela el resultado `requiere_cotizacion`**. La cotización individual —su
importe, su vigencia, su caducidad y su relación con el pedido— se persiste en el
subproyecto 6, porque ocurre antes de poder pagar y va atada a un pedido que aún no existe.

Cuando falta tarifa, el cliente **no puede finalizar el pago**. Se conservan su carrito y
su dirección y se le lleva a la asesoría con productos, cantidades, dirección y
departamento ya cargados, para que pueda retomar la compra sin volver a introducir nada.
**Nunca se cobra el producto dejando el envío pendiente fuera del sistema.**

### 5.6 bis Límites de entrada

«Validar completamente» no es verificable mientras las fronteras no estén escritas. Estas
son, y las impone tanto la validación pura como el esquema.

| Campo | Límite |
|---|---|
| `shipping_zones.codigo` | **Slug inmutable**: `^[a-z0-9]+(-[a-z0-9]+)*$`, de 2 a 40 caracteres. **No se puede cambiar una vez creado**, porque es la clave de la ruta `/admin/envios/[zona]` y de la auditoría |
| `shipping_zones.nombre` | 2 a 80 caracteres, sin control ni saltos de línea |
| `shipping_zones.notas` | 0 a 500 caracteres |
| `importe_cents` | Entero, `0 ≤ x ≤ 100000` (Q0 a Q1,000) |
| `umbral_gratis_cents` | Entero, `1 ≤ x ≤ 10000000` (hasta Q100,000), o nulo |
| `max_piezas` | Entero, `1 ≤ x ≤ 999`, o nulo. El tope coincide con el del carrito |
| `max_importe_cents` | Entero, `1 ≤ x ≤ 10000000`, o nulo |
| `plazo_min_dias`, `plazo_max_dias` | Entero, `0 ≤ x ≤ 60`, y `max ≥ min` |
| `econoluzReference` (estimación anónima) | Formato de referencia pública ya vigente; **máximo 100 líneas** por petición y `1 ≤ cantidad ≤ 999` |
| `direccionId` | Entero positivo en forma de cadena; se filtra además por el cliente de la sesión |
| `departamentoCodigo`, `municipioCodigo` | Exactamente 2 y 4 dígitos, y **existentes y correspondientes** en las tablas de geografía |

Los topes de importe no son reglas de negocio: son frenos para que un formulario manipulado
o un dedo torpe no metan una tarifa de siete cifras. Los rangos se comprueban además con
`check` en el esquema, para que valgan también fuera del panel.

**El slug inmutable es la alternativa elegida** a usar el `id` en la ruta: un slug legible
hace que la URL y la auditoría se entiendan, y la inmutabilidad evita que renombrarlo rompa
enlaces o historial.

### 5.7 Determinismo

El modelo garantiza cero o una zona y cero o una tarifa publicada vigente. El servicio
**no se apoya en eso para elegir**: si la consulta devuelve más de una fila, lanza un error
interno en lugar de quedarse con la primera. Una configuración imposible tiene que doler al
administrarla, no producir un precio distinto según el plan de ejecución de Postgres.

### 5.8 Averías y caché

Un `ErrorDeDatos` **no es una cotización**. Produce `no_disponible`, que el DTO público
traduce a `servicio_no_disponible` y una futura API a **503**. El carrito se conserva y la
interfaz ofrece reintentar. `requiere_cotizacion` queda reservado a causas de negocio.

Las tarifas se cachean con etiqueta propia `envios-tarifas` y caducidad corta, y el panel
la invalida al guardar, igual que `CATALOG_CACHE_TAG` con el catálogo. **La caché guarda
configuración, nunca resultados calculados ni direcciones.**

---

## 6. Administración

### 6.1 Estructura

```text
app/admin/(panel)/envios/
  page.tsx                 cobertura del país y estado real del subsistema
  [zona]/page.tsx          ficha de zona: datos, cobertura y tarifas
app/admin/envios/
  actions.ts               Server Actions
  zonas.ts / zonas.server.ts
  tarifas.ts / tarifas.server.ts
```

Toda escritura va dentro de `escribir()` de `app/lib/datos`. No se repite la deuda de las
cuatro operaciones que hoy leen antes de escribir sin transacción.

### 6.2 La portada dice la verdad incómoda

Al arrancar, veintiún departamentos no tendrán tarifa. La portada abre con el recuento real
y una frase sin adornos del tipo «17 departamentos no calculan envío: sus clientes no
pueden pagar en línea». Es la misma idea que la portada del panel, que enseña 313 productos
y 25 con precio para que se vea de un vistazo lo que falta.

**El resumen distingue tres estados, no dos:**

| Estado | Cuándo |
|---|---|
| **Completa** | Todos sus municipios resuelven tarifa, por cobertura departamental o municipal |
| **Parcial** | Unos sí y otros no: excepciones municipales inactivas, o asignadas a zona sin tarifa vigente |
| **Sin cobertura** | Ningún municipio resuelve tarifa |

Se calcula **municipio a municipio** contra `geo_municipios` y se agrega después, que es la
única forma de que «parcial» sea un dato real y no una impresión. La portada **nombra** los
municipios excluidos de un departamento parcial, porque son justo los que se olvidan.

**Este resumen se calcula desde la configuración**, no de registros de ejecución.

### 6.3 Deducir en vez de pedir casillas

El estado de una zona —«calcula envío» o «va a cotización»— se **deduce** de sus datos:
activa, con cobertura asignada y con tarifa publicada vigente. Se muestra calculado, con el
motivo concreto de por qué no calcula. Lo que sigue siendo decisión explícita del dueño es
**activar o desactivar** una zona o una localidad, y **publicar** una tarifa, que es una
acción con su botón y no una casilla que se pueda dejar a medias.

### 6.4 Sustituir una tarifa

Cambiar el importe **no reescribe la fila**. Dentro de **una sola transacción**:

1. `select … for update` sobre la tarifa publicada vigente de esa zona —o sobre la zona, si
   no hay ninguna—, para que dos acciones administrativas simultáneas se **serialicen** en
   vez de competir. El `exclude` queda como última defensa, no como mecanismo de
   coordinación.
2. Cerrar la vigente poniéndole `vigente_hasta` en el instante del cambio.
3. Insertar la nueva con `vigente_desde` en ese mismo instante y `publicada = true`.
4. Escribir la entrada de `audit_log`.

Los periodos son contiguos y no se solapan: `[)` deja el instante exacto para la nueva. Si
algo falla, no se cierra la vieja. Nunca hay un hueco en el que el país se quede sin
tarifa, y el historial permite responder «qué envío se le cobró a este pedido de octubre».

**La invalidación de la caché queda fuera de la transacción.** `updateTag("envios-tarifas")`
se ejecuta **después de confirmar el `COMMIT`**, nunca tras un `ROLLBACK`. Si esa
invalidación falla, se registra el fallo y **no se revierte el cambio ya confirmado**; la
caducidad corta permite recuperarse. Meter un efecto que PostgreSQL no puede deshacer
dentro de una transacción es fingir una atomicidad que no existe.

### 6.5 Impedir lo inválido, y decirlo en castellano

Las restricciones de la base son la garantía, pero un administrador no debería toparse con
un error de Postgres. La validación pura comprueba antes de escribir y devuelve un mensaje
legible.

| Intento | Lo que ve el administrador |
|---|---|
| Asignar Mixco a una segunda zona | «Mixco ya pertenece a la zona “Guatemala — resto del departamento”. Quítalo de ahí primero.» |
| Publicar una tarifa habiendo ya una vigente | «Esta zona ya tiene una tarifa publicada. Publicar la nueva cerrará la anterior ahora mismo.» — confirmación, no bloqueo |
| Activar una zona sin tarifa publicada | «La zona quedará activa pero seguirá enviando a cotización hasta que publiques una tarifa.» — advertencia, no bloqueo |
| Umbral que hace gratis casi todo | «Con este umbral, casi cualquier pedido llevará envío gratis.» — **advertencia llamativa, no bloqueo** |
| Plazo máximo menor que el mínimo | «El plazo máximo no puede ser menor que el mínimo.» |
| Borrar una tarifa publicada | «Una tarifa publicada no se borra. Publica una nueva para sustituirla.» |

Si pese a todo salta una restricción, se traduce a un mensaje de esta lista. **Nunca se
muestra SQL, ni el nombre de la restricción, ni el texto de Postgres, ni un identificador
interno.**

### 6.6 Auditoría

Cada alta, edición, activación, desactivación y publicación escribe en `audit_log` con
`actor_tipo = 'admin'`, el `actor_id` de la sesión, la entidad (`shipping_zone`,
`shipping_zone_area`, `shipping_rate`), su identificador y el `antes`/`despues` en `jsonb`.
La escritura va **dentro de la misma transacción** que el cambio: una auditoría escrita
aparte es una auditoría que un día falta justo en el cambio que interesa. Es el patrón que
ya usa `app/data/catalogo/escritura.ts`. Los importes se auditan en centavos.

### 6.7 Lo que el panel no tiene

Ninguna pantalla de seguimiento de paquetes, ninguna guía de envío, ningún estado de
entrega y ninguna integración con Guatex: eso es 9B, después del subproyecto 6. La sección
de envíos administra **configuración**, no operaciones. Tampoco hay siembra ni botón de
«crear zonas de ejemplo».

---

## 7. Seguridad y privacidad

### 7.1 Autorización: 9A la introduce porque no existe

Hoy `verificarSesionParaAccion()` solo comprueba que haya sesión. Ni `db/003_admin.sql`, ni
`app/admin/auth/types.ts`, ni `session.ts` contienen nada parecido a un rol: **todo
administrador autenticado puede todo**.

```sql
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

**Sin `default`, y en tres pasos a propósito.** Un valor predeterminado de administrador
convertiría cualquier inserción que olvide la columna en una **elevación de privilegios
silenciosa**. `UpsertAdminUserInput` gana `rol` como campo **obligatorio** y
`npm run admin:crear` lo exige y lo valida; un rol inválido se rechaza.

**El rol se relee de `admin_users` en cada validación de Server Action.** Nunca se acepta
desde cookies legibles, formularios ni parámetros del cliente, y tampoco se confía en una
copia guardada en la sesión. Un cambio de rol tiene efecto **inmediato**, incluso sobre
sesiones ya abiertas.

En 9A: `administrador` escribe zonas, coberturas y tarifas; `empleado` solo consulta. La
comprobación va en el Server Action, no en el componente: ocultar un botón no es autorizar,
y una acción es invocable directamente.

**No se puede crear ninguna cuenta de empleado en 9A, y el comando lo impide.** Proteger
solo las acciones nuevas deja abiertas las de productos y proyectos, que siguen comprobando
únicamente que exista sesión y que un empleado podría invocar directamente: una cuenta
aparentemente limitada con las acciones antiguas abiertas es peor que no tener roles,
porque aparenta una restricción que no existe.

Por eso, aunque el repositorio **exige siempre un rol explícito**, `npm run admin:crear`
**solo acepta `administrador` durante 9A** y rechaza `empleado` con un mensaje que explica
por qué. La restricción de la base admite los dos valores; el que se cierra es el camino de
alta. Las pruebas que necesiten un empleado lo consiguen con **dobles** o escribiéndolo
directamente en la **base reversible**, no por el comando.

Habilitar el rol exige antes **definir y aplicar una matriz de permisos a todas las
acciones existentes**, y eso no cabe aquí. El usuario actual queda como `administrador`.
Los permisos operativos de envíos se definen en 9B.

Esto modifica el subproyecto de autenticación del panel, ya desplegado, y consta como
ampliación de alcance.

### 7.2 Superficie de red

**9A no crea una API pública ni una ruta HTTP estable propia.** Pero **las Server Actions
sí son superficie de red**: son peticiones invocables desde el navegador. Por eso **cada
acción exportada** comprueba por sí misma sesión, permiso, origen cuando corresponda, y
valida su entrada por completo. La protección de origen de Next.js y `esMismoOrigen` de
`app/identidad/origen.ts` son defensa adicional, **no autorización**.

### 7.3 El rol público no ve nada de esto

Las cinco tablas nuevas **y sus secuencias** reciben `revoke all` explícito para
`econoluz_publico`, como hizo `011_carrito.sql`, y se añaden a
`scripts/verificar-permisos.mjs` para que `npm run test:permisos` **falle** si alguna queda
accesible. Incluidas las dos de geografía: el catálogo público no las necesita, y una tabla
que no hace falta conceder es una que se deniega. La geografía se sirve desde el servidor
con la conexión de aplicación.

Nada de esto altera de dónde sale el catálogo público, que sigue leyendo la proyección con
el rol público sin cambio alguno.

### 7.4 Qué se registra

**Los registros de ejecución se reservan a fallos técnicos**, con identificador opaco de
petición y clase de error. **No se registran** departamento, municipio, dirección,
referencias de ubicación, teléfono, destinatario, cliente ni contenido del carrito.

La cobertura completa, parcial o inexistente **se calcula desde la configuración**, que ya
la contiene: registrarla no aportaría información nueva y sí acumularía rastro del
comportamiento de personas reales. Si más adelante se quieren estadísticas de demanda por
departamento, se diseñarán como **datos agregados con retención definida**, no se inferirán
de los logs.

**9A no guarda ningún dato logístico**, así que la anonimización a los doce meses de
`2026-09-01-identidad-clientes-design.md` §6.3 todavía no tiene nada que barrer aquí. Las
**instantáneas de dirección aparecen por primera vez en el subproyecto 6**, con
`order_addresses`, y es ahí donde ese barrido empieza a tener trabajo; 9B añade después lo
suyo.

### 7.5 Errores hacia fuera

Ningún mensaje al navegador contiene SQL, nombre de restricción, texto de Postgres ni
identificador interno. La traducción ocurre en un punto único. Una avería produce
`servicio_no_disponible` y **503** en una futura API, nunca un importe y nunca una
cotización.

---

## 8. Transición y pruebas

### 8.1 Tres migraciones, no una

| Migración | Contenido |
|---|---|
| `012_geografia_gt.sql` | `geo_departamentos`, `geo_municipios` y su siembra oficial versionada |
| `013_envios_tarifas.sql` | `shipping_zones`, `shipping_zone_areas`, `shipping_rates`, disparador de no-reescritura, columnas y restricciones de `user_addresses`, revocaciones |
| `014_roles_admin.sql` | La columna `rol` en tres pasos y su restricción |

Se separan porque mezclar tres dominios en una sola migración hace que revertir uno arrastre
los otros. La geografía es vocabulario de referencia que sobrevive a cualquier rediseño de
envíos; los roles son del panel, no de los envíos.

### 8.2 Qué significa «repetible»

Los archivos SQL **no necesitan poder ejecutarse directamente dos veces**: la repetición
segura la garantiza `schema_migrations`. El procedimiento en una rama recién nacida de
Producción es:

```bash
npm run db:migrar -- --simular
```

que prueba las tres migraciones pendientes dentro de una transacción y termina en
`ROLLBACK`. Después se aplican una vez con `npm run db:migrar`, y **una segunda ejecución
del migrador debe informar de que no queda nada pendiente**.

### 8.3 Estado tras migrar

- `geo_departamentos` y `geo_municipios`: **sembradas** con la instantánea oficial.
- `shipping_zones`, `shipping_zone_areas` y `shipping_rates`: **cero filas, las tres.**
- `admin_users`: las cuentas existentes con `rol = 'administrador'`.

### 8.4 Entornos

Rama de Neon **`envios-tarifas-dev`, nacida de Producción**, como se hizo con
`catalogo-relacional-fase-b`. Una rama de Neon solo copia los datos del instante en que se
creó: toda corrección posterior hay que aplicarla por separado en cada rama.

**Producción no recibe ninguna escritura en 9A.** El guardián `scripts/guarda-neon.mjs` ya
exige tres llaves para escribir contra Producción, y ninguna aparece en este trabajo.

Rama de git `feat/envios-tarifas` en su propio worktree. **Sin `push`, sin `merge` y sin
despliegue.**

**Playwright va contra la rama de Neon `envios-tarifas-e2e`**, con **conexión y usuario
administrador exclusivos** para las pruebas de navegador. Sus fixtures son **idempotentes**
—se pueden reejecutar sin acumular basura— y **no se comparten** con `envios-tarifas-dev`,
con Producción ni con usuarios reales.

Una prueba de navegador que crea zonas y publica tarifas mediante peticiones reales **no
cabe dentro de la transacción reversible de `envios:verificar`**: cada petición abre y
cierra la suya, así que lo que escribe se queda. Por eso hacen falta **dos entornos y no
uno**: `envios-tarifas-dev` conserva las tres tablas de configuración **vacías** hasta que
el dueño cargue datos desde el panel, y `envios-tarifas-e2e` puede ensuciarse.

**Crear `envios-tarifas-e2e` es una acción operativa sobre la infraestructura y necesitará
autorización expresa del dueño en el momento de ejecutar el plan**, no la da este
documento. **Ninguna prueba usa Producción ni clientes reales.**

El Playwright actual solo comprueba el acceso **sin** sesión (`admin-auth.spec.ts`), así
que probar operaciones autenticadas exige **preparar explícitamente la sesión
administrativa de prueba y la conexión aislada**, que hoy no existen.

### 8.5 Pruebas, escritas antes que el código

**Unidad, sin base de datos** (`test:datos`):

- Municipio gana a departamento cuando ambos están cubiertos.
- **Cobertura municipal inactiva no cae al departamento.**
- Sin cobertura de ningún nivel → `sin_cobertura`.
- **`recogida_en_tienda` con el ajuste activo devuelve Q0 sin consultar geografía, y sin
  `plazoMinDias` ni `plazoMaxDias`.**
- **`recogida_en_tienda` con el ajuste inactivo devuelve `metodo_no_disponible`**, no una
  cotización ni una avería, y no cae al paso geográfico.
- **La estimación anónima marca `estimacion: true`** y resuelve los precios en el servidor;
  el cálculo autenticado marca `estimacion: false`. Enviar precios en la estimación no
  cambia el resultado, porque el campo no existe en el contrato.
- **Límites de entrada** (§5.6 bis): slug fuera de formato o de longitud, nombre y notas
  demasiado largos, importes, piezas y plazos fuera de rango, más de 100 líneas en la
  estimación, cantidad fuera de `1..999` — todos rechazados con su mensaje.
- **El slug de una zona no se puede cambiar** una vez creada.
- Gratuidad **inclusive**: subtotal igual al umbral es gratis; un centavo menos, no.
- **Límites antes que gratuidad**: supera `max_piezas` **y** el umbral → `pedido_grande`.
- **Exactamente el máximo se admite**; un valor superior exige cotización. Vale para
  `max_piezas` y para `max_importe_cents`.
- **`faltanParaGratisCents` vale `0` al alcanzar el umbral y `null` solo cuando la tarifa
  no tiene umbral.** Los dos casos se prueban por separado.
- **Vigencia con `ahora` inyectado**: en el instante inicial, justo antes del final y
  exactamente en el final.
- Todo en centavos enteros; ninguna operación en coma flotante.

**Integración contra `envios-tarifas-dev`**, en transacción reversible, por
`npm run envios:verificar` —script nuevo, que hay que **dar de alta en `package.json`** y
apoyar en `scripts/guarda-neon.mjs`— y que **se niega a ejecutarse contra Producción** como
hace `carrito:verificar`:

- Un municipio en dos zonas → rechazado. Un departamento en dos zonas → rechazado.
- Dos tarifas publicadas con periodos solapados en la misma zona → rechazado.
- Periodos contiguos → aceptados, sin hueco sin tarifa.
- **Una tarifa publicada no puede borrarse, despublicarse ni cambiar sus campos
  económicos**; solo cerrar `vigente_hasta` una vez durante la sustitución controlada, y
  nunca de una fecha a otra.
- **Una tarifa nunca publicada sí se puede borrar**, con su entrada de auditoría.
- **Insertar una tarifa publicada con `vigente_desde` futuro o con `vigente_hasta` ya
  informado → rechazado** (§4.8.1: no hay programación).
- **Borrar una zona con coberturas o con tarifas → rechazado**, publicadas o no, y **las
  coberturas no desaparecen en cascada**. Una zona sin coberturas ni tarifas sí se borra.
- **Departamento y municipio inexistentes, o que no se corresponden entre sí, son
  rechazados.**
- Municipio con departamento nulo → rechazado.
- Desactivar una zona referenciada → aceptado.
- **La migración convierte las cuentas existentes en `administrador`**, y
  **`npm run admin:crear` rechaza `empleado`** durante 9A con su mensaje explicativo.
- **Concurrencia:** dos sustituciones simultáneas de la tarifa de una zona; con
  `for update` se serializan y queda **una sola** publicada vigente.
- `audit_log` recibe antes y después **dentro de la misma transacción** que el cambio.
- El emparejamiento de direcciones antiguas rellena código solo cuando es inequívoco y
  **deja el texto original intacto** en todos los casos.
- **La migración convierte las cuentas existentes en `administrador`**; crear o actualizar
  una cuenta exige rol explícito, y un rol inválido se rechaza.

**Comportamiento del servicio**, con dobles:

- Carrito con línea despublicada, inexistente o sin precio → **el cálculo se detiene** y
  devuelve `carrito_no_comprable`; no se suman piezas.
- Fallo de Neon → `servicio_no_disponible`, nunca `requiere_cotizacion` ni un importe.
- **Los seis motivos internos —incluidos `sin_cobertura` y `pedido_grande`— conservan
  valores distintos en el servidor y producen todos el mismo DTO público**
  `cotizacion_requerida`.
- El DTO público no contiene motivos internos, límites, notas ni identificadores internos
  de base, zona o tarifa — prueba antifuga, del estilo de las que ya vigilan los datos del
  proveedor. **Sí puede contener referencias públicas de producto**, que es lo que permite
  a `carrito_no_comprable` decir qué línea falla.
- **La caché se invalida después del `COMMIT` y nunca tras un `ROLLBACK`**; un fallo de
  invalidación no revierte el cambio confirmado.
- `empleado` no puede escribir; `administrador` sí; sin sesión, ninguno. El rol se relee:
  cambiarlo en la base afecta a la sesión ya abierta.

**Semilla geográfica:** **22 departamentos y 340 municipios exactos**, unicidad de códigos,
relación `left(codigo, 2) = departamento_codigo` en las 340 filas, ningún nombre vacío, y
**el conjunto coincide fila a fila con la instantánea versionada** cuya huella figura en
§4.2.1. No se comprueba que los códigos formen una secuencia continua.

**Permisos:** `npm run test:permisos` falla si `econoluz_publico` alcanza cualquiera de las
cinco tablas o sus secuencias.

**Panel** (Playwright, canal `msedge`, base aislada): crear zona, asignar cobertura,
publicar tarifa, ver el estado deducido y el resumen en tres estados.

### 8.6 Importes en pruebas

Se prohíben importes comerciales en **migraciones, valores predeterminados y código de
producción**. Las **pruebas sí pueden usar cantidades ficticias**, claramente identificadas
como tales. **Q35 y Q2,500 no se siembran ni se configuran automáticamente**: los carga el
dueño desde el panel.

---

## 9. Criterios de aceptación

1. `npm run db:migrar -- --simular` prueba las tres migraciones pendientes y termina en
   `ROLLBACK`.
2. Aplicadas una vez en `envios-tarifas-dev`, una segunda ejecución del migrador informa de
   que no queda nada pendiente.
3. `shipping_zones`, `shipping_zone_areas` y `shipping_rates` tienen **cero filas** tras
   migrar. Las únicas filas sembradas son las de geografía oficial.
4. Ningún importe comercial aparece en migraciones, valores predeterminados ni código de
   producción.
5. Una dirección resuelve **cero o una** tarifa, demostrado con las pruebas de solapamiento.
6. `npm run envios:verificar` en verde contra `envios-tarifas-dev`, y **se niega** a
   ejecutarse contra Producción.
7. `npm run test:permisos` en verde contra la rama correcta, con las cinco tablas y sus
   secuencias denegadas al rol público.
8. Playwright en verde contra **`envios-tarifas-e2e`**, con su conexión y su administrador
   exclusivos, incluidas las operaciones autenticadas del panel de envíos. Sus fixtures son
   idempotentes y `envios-tarifas-dev` sigue con las tres tablas de configuración vacías.
9. `npm run test:datos`, `npm run test:admin` y `npm run test:proveedores` en verde.
10. `npm run typecheck`, `npm run lint` y `npm run build` limpios.
11. **Los archivos de prueba nuevos están dados de alta** en la lista de `test:datos` o
    `test:admin` de `package.json` y en el `testMatch` de `playwright.config.ts`, según
    corresponda. Un archivo no dado de alta no se ejecuta y nadie se entera.
12. Producción no recibe ninguna escritura, comprobable en su historial de migraciones.
13. `CLAUDE.md` y `docs/CONTINUAR-PANEL.md` actualizados **durante** el trabajo, con el
    recuento corregido de tablas, la división del subproyecto 9 en 9A y 9B, la procedencia
    de la semilla geográfica y el estado del rol `empleado`.
14. **La §4.2.1 tiene rellena también la huella de la instantánea normalizada**, y §4.2.3
    ya no tiene ningún municipio sin nombre, antes de que `012_geografia_gt.sql` exista.
    Emisor, publicación, URL, tamaño y huella del PDF están cerrados desde el 03/09/2026.
15. `npm run admin:crear` **rechaza** crear una cuenta con rol `empleado`.
16. Ninguna zona se puede borrar teniendo coberturas o tarifas, y **ninguna cobertura
    desaparece en cascada**.

---

## 10. Fuera de alcance

Sin `shipments`, sin `shipment_events`, sin cotizaciones individuales persistidas, sin
checkout, sin pedidos, sin pagos, sin FEL, sin integración con Guatex, sin seguimiento de
paquetes y sin cuentas de empleado. Sin `push`, sin `merge`, sin despliegue y sin tocar
Producción.

---

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Se cree que desplegar 9A bloquearía compras | **No bloquea ninguna compra actual, porque todavía no existe checkout.** La falta de tarifas empezará a impedir el pago cuando el subproyecto 6 consuma este servicio; para entonces el dueño debe haberlas cargado, y la portada del panel se lo recuerda |
| El coste real de Guatex sube con el peso y la tarifa al cliente es fija | Los dos límites por zona derivan el pedido grande a cotización antes de prometer un precio |
| La semilla geográfica puede quedar obsoleta si se crean municipios nuevos | Procedencia con fecha o versión documentada, y pruebas que comprueban conteos y unicidad |
| Direcciones antiguas cuyo texto no case con ningún municipio | Código nulo, texto intacto, y se pide elegir municipio la próxima vez que se use |
| 9A toca dos subproyectos ya desplegados: identidad y panel | Cambios aditivos, sin `default` en el rol y sin borrar datos; consta como ampliación de alcance |
| Introducir el rol sin aplicar la matriz completa dejaría acciones antiguas abiertas | No se crean cuentas de empleado hasta definir y aplicar esa matriz |
| Una configuración a medias podría prometer un precio equivocado | Zona activa, tarifa publicada y periodo vigente se exigen a la vez; si falta una, el resultado es cotización, nunca un importe |

---

## 12. Lo que el dueño tiene que hacer

1. Cargar desde `/admin` la tarifa de la zona Capital: Q35.00 y envío gratis desde
   Q2,500.00.
2. Definir las condiciones del resto del departamento de Guatemala, que hoy no tiene.
3. Ir creando las zonas del interior conforme tenga delante la tabla comercial real de
   Guatex, y asignarles sus departamentos.
4. Fijar los dos límites de cotización —piezas e importe— de cada zona.
5. Decidir cuándo activar la recogida en tienda y con qué texto.

---

## 13. Historial

| Fecha | Cambio |
|---|---|
| 03/09/2026 (revisión del archivo) | Nueve correcciones tras la lectura completa del dueño: `on delete restrict` también en las coberturas, con las reglas de borrado de tarifa y de zona definidas por separado; dos contratos de servicio, autenticado y estimación anónima marcada con `estimacion: true`; `metodo_no_disponible` para la recogida desactivada, y recogida sin plazos; `admin:crear` rechazando el rol `empleado` durante 9A; **retirada la programación futura de tarifas**, que contradecía la inmutabilidad y dejaba sin salida una sustitución urgente; procedencia geográfica con emisor, publicación, fecha, huella y conteo, verificada contra el conjunto versionado y no contra una secuencia continua; segundo entorno concretado como la rama `envios-tarifas-e2e`; límites de entrada escritos campo a campo, con el `codigo` de zona como slug inmutable; y cinco ajustes de coherencia sobre `faltanParaGratisCents`, los motivos del DTO público, las referencias públicas de producto, las instantáneas de dirección del subproyecto 6 y el efecto real de desplegar 9A |
| 03/09/2026 | Documento inicial. Aprobado por secciones, con las correcciones del dueño incorporadas: claves foráneas reales en lugar de un par polimórfico validado por regex; integridad compuesta entre municipio y departamento; precedencia explícita, con la cobertura municipal inactiva bloqueando el retroceso al departamento; límites de pedido evaluados antes que la gratuidad; carrito leído en el servidor y no recibido del navegador; `ahora` fuera del contrato externo; avería técnica separada del resultado de negocio; DTO público sin motivos internos; carrito no comprable deteniendo el cálculo; invalidación de caché fuera de la transacción; umbral gratuito sin validar contra la tarifa; autorización por rol sin valor predeterminado y releída en cada acción; Server Actions reconocidas como superficie de red; registros de ejecución sin geografía; tres migraciones separadas; semilla geográfica con procedencia verificable; y Playwright contra una base aislada |
