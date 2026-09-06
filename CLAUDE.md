@AGENTS.md

# ECONOLUZ GT — Guía del proyecto

Este archivo define el contexto, las reglas y las convenciones del proyecto.
Léelo completo antes de proponer o escribir código.

---

## 0. Estado de las decisiones (30/08/2026) — léelo antes que nada

El 30/08/2026 el dueño aprobó el rediseño del backend y del modelo de datos. La referencia
son estos dos documentos:

- `docs/superpowers/specs/2026-08-30-backend-relacional-v2-design.md` — el diseño global.
- `docs/superpowers/specs/2026-08-30-fundamentos-backend-design.md` — el primer subproyecto.

Ese rediseño **deroga reglas que todavía aparecen más abajo en este archivo**. Para que
nadie confunda lo que existe con lo que se decidió, lo afectado se reparte en tres
categorías.

### 0.1 Lo que existe hoy en el código y en producción

- El carrito avisa cuando se piden más unidades de las apuntadas en `products.stock` y
  ofrece «Dejar solo N» o «Quiero N y espero».
  `app/tienda/disponibilidad.server.ts` lo resuelve consultando la base de datos.
- El panel permite escribir existencias en el listado y en la ficha del producto.
- La columna `products.stock` existe y tiene valor en 24 de los 313 productos.

**Todo eso sigue funcionando y no se toca todavía.**

### 0.2 Decisiones futuras ya aprobadas por el dueño

- **ECONOLUZ no manejará stock, inventario, bodegas ni reservas.** La empresa no almacena
  mercancía: cada producto se le pide al proveedor cuando alguien lo compra. El modelo
  nuevo no tiene ninguna tabla de inventario, y **`stock` no debe reaparecer en la API
  nueva bajo ninguna forma**. Lo que ocupa su lugar es el plazo de entrega estimado, el
  estado «pendiente de confirmar con el proveedor» y el reembolso si no puede servirlo.

**Ninguna propuesta nueva puede reintroducir inventario.** Si un párrafo de este archivo
parece pedirlo, está derogado por esta sección.

### 0.3 Lo que solo se elimina después, en su tarea correspondiente

| Qué | Cuándo | Requisito |
|---|---|---|
| `products.stock`, `app/tienda/disponibilidad.server.ts`, el aviso del carrito y sus pruebas | Subproyecto 11 | Autorización expresa del dueño |
| `app/data/products.ts` como respaldo | Subproyecto 11 | Autorización expresa |

Leer esta documentación **no ejecuta** ninguna de esas retiradas ni basta como
autorización: ambas siguen necesitando el visto bueno expreso del dueño en su momento.

### 0.4 Estado del subproyecto 1 (01/09/2026)

El plan de fundamentos **está terminado**. La rama `feat/fundamentos-backend` cerró las
doce tareas en `4ffc547` y se fusionó por avance rápido en el `main` local. El dueño
autorizó por separado la preparación y el despliegue el 01/09/2026. Antes de publicar se
aplicaron las migraciones `005` a `008` en la rama principal de Neon, se reproyectaron
los 313 productos, se activó y comprobó el rol `econoluz_publico` y se añadió
`DATABASE_URL_PUBLIC` como secreto de Production en Vercel:

- **Tareas 1–6 terminadas:** errores tipados, registro estructurado, conexión y consultas
  con tiempo máximo, transacciones interactivas, frontera única de la capa de datos y
  verificación del migrador.
- **Contrato de `escribir()` cubierto** con un pool inyectado y una prueba antifuga que
  se comprobó que falla cuando se rompe deliberadamente la protección.
- **Tarea 7 terminada de extremo a extremo:** migración `005`, traducción y escritura de la proyección
  pública, comando idempotente de reproyección y seis pruebas de paridad, privacidad y
  precios. La revisión posterior centralizó la conversión monetaria, unificó el `upsert`,
  tipó los campos JSON y cambió `price_cents` a `bigint`.
- **Integración en Neon verificada:** se usó exclusivamente la rama aislada de desarrollo
  `fundamentos-backend-dev`. `005_proyeccion_publica.sql` quedó aplicada; las dos
  reproyecciones dieron **313 proyectados y 0 retirados**; la huella del contenido,
  excluido `updated_at`, fue idéntica antes y después. La tabla contiene 313 filas, los
  mismos 25 precios —con una huella idéntica a la conexión principal— y ninguna columna
  prohibida; se buscaron los 408 identificadores del proveedor y hubo **0 coincidencias**.
- **Tarea 8 terminada y verificada:** migración `006`, el rol `econoluz_publico` sin
  atributos elevados, `USAGE` sin `CREATE` sobre el esquema, `SELECT` únicamente sobre
  `public_products`, la prueba real `npm run test:permisos` y la guía
  `docs/OPERACION-ROL-PUBLICO.md`. Ninguna credencial entró en el repositorio.
- **Tarea 9 terminada y verificada:** migraciones `007_app_settings.sql` y
  `008_audit_log.sql`, el módulo puro `app/lib/ajustes.ts`, su lectura con caché breve
  `app/lib/ajustes.server.ts` y seis pruebas. La bandera `modelo_catalogo` **nació en
  `legacy` y ahí sigue**; ninguna página la consulta todavía. Repetir el `insert` dejó una
  sola fila con el mismo valor, `audit_log` quedó vacía con sus dos índices y su
  restricción rechazó un `actor_tipo` inventado, y `test:permisos` pasó de decir que las
  dos tablas «todavía no existen» a **denegarlas**.
- **Tarea 10 terminada y verificada:** los **once accesos** que abrían su propia conexión
  pasaron a `app/lib/datos`, un commit por archivo. `EXCEPCIONES_TRANSITORIAS` quedó
  **vacía**, así que dentro de `app/**` solo `app/lib/datos` importa el controlador de
  Neon; se comprobó metiendo a propósito un archivo que lo importaba y viendo fallar la
  prueba. El catálogo público **no cambió de fuente** y la disponibilidad del carrito
  conserva su lógica intacta. **Playwright volvió a pasar 67/67, esta vez con salida
  limpia.**
  - **Dos efectos reales del traslado**, que no conviene leer como «nada cambió»: estas
    consultas pasan a tener un **plazo máximo de diez segundos** donde antes no tenían
    ninguno, y sus fallos llegan como `ErrorDeDatos` **sin el texto de Postgres**.
  - **Sigue pendiente de decisión del dueño** poner en transacción las cuatro operaciones
    que leen antes de escribir —el alta de producto y tres del panel de proyectos—. Era
    así antes del traslado y se dejó igual a propósito. Ver `docs/CONTINUAR-PANEL.md`.

- **Tarea 11 terminada y verificada:** `app/data/origenPublico.ts` deja escrita y probada
  la regla más importante del subproyecto —**la conexión privilegiada nunca sustituye al
  rol público en producción**— con doce pruebas. Con `DATABASE_URL_PUBLIC` se usa el rol
  público; sin ella, en producción se sirve el catálogo escrito en el código y se registra
  un error de configuración, **sin llegar a invocar la privilegiada**; en desarrollo local
  sí se usa, con aviso. Comprobado contra `fundamentos-backend-dev`: `current_user` fue
  `econoluz_publico`, se leyeron 313 filas con 25 precios de `public_products` y `products`
  siguió denegada. Las dos pruebas estructurales se rompieron a propósito para verlas
  fallar antes de deshacer la rotura.
  - **Desviación deliberada:** el plan pedía enganchar la decisión en
    `app/data/catalog.server.ts` y **no se hizo**. Durante la implementación producción no
    tenía `DATABASE_URL_PUBLIC`; desde el 01/09/2026 ya está configurada, pero la fuente
    sigue sin cambiar porque el enganche pertenece al subproyecto 3. El catálogo continúa
    mostrando lo editado en el panel mediante el camino `legacy`.

- **Verificación fresca del último cierre:** `test:datos` 57/57, `test:admin` 196/196,
  `test:proveedores` 3/3, `test:permisos` correcto, `typecheck` y `lint` limpios, `build`
  correcto y `catalogo:auditar` con 313 productos, 408 identificadores y 0 coincidencias.
  Playwright no se repitió en la tarea 11, que no toca ninguna ruta; su último estado real
  es el **67/67 con salida limpia** de la tarea 10. En `fundamentos-backend-dev`:
  `modelo_catalogo` en `legacy`, 313 productos con **25 precios**, 313 filas en la
  proyección y `audit_log` vacía.

- **Tarea 12 terminada:** baterías completas, los **doce criterios de aceptación
  comprobados uno a uno con su evidencia** —están en el plan, sección «Cierre del
  subproyecto 1»— y `.env.example`, `docs/OPERACION-ROL-PUBLICO.md`, este archivo y
  `docs/CONTINUAR-PANEL.md` al día.

**El subproyecto 1 está terminado, revisado y fusionado localmente.** La preparación de
producción y el despliegue fueron autorizados expresamente el 01/09/2026. Las migraciones
`005` a `008` están aplicadas en producción, `public_products` contiene 313 filas, el rol
público pasó `test:permisos` con las diez tablas protegidas denegadas y
`DATABASE_URL_PUBLIC` está guardada como secreto de Production en Vercel. `main` se
publicó en GitHub hasta `7d882f6` y Vercel lo dejó `Ready` y `Current`. Se comprobaron la
portada, el catálogo, un producto con precio y compra, el carrito y la redirección del
panel a la entrada; el subproyecto 2 no ha empezado.

**Tres piezas quedan construidas y probadas pero sin consumidor**, y no deben darse por
activas: nadie llama a `proyectarProducto` —la proyección **no se mantiene sola**—, nadie
llama a `obtenerModeloDeCatalogo` ni al camino público de lectura, y ninguna escritura del
panel usa `escribir()`. Son del subproyecto 3. Por eso **desplegar este código sin aplicar
las migraciones nuevas en producción no rompe nada**: ninguna ruta toca esas tablas.

La bandera sigue en `legacy` y el catálogo público no ha cambiado de fuente. **Cambiarla
requiere autorización expresa del dueño**, y que las piezas estén probadas no es
autorización.

Además de la rama aislada de desarrollo, ya se escribió en la rama principal de Neon
para aplicar las cuatro migraciones y poblar la proyección. Los 25 precios permanecen
intactos y `modelo_catalogo` sigue en `legacy`. La rama y el worktree de desarrollo se
conservan hasta recibir autorización separada para retirarlos.

---

## 1. Qué es este proyecto

Rediseño completo del sitio web de **ECONOLUZ (Asesoría Profesional en Iluminación, S.A.)**,
empresa guatemalteca de iluminación fundada en 2006, con sede en Guatemala City
(21 Avenida 0-18, Vista Hermosa 2, Zona 15).

El sitio anterior (`econoluzgt.com`) está construido en WordPress + Elementor y funciona
como landing page informativa. Este proyecto lo reemplaza por completo.

### Reposicionamiento estratégico

ECONOLUZ está migrando de **proveedor de iluminación commodity** hacia
**soluciones integradas de iluminación arquitectónica y techo tensado**, dirigidas a
arquitectos, desarrolladores y el sector construcción.

El sitio debe reflejar ese posicionamiento: técnico, curado, con criterio de especificación.
No es una ferretería en línea; es una casa de iluminación que además vende al detalle.

---

## 2. Los dos públicos — regla crítica

El sitio atiende **dos modelos de negocio distintos con necesidades opuestas**, y el
catálogo tiene que servir a los dos **sobre el mismo producto**.

### Pista A — TIENDA (B2C, transaccional)

- **Quién:** cliente individual, compra 1 a 5 luminarias para su casa.
- **Qué necesita:** precio visible, foto grande, plazo de entrega, carrito, pago en línea, envío.
- **Decisión:** rápida, visual, guiada por precio y estética.
- **Navegación:** filtros por ambiente (sala, cocina, dormitorio, exterior), estilo y precio.
- **Salida esperada:** compra completada en línea.

### Pista B — PROYECTOS (B2B, especificación)

- **Quién:** arquitecto, diseñador, desarrollador, constructora, contratista.
- **Qué necesita:** ficha técnica (lúmenes, IRC, temperatura de color, ángulo de apertura,
  IP, vida útil, archivos IES/fotométricos), garantía, tiempos de entrega, referencias de obra.
- **Decisión:** lenta, técnica, comparativa, con presupuesto de proyecto.
- **Regla de precio:** el precio unitario de tienda **no sirve** para decidir aquí. El
  volumen se cotiza.
- **Flujo:** armar lista de especificación → solicitar cotización → asesoría.
- **Salida esperada:** solicitud de cotización con datos completos del proyecto.

### Las dos salidas conviven, pero no en la misma tarjeta — decisión vigente

**El catálogo es una tienda; la cotización vive en `/asesoria`.** Las dos salidas siguen
existiendo, pero cada producto ofrece **una sola**: el que tiene precio se compra, y el
que no lo tiene lleva a la asesoría con su referencia puesta. Quien necesita doscientas
luminarias sigue teniendo su vía, porque nadie compra un proyecto con tarjeta.

**Redacción anterior, derogada el 26/08/2026:** «un mismo producto ofrece las dos
salidas». Estuvo vigente unas horas y el dueño la retiró al verla: dos botones que
empiezan igual —«Agregar a cotización» y «Agregar al carrito»— obligan al visitante a
elegir sin saber en qué se diferencian, y dejaban dos cestos abiertos a la vez.

Y **antes de eso**, la regla exigía separar las dos pistas en interfaces y componentes
distintos, con la tienda como sección aparte. También se descartó: obligaba a duplicar
el catálogo entero.

**La asesoría tiene página propia desde el 26/08/2026.** El formulario de proyecto vivía
dentro de `/catalogo` y ocupaba media página: el dueño señaló que ahí no cabe un
comprador individual, y tenía razón. Ahora está en **`/asesoria`**, y el catálogo cierra
con una franja que enlaza a ella. **Las dos salidas siguen conviviendo** —esto no
resucita la separación derogada—: lo que cambió es la jerarquía dentro del catálogo, no
que la cotización desaparezca.

`app/catalogo/ProjectAdvisory.tsx` es autónomo: su propio estado y su propia lectura de
la selección, que viaja entre páginas por el almacenamiento del navegador. La página
carga el catálogo entero porque la selección se guarda como referencias y cantidades.

Cuando exista el carrito habrá que rematar la jerarquía en la ficha de producto: comprar
como acción principal, cotizar disponible sin competir.

> Lo que sí sigue vigente: si una propuesta hace que el usuario dude entre "¿compro o
> cotizo?", está mal resuelta. Antes eso se conseguía separando; ahora hay que conseguirlo
> con jerarquía dentro de la misma ficha — una acción principal clara y la otra disponible
> sin competir con ella.

**Techo tensado** es una línea diferenciadora de la pista B. Ningún competidor local lo
ofrece integrado con iluminación. Debe tener presencia propia, no quedar escondido.

### Estado actual — la pista A ya tiene carrito

Lo construido es casi todo pista B: catálogo guiado, ficha técnica, lista de cotización
y salida por WhatsApp. **De la pista A ya existen el precio y el carrito**: el catálogo
muestra el precio en la tarjeta y en la ficha, y donde no hay precio cargado dice
«Precio a consultar». Siguen sin existir **checkout, pasarela de pago y facturación**.

#### El catálogo es una tienda — regla vigente (26/08/2026)

**El catálogo dejó de ofrecer cotización producto a producto.** Ya no hay cesto de
selección, ni cajón lateral, ni botón «Ver selección»: se retiraron por decisión del
dueño junto con sus 671 líneas de código y 1.581 de pruebas. Deroga la redacción
anterior de «§2 Las dos salidas conviven» en lo que toca al catálogo.

Lo que sí convive, y no se retira: la página `/asesoria` sigue siendo la vía para
proyectos grandes. Las tarjetas **sin precio** llevan a ella con
`?producto=ECO-…`, porque son 288 de 313 y sin esa salida se quedarían sin ninguna
acción posible.

#### Tener precio es estar a la venta — regla vigente (26/08/2026)

No hay ninguna casilla de «se vende en línea». **Un producto con precio se puede
comprar; uno sin precio, no.** La columna `sellable_online` existe en la base de datos
pero no se usa, y su casilla se retiró de la ficha del panel: obligaba a hacer dos cosas
para vender una, y con más de trescientos productos administrados por una sola persona,
cada casilla extra es una tarea multiplicada por trescientos y un producto más que puede
quedar a medio configurar sin que nadie lo note. Lo decidió el dueño al preguntar qué era
esa casilla. Se pierde poder enseñar un precio de referencia sin vender el producto; es
un caso que hoy no existe, y la columna sigue ahí por si vuelve a hacer falta.

**Consecuencia que hay que tener presente:** ponerle precio a un producto lo pone a la
venta en cuanto se despliega. No hay una segunda confirmación.

#### El carrito

Vive en `app/tienda/`, separado a propósito del motor de cotización de
`app/catalogo/quoteSelection.ts`: los dos flujos divergen desde el primer día y la
cotización no debe cargar con precios ni existencias. La página es `/carrito` y el
contador aparece en la barra de navegación **solo cuando hay algo dentro**.

**Ningún importe que venga del navegador se acepta como bueno.** El navegador guarda
referencia y cantidad, nunca precios: se resuelven contra el catálogo del servidor cada
vez que se pinta. Si el importe viajara en el navegador, cualquiera podría editar su
propio `localStorage` y comprar un panel por un quetzal. Esta regla se hereda al
checkout y al cobro. El dinero se suma en **centavos enteros** (`app/tienda/lineas.ts`);
`formatPrice` solo se usa al pintar.

> **Comportamiento actual, con retirada ya aprobada (§0.2).** Lo que sigue describe lo
> que hace hoy el carrito en producción. La empresa no maneja inventario, así que este
> aviso desaparecerá en el subproyecto 11. No construyas nada nuevo encima.

Las existencias **avisan y dejan elegir, nunca bloquean**: cuando se piden más
unidades de las apuntadas, la línea ofrece llevarse las disponibles o esperar por el
resto, y la espera aceptada queda marcada para poder contactar al cliente. Solo pasa
cuando hay un número apuntado —la casilla vacía significa «no se ha contado el
inventario», que no es lo mismo que cero—.

**El inventario NO baja al catálogo público.** Estuvo saliendo en el HTML de los 313
productos entre el 26/08/2026 y ese mismo día, y llegó a producción: cualquiera podía
leer las existencias enteras sin comprar nada. Ahora el carrito pregunta al servidor
(`app/tienda/disponibilidad.server.ts`) solo por lo que lleva dentro, y el número se
revela únicamente cuando no alcanza. `tests/tienda-carrito.spec.ts` lo vigila.

El precio se enseña **por decisión expresa del dueño (26/08/2026)**, aunque la tienda no
esté: si el catálogo va a ser B2C, quien compra una o dos piezas necesita ver el precio
antes de decidir. Se le advirtió de las dos pegas —la competencia ve las tarifas y hoy
casi ningún producto tiene precio cargado— y aun así lo prefirió así. Es reversible:
basta con dejar de pintar `priceGtq` en `ProductCard` y en la ficha.

**Los productos ya no viven en el código: viven en Postgres (Neon).** La tabla
`products` guarda los 313, y `/catalogo` los lee de ahí filtrando por `published`.
`app/data/products.ts` sigue existiendo, pero dejó de ser la fuente de verdad: ahora es
la red de seguridad si la base de datos no responde, y lo que protegen las pruebas de
base. Editarlo **no cambia lo que ve el visitante mientras Neon conteste**, pero sí
cambia el catálogo de respaldo y sí cambia cualquier entorno sin `DATABASE_URL` —el
desarrollo local, por ejemplo—. Para cambiar la web se edita la base de datos.

`POST /api/leads` guarda las solicitudes de asesoría en la misma base de datos, y está
verificado en producción. La galería de proyectos también vive ya en Neon; el resto del
contenido editorial del home sigue en `app/data/*.ts`.

**El panel de administración existe y funciona.** Su acceso está protegido con usuarios
en Neon, contraseñas con `scrypt`, sesiones revocables con HMAC-SHA-256, límite
persistente de intentos y caducidad tras doce horas sin actividad. `/admin` redirige a
`/admin/entrar` sin sesión, y el panel no es indexable. El diseño está en
`docs/superpowers/specs/2026-08-25-admin-auth-design.md` y el plan que se siguió en
`docs/superpowers/plans/2026-08-25-admin-auth.md`.

**Toda la tienda B2C sigue por construir**, y con ella los requisitos operativos de la
sección 8 (FEL, pago, marco legal).

**El panel ya está activo en local (25/08/2026).** `db/003_admin.sql` está aplicado en
Neon, `ADMIN_SESSION_SECRET` está en `.env.local`, y el primer administrador se creó con
`npm run admin:crear`. Se comprobó entrando de verdad en `http://localhost:3000/admin`.

**El panel de productos está terminado.** El dueño puede buscar entre los 313, escribir
precio y existencias directamente en el listado, publicar y despublicar, editar la ficha
completa de cualquier producto —nombre, descripción, foto, galería, clasificación y ficha
técnica— y **dar de alta productos nuevos**, con la referencia puesta automáticamente y
la foto subida desde el navegador a Vercel Blob. Las fichas de producto son de servidor,
que es lo que mantiene los datos del proveedor fuera del JavaScript descargable.

Su portada muestra el estado real del catálogo leído de Postgres —**313 productos y
313 publicados**—, que es la forma de ver de un vistazo lo que falta. A 31/08/2026 hay
**25 con precio**; el dueño decidió dejarlos como están hasta que él o un trabajador de
ECONOLUZ cargue y revise los precios definitivos.

**El panel de proyectos está terminado y activo en Neon.** Permite crear, editar,
ordenar, publicar y ocultar proyectos; ordenar y retirar fotografías de forma reversible;
y subir varias imágenes directamente a Vercel Blob. `app/data/projects.ts` se conserva
como respaldo si Neon no responde. La web pública mantiene el mismo diseño y orden.

**Publicado el 26/08/2026.** El dueño autorizó el despliegue: los 50 commits se
fusionaron en `main` y se subieron a GitHub, y Vercel desplegó solo. `econoluz-gt.vercel.app`
sirve ya el catálogo con precios, la galería desde Neon y el panel en `/admin`.
`ADMIN_SESSION_SECRET` se añadió a Vercel como *Secret* del entorno Production antes de
subir, para que el primer despliegue lo tuviera.

La rama de trabajo era `panel-admin`; tras la fusión, **`main` es la rama viva**. El
siguiente bloque grande —la tienda— va en su propia rama, como pide la sección 10.

Verificación del 25/08/2026: `npm run test:admin` **129/129**, `typecheck` y `lint`
limpios, `build` correcto y Playwright **95/96**, con el único fallo histórico de
`catalog-quote.spec.ts:891`. Neon contiene 12 proyectos publicados y las 104 fotos
originales visibles; además queda oculta la imagen Blob de la prueba real.

---

## 3. Marca y reglas visuales

### Colores

La marca son **dos colores sobre base neutra**, ambos extraídos del logo
(`public/logo_econoluz.png`): azul marino y rojo.

- Azul marino de marca: `#001B59` — color dominante del logo (77 % de sus píxeles opacos:
  la bombilla, "LAMPARAS", "LUZ" y la barra inferior).
  Como fondo de botón con texto blanco: **16.1:1**, pasa AAA.
- Rojo de marca: `#E11133` — el rojo de "ECONO" (23 % de los píxeles opacos).
  Como fondo de botón con texto blanco: **4.85:1**, pasa AA para texto de cualquier tamaño;
  no llega a AAA. Si en algún control hace falta más margen, la variante oscura
  `#B80D28` da 6.7:1 sin cambiar el tono percibido.
- Neutro oscuro (base): `#0A0A0A` — fondo de secciones oscuras, hero y footer.
  Superficies elevadas sobre él: `#171717` y `#262626`.
- Neutro claro / fondo: `#FFFFFF` — fondo por defecto.
  Superficie alterna `#FAFAFA`, bordes y separadores `#E5E5E5`.
- Texto primario / secundario:
  - Sobre fondo claro: primario `#171717`, secundario `#525252`, terciario `#737373`
  - Sobre fondo oscuro: primario `#FFFFFF`, secundario `#D4D4D4`, terciario `#A1A1A1`

Todos estos valores son los de la escala `neutral` de Tailwind v4 que el código ya usa
(`neutral-950/900/800/200/50`, más `black` y `white`), así que se pueden escribir como
clases utilitarias sin definir tokens nuevos. `#FFFFFF` y `#171717` ya están fijados como
`--background` y `--foreground` en `app/globals.css`. Contraste sobre su fondo:
`#525252` 7.8:1, `#737373` 4.7:1, `#D4D4D4` 13.4:1, `#A1A1A1` 7.7:1 — todos pasan AA.

**Límites de contraste que hay que respetar** (los dos colores de marca son oscuros, así
que funcionan sobre blanco pero no sobre la base oscura):

| Uso | Ratio | Veredicto |
|---|---|---|
| Botón `#001B59` + texto blanco | 16.1:1 | AAA |
| Botón `#E11133` + texto blanco | 4.85:1 | AA |
| Texto `#001B59` sobre `#FFFFFF` | 16.1:1 | AAA |
| Texto `#E11133` sobre `#FFFFFF` | 4.85:1 | AA |
| Texto `#E11133` sobre `#0A0A0A` | 4.08:1 | **falla AA** — solo texto grande |
| Texto `#001B59` sobre `#0A0A0A` | 1.23:1 | **inservible** — no usar nunca |

Para secciones de fondo oscuro, usar las variantes claras en lugar de los hex de marca:
`#F2415F` (rojo, 5.4:1 sobre `#0A0A0A`) y `#5B7FD4` (azul, 5.1:1 sobre `#0A0A0A`).
Son variantes de pantalla, no colores de marca: no aparecen en logo ni en material impreso.

**Regla de uso de las variantes:** `#F2415F` y `#5B7FD4` se usan para **texto,
iconos y bordes** sobre fondo oscuro, nunca como relleno de botón. Sobre secciones
oscuras los botones primarios van en blanco o con borde, para no tener dos rojos de marca
distintos conviviendo en la misma pantalla.

Los dos colores están definidos como tokens en `app/globals.css` (`--proyectos`,
`--tienda`, sus variantes fuertes y claras, más `--error` y `--foco`) y se usan en todo
el sitio. El azul marino sustituyó al negro como color oscuro; el rojo marca la acción
principal y los acentos.

### Cuánto color, y dónde no

El blanco sigue siendo el fondo dominante y la fotografía de obra sigue siendo la
protagonista: en iluminación arquitectónica, las imágenes venden más que cualquier
superficie de color.

- El **azul marino admite superficie**: barras, franjas de datos, secciones completas.
  Es oscuro y de baja luminosidad, así que se comporta casi como un neutro y deja
  respirar la fotografía. El sitio original lo usa exactamente así.
- El **rojo va siempre en piezas pequeñas**: el botón principal de cada pantalla, las
  etiquetas en mayúsculas, los filetes, los iconos, el ítem activo del menú. Nunca como
  fondo de una sección ni de un bloque grande.

Que haya dos colores no es permiso para usar el doble de color. Una pantalla con tres
botones rojos no tiene una acción principal: tiene tres, que es lo mismo que ninguna.

**Excepción sobre fotografía:** los velos y degradados que oscurecen una imagen se
quedan en negro con transparencia (`bg-black/55`, `rgba(0,0,0,…)`). Teñirlos de azul
le daría un tinte de color a las fotos de obra.

### Reparto del color, tomado del sitio original

Regla vigente desde que se decidió replicar la identidad de `econoluzgt.com`. Su
hoja de estilos usa exactamente los mismos dos hex que este documento ya fijaba
(`#E11133` 29 veces, `#001B59` 19 veces), así que el reparto de abajo no es una
interpretación: es el del sitio que la empresa ya tenía.

- **Blanco `#FFFFFF`** — el fondo. Es el color dominante y no se discute.
- **Azul marino `#001B59`** — títulos grandes, fondos de sección oscuros, la barra
  de navegación en su estado normal, contornos, estados seleccionados, contadores
  y acciones secundarias.
- **Rojo `#E11133`** — la acción principal de cada pantalla (una sola por vista),
  las etiquetas en mayúsculas sobre fondo claro, los filetes bajo los títulos, los
  iconos y el ítem activo del menú.

En el original el rojo aparece de las dos formas: como relleno del botón principal
con texto blanco, y como color de texto en botones secundarios sin fondo. Ambas
son legítimas aquí.

**Sustituye a la regla anterior**, que reservaba el rojo para una pista de tienda
B2C y el azul marino para la de proyectos. Esa separación se descartó: la tienda no
existe, y mantener el rojo apagado hasta que existiera dejaba el sitio sin la mitad
de su identidad. El código funcional lo lleva ahora el texto del botón, no su color.

**Límite de contraste que sigue vigente:** el rojo sobre azul marino da 3.33:1, así
que **nunca hay texto rojo sobre una sección azul marino**. Un botón rojo sí puede
ir sobre azul marino, porque como bloque sólido le basta con 3:1 y el texto blanco
encima da 4.85:1. Sobre secciones oscuras, el texto blanco no baja de `white/52`
(5.17:1 sobre azul marino); `white/46` se queda en 4.30:1 y no cumple.

### Tono visual

Sobrio, con aire, tipografía clara y jerarquía marcada. Las fotos de proyectos reales
(Borghetto, BMW, Torre Once, San Martin, Insigne, Casa Campo, La Estación, Quo, Veka,
Desigual, Geely, Perfiles LED) son el activo visual más fuerte del sitio: dales espacio.

---

## 4. Stack técnico

- Framework: Next.js `16.3.1` — **App Router**. Todo el código vive en `app/`;
  no existe `pages/`, ni `src/`, ni `middleware.ts`. Hay rutas de API para leads y para
  crear o borrar la sesión del cliente.
  La versión importa: `16.2.6` duplicaba el ancla de la URL al navegar entre secciones
  (`/#inicio#inicio`) y se subió a `16.3.1` para corregirlo. No bajar de ahí.
- Lenguaje: **TypeScript** `5.9.3` en modo `strict`, sobre React `19.2.4`.
  Alias de importación: `@/*` → raíz del proyecto.
- Estilos: **Tailwind CSS v4** (`4.3.0`) vía `@tailwindcss/postcss`.
  Configuración CSS-first: **no hay `tailwind.config.*`**; los tokens se declaran con
  `@import "tailwindcss"` y `@theme inline` dentro de `app/globals.css`.
- Tipografía: `Geist` y `Geist Mono` cargadas con `next/font/google` en `app/layout.tsx`.
- Gestor de paquetes: **npm** (`package-lock.json`; no hay lockfile de pnpm ni yarn).
- Lint: ESLint 9 con `eslint-config-next` (`core-web-vitals` + `typescript`) — `npm run lint`.
- Pruebas: **Playwright** (`playwright.config.ts`, carpeta `tests/`). El navegador es
  `channel: "msedge"`; **chromium no está instalado**, así que un `npx playwright test`
  que asuma chromium falla. Levanta su propio servidor en el puerto `3100`.
- Deploy: Vercel (`econoluz-gt.vercel.app`), automático al empujar a `main` en GitHub
  (`Elesoj/econoluz-gt`). **El dominio `econoluzgt.com` todavía apunta al WordPress viejo**;
  cambiar el DNS es tarea del dueño del proyecto, no del código.
- Base de datos: **Postgres 18 en Neon**, con `@neondatabase/serverless`, creada desde el
  Marketplace de Vercel (región AWS US East 1). **En producción hay veinticinco tablas**
  (las once de siempre, cuatro de identidad, ocho del catálogo relacional y dos de carrito);
  **en la rama `feat/envios-tarifas` hay 30 tablas** —las 25 anteriores más las 5 del
  subproyecto 9A: `geo_departamentos`, `geo_municipios`, `shipping_zones`,
  `shipping_zone_areas` y `shipping_rates`—.
  Las tablas en producción son: las once de siempre —`leads`, `products`, `admin_users`,
  `admin_sessions`, `admin_login_attempts`, `projects`, `project_images`,
  `schema_migrations`, `public_products`, `app_settings` y `audit_log`—, las cuatro de
  identidad (`users`, `user_addresses`, `user_consents`, `auth_events`), las ocho del
  catálogo relacional (`categories`, `product_categories`, `product_private_data`,
  `product_images`, `attributes`, `attribute_options`, `product_attribute_values`,
  `product_prices`) y las dos del carrito (`carts`, `cart_items`).
  Las migraciones aplicadas en producción: `005`–`008` el 01/09/2026, `009` y `010` el
  02/09/2026, `011` (carrito) y **`012`, `013` y `014` del subproyecto 9A**, que suman las
  30 tablas actuales. *(Corregido el 04/09/2026: este archivo decía que `012`–`014`
  seguían pendientes en Producción. Se comprobó leyendo `schema_migrations` en una rama
  recién creada desde Producción, y las tres constan aplicadas.)*
  La migración **`015_direccion_zona_capitalina.sql` está aplicada solo en la rama de
  desarrollo `envios-operativos-dev`** y sigue pendiente en Producción. El rol `econoluz_publico` solo puede leer `public_products`; las
  otras tablas le están denegadas. Las migraciones se aplican con `npm run db:migrar`, que es
  repetible y soporta `--simular`, `--aplicar` y `--aplicar-produccion`. `DATABASE_URL` está
  en `.env.local` (ignorado por git) y en Vercel; `DATABASE_URL_PUBLIC` está en Vercel como
  secreto exclusivo de Production.
- Identidad de clientes: **Firebase Authentication**. El navegador usa el SDK web y el
  servidor `firebase-admin`. En local se autentica con credenciales predeterminadas (ADC);
  en Vercel, con **Workload Identity Federation**, ya montada y demostrada el 01/09/2026
  con una prueba positiva y una negativa. Desarrollo usa `econoluz-dev-d30ab`. La política
  corporativa prohíbe claves privadas de cuentas de servicio: no crear JSON ni variables
  con una clave privada, y no hay respaldo hacia ADC dentro de Vercel.
  El fallo de carga en Vercel quedó resuelto el 01/09/2026 al incluir `firebase-admin`
  en `transpilePackages`: Next dejó de externalizarlo y empaquetó también la cadena
  `jwks-rsa` → `jose`. Un único Preview compiló y `/cuenta` respondió con la redirección
  prevista a `/cuenta/entrar`, sin `ERR_REQUIRE_ESM`. No hizo falta fijar `jose` v5.
  Ver `docs/OPERACION-FIREBASE.md` §3.
- Pasarela de pago: `TODO — pendiente de decidir`
- Certificador FEL: `TODO — pendiente de decidir`

### Estructura de carpetas

El repositorio git está en `frontend/`, no en la carpeta que lo contiene.

```text
frontend/
  app/                            App Router: rutas, componentes y datos
    layout.tsx                    layout raíz, metadata global y fuentes
    page.tsx                      home
    globals.css                   Tailwind, tokens CSS y utilidades propias
    favicon.ico
    calculadora-led/page.tsx      calculadora de ahorro LED
    politica-devoluciones/page.tsx
    catalogo/                     catálogo guiado y flujo de cotización
      page.tsx                    servidor: arma el payload público
      CatalogClient.tsx           cliente: filtros, buscador, paginación
      catalogState.ts  useCatalogNavigation.ts  quoteSelection.ts
      useQuoteSelection.ts  quotePersistence.ts  floatingQuoteStore.ts
      publicQuoteMessage.ts       texto de la cotización que sale por WhatsApp
    api/leads/route.ts            guarda el lead en Neon
    api/clientes/                 canje de sesión y borrado/anonimización de la cuenta
    cuenta/                       acceso, resumen y direcciones del cliente
    identidad/                    Firebase Admin, sesión, perfiles y políticas de identidad
    components/                   UI compartida (12 componentes + ui/)
                                  AnimatedStat, ContactCTA, FloatingWhatsApp,
                                  LedSavingsCalculator, ProductCard,
                                  ProductTechnicalDrawer, ProjectSlider,
                                  QuoteDrawer, SectionHeader, SiteFooter,
                                  SiteNavbar, SupplierMarquee
      ui/                         Button, FilterChip
    data/
      products.ts                 los 313 productos escritos a mano (~9 900 líneas).
                                  YA NO es la fuente de verdad: manda la base de datos.
                                  Es la red si Neon no responde y la base de las pruebas.
      productRow.ts               traducción producto <-> fila, y listas de columnas
      publicProduct.ts            recorta el producto interno a lo que ve el navegador
      catalog.server.ts           lee el catálogo de Postgres, con caché por etiqueta
                                  (CATALOG_CACHE_TAG) y vuelta al código si falla
      catalogTaxonomy.ts          taxonomía pública de tipos y aplicaciones
      publicProductContract.ts    contrato público seguro para componentes cliente
      publicProductPrivacy.ts     anonimiza textos y rutas solo al salir al público
      catalogBrands.internal.ts   marcas del proveedor — NUNCA llega al cliente
      catalogSeries.internal.ts   series del proveedor — NUNCA llega al cliente
      productReferences.ts        referencias públicas de producto
      projects.ts                 galería de obra ejecutada
      projectRow.ts               traducción reversible proyecto <-> filas
      projects.server.ts          lectura pública desde Neon, caché y respaldo local
      projectsQuery.ts            consulta y reconstrucción del contrato público
      siteData.ts                 navegación, contacto, home, FAQ, proveedores
      proyeccionPublica.ts        producto interno -> fila de `public_products`
      proyeccionPublica.server.ts escribe la proyección dentro de transacción
      proyeccionPublicaSql.ts     el `upsert` compartido por los dos escritores
      origenPublico.ts            de dónde sale el catálogo público; aún sin consumidor
    lib/
      formatters.ts               formateo de números y moneda
      dinero.ts                   quetzales <-> centavos enteros
      ajustes.ts                  lectura tipada de `app_settings`, conservadora
      ajustes.server.ts           la misma lectura con caché breve
      datos/                      LA ÚNICA CARPETA QUE IMPORTA EL CONTROLADOR DE NEON
        index.ts                  la superficie pública: leer, leerPublico, escribir
        conexion.ts               las dos conexiones, creadas de forma perezosa
        consulta.ts               consultar por HTTP con tiempo máximo y tipado
        transaccion.ts            BEGIN/COMMIT/ROLLBACK y liberación garantizada
        escritura.ts              el contrato de `escribir`, con registro
        errores.ts                los cuatro errores tipados
        registro.ts               registro estructurado, sin datos personales
    admin/                        el panel, detrás de autenticación
      layout.tsx                  metadata `noindex` del panel entero
      entrar/                     pantalla de acceso pública
      (panel)/                    zona protegida: portada, productos y proyectos
      sesion/route.ts             renovación de la sesión por actividad
      auth/                       criptografía, políticas, repositorio y la DAL
      productos/                  consultas, validación, fotos y Server Actions
      proyectos/                  consultas, validación, orden, fotos y subidas Blob
      panelStats.ts               las cifras del catálogo que abren la portada
  db/                             migraciones SQL, se aplican en orden con db:migrar
    001_leads.sql                 solicitudes de asesoría
    002_products.sql              catálogo de productos, comentado campo por campo
    003_admin.sql                 usuarios, sesiones e intentos de acceso del panel
    004_projects.sql              galería de proyectos y sus fotografías
    005_proyeccion_publica.sql    proyección pública derivada del catálogo
    006_rol_publico.sql           el rol de solo lectura y sus permisos, sin contraseñas
    007_app_settings.sql          configuración persistente; guarda `modelo_catalogo`
    008_audit_log.sql             quién cambió qué, con el antes y el después
    009_identidad_clientes.sql    clientes, direcciones, consentimientos y eventos de acceso
    010_catalogo_relacional.sql   las ocho tablas del nucleo relacional de productos
    011_carrito.sql               carrito del cliente con sesion: carts y cart_items
    012_geografia_gt.sql          catalogo INE: 22 departamentos y 340 municipios
    013_envios_tarifas.sql        zonas de reparto y tarifas de 9A; sin consumidores
    014_roles_admin.sql           rol de admin_users: administrador y empleado
    015_direccion_zona_capitalina.sql  zona capitalina en user_addresses y ajustes de envios
  scripts/                        utilidades de línea de comandos (ver "Comandos")
  docs/CONTINUAR-PANEL.md         hoja de traspaso: qué falta y cómo hacerlo
  docs/OPERACION-ROL-PUBLICO.md   crear, rotar y verificar la credencial del rol público
  docs/OPERACION-FIREBASE.md      ADC local y futura identidad federada de producción
  tests/                          Playwright: catálogo, cotización y fronteras de datos
  public/
    logo_econoluz.png
    catalogos/                    imágenes de producto; las rutas públicas usan
                                  arquitectonico/, lineal/ y electrico/
    proyectos/<obra>/             fotografía de obra ejecutada
    proveedores/                  logos de marcas representadas
    file|globe|next|vercel|window.svg   assets de create-next-app, sin usar
  AGENTS.md                       reglas de Next.js autogeneradas (se incluye desde aquí)
  next.config.ts  tsconfig.json  postcss.config.mjs  eslint.config.mjs
  playwright.config.ts  .env.example
```

### El catálogo público no expone los datos del proveedor

Regla de negocio, no de estilo: el cliente **no debe poder identificar al fabricante** ni
irse a comprarle directamente.

**Lo que está garantizado hoy:** los campos internos del proveedor —`sku`, `brand`,
`supplierBrand`, `supplierCode`, `productCode`, la serie— **no cruzan al catálogo
público**. Viven en los archivos `*.internal.ts` y en las columnas `supplier_*` de la
base de datos, y `publicProduct.ts` decide qué pasa. No basta con ocultarlos en
pantalla: tampoco pueden aparecer en el JavaScript que se descarga, y
`tests/catalog-production-boundary.spec.ts` revisa los chunks compilados precisamente
para eso.

**Resuelto y desplegado el 26/08/2026:**
`publicProductPrivacy.ts` transforma únicamente la proyección pública. Las imágenes
salen por `arquitectonico/`, `lineal/` y `electrico/`; los nombres de línea se retiran;
y `Magnetrack Pro` pasa a «Microrriel magnético 48 V», incluido su identificador de
filtro. `npm run catalogo:auditar` normaliza mayúsculas, tildes, espacios y guiones y
devuelve **0 coincidencias**. El producto interno y las columnas `supplier_*` no se
tocan: el panel conserva marca, serie, código y nombre del fabricante.

Las 326 imágenes originales siguen en sus carpetas antiguas porque no se borra ningún
archivo sin permiso. Producción ya sirve y enlaza las 326 rutas neutras; los originales
se retirarán únicamente después de recibir autorización expresa.

**Alcance de la prohibición:** se refiere al **catálogo público y a cualquier visitante
sin sesión**. El panel de administración, detrás de autenticación, necesariamente envía
esos datos al navegador de quien administra, porque son los que tiene que editar. Lo que
no puede ocurrir es que acaben en un chunk compartido que se descargue en las páginas
públicas.

Al añadir cualquier vista nueva —filtro, ficha, buscador, resumen de cotización,
pantalla del panel— hay que comprobar que no reabre esa puerta.

Fuera de `frontend/`, la carpeta hermana `Imagenes/` guarda el original del logo.
No entra en el build ni está en el repositorio. Hay también una carpeta `app/` vacía,
resto de un movimiento antiguo.

**Abre `frontend/` como carpeta de trabajo, no la carpeta que la contiene.** Las
herramientas que cargan instrucciones solas las buscan desde la raíz del proyecto hasta
la carpeta de trabajo, sin bajar a subcarpetas: abriendo la carpeta padre no encuentran
`AGENTS.md` y se programa sin ninguna de estas reglas. Hay punteros en la carpeta padre
por si acaso, pero están fuera del repositorio y no viajan con un clon.

### Comandos

```bash
npm run dev                # servidor de desarrollo
npm run build              # compilación de producción
npm run typecheck          # tsc --noEmit
npm run lint
npx playwright test        # batería completa

npm run db:migrar          # aplica las migraciones de db/ que falten, repetible
npm run db:migrar -- --simular   # las aplica en una transaccion y la revierte, sin escribir
npm run catalogo:importar  # SIMULA la subida de los productos; -- --aplicar la escribe
npm run catalogo:verificar # ensayo de la migración, sin tocar la base de datos
npm run catalogo:auditar   # busca nombres de proveedor en el catálogo público
npm run test:proveedores   # frontera pública neutra e información interna intacta
npm run proyectos:verificar # ensayo reversible de los 12 proyectos y 104 fotos
npm run proyectos:importar  # importa a Neon de forma idempotente y relee el resultado
npm run proyectos:probar    # prueba cambios reales en Neon y los restaura siempre

npm run test:admin         # las pruebas de unidad del panel (196)
npm run admin:crear        # da de alta un administrador o le cambia la contraseña

npm run test:datos         # capa de datos, ajustes e identidad (167)
npm run test:permisos      # comprueba contra Neon que el rol público solo lee la proyección
npm run catalogo:reproyectar # SIMULA reconstruir la proyección pública; -- --aplicar la escribe

# Catálogo relacional. Sin `--produccion` hablan con la rama aislada de desarrollo.
npm run catalogo:relacional:modelo      # lee la bandera `modelo_catalogo`
npm run catalogo:relacional:comparar    # compara los dos modelos; solo lectura, acaba en ROLLBACK
npm run catalogo:relacional:verificar   # invariantes, permisos y privacidad del modelo nuevo
npm run catalogo:relacional:simular     # ensaya la importación relacional sin escribir
npm run catalogo:relacional:importar    # la escribe

# Contra Producción hay que pedirlo por su nombre. Leer solo necesita la bandera y el
# endpoint; escribir exige además las tres llaves. La reversión usa este mismo camino:
#   PERMITIR_ESCRITURA_PRODUCCION=true
#   CONFIRMAR_PRODUCCION=modelo-catalogo-en-produccion
#   NEON_ENDPOINT_PRODUCCION=ep-misty-sun-avmcbgly.c-11.us-east-1.aws.neon.tech
npm run catalogo:relacional:modelo -- --poner legacy --produccion

npm run carrito:verificar   # comprueba el carrito contra una base de verdad; se niega en Produccion

npm run identidad:adc       # valida ADC contra el proyecto Firebase configurado
npm run identidad:federacion # valida la identidad federada de Vercel de extremo a extremo
npm run identidad:verificar # invariantes reales en Neon dentro de una transacción reversible
npm run identidad:probar    # prueba aprovisionamiento concurrente; crea y limpia datos sintéticos
npm run identidad:reconciliar # solo informa; añadir -- --aplicar para reparar huérfanos

npm run envios:verificar    # 18 invariantes de esquema contra la base de desarrollo, siempre en ROLLBACK
npm run direcciones:migrar-codigos # empareja códigos INE en user_addresses (idempotente)
```


`identidad:federacion` necesita el entorno de Vercel descargado **a un archivo aparte**:
`npx vercel env pull .env.vercel.local`. Nunca sobre `.env.local`, que se sobrescribiría.

Los scripts de `scripts/` importan los datos `.ts` del proyecto sin compilar, gracias
al gancho `register-ts.mjs`. Cualquier script nuevo que haga lo mismo necesita
`--import ./scripts/register-ts.mjs`.

**La consola es Windows PowerShell 5.1 y no entiende `&&`.** Los comandos que se le den
al dueño del proyecto van en líneas separadas.

### Regla crítica de versión

Esta versión de Next.js tiene cambios que rompen compatibilidad: las APIs,
convenciones y estructura de archivos pueden diferir de tus datos de
entrenamiento. Antes de escribir código, consulta la guía correspondiente en
`node_modules/next/dist/docs/`. Atiende los avisos de deprecación.

---

## 5. Convenciones de contenido

- **Idioma:** español de Guatemala. Nada de español neutro forzado ni traducciones literales.
- **Moneda:** Quetzales, formato `GTQ 1,250.00` o `Q1,250.00` (usar uno solo de forma consistente).
- **Teléfonos:** formato local de 8 dígitos con espacio (`2311 1846`, `4042 8790`).
  Los enlaces `tel:` y `wa.me` sí llevan código de país (`+502`).
- **Fechas:** formato `DD/MM/AAAA`.
- **Medidas:** sistema métrico (m², metros, lúmenes, watts, Kelvin).
- **Tono de copy:** técnico pero legible. Evitar superlativos vacíos
  ("los mejores", "líderes del mercado"). Preferir dato concreto.

---

## 6. Reglas de código

- No introducir dependencias nuevas sin justificarlas primero.
- Componentes reutilizables entre las dos pistas donde tenga sentido, pero
  **sin acoplar la lógica de compra con la lógica de cotización**.
- Todo formulario debe persistir el dato antes de abrir WhatsApp
  (ver "Deuda técnica conocida").
- **Ningún importe que venga del navegador se acepta como bueno.** El navegador guarda
  referencias y cantidades; los precios se resuelven siempre contra el catálogo del
  servidor. Vale para el carrito, el checkout y el cobro.
- **El dinero se suma en centavos enteros**, nunca en coma flotante. `formatPrice` solo
  al pintar.
- **Todo acceso a Postgres desde `app/**` pasa por `app/lib/datos`.** Ningún otro archivo
  importa `@neondatabase/serverless`, y `tests/datos-frontera-controlador.test.ts` lo
  vigila con una lista de excepciones que hoy está vacía. `scripts/**` queda fuera a
  propósito: `scripts/migrate.mjs` crea el esquema del que depende la capa.
  Las lecturas y las escrituras de una sola sentencia van por `leer`; `escribir` es para
  las operaciones que necesitan transacción.
- **La conexión privilegiada nunca sustituye al rol público en producción.** Si falta
  `DATABASE_URL_PUBLIC`, se sirve el respaldo estático y se registra el error; ver
  `app/data/origenPublico.ts`.
- **La identidad de clientes y la identidad del panel nunca se mezclan.** Ninguna de las
  dos capas importa la otra. Dentro de `app/**`, solo
  `app/identidad/firebase.server.ts` puede importar `firebase-admin`; las excepciones de
  `scripts/**` están declaradas y vigiladas por `tests/identidad-frontera.test.ts`.
- Accesibilidad: contraste suficiente, textos alternativos en imágenes,
  navegación por teclado funcional.
- Rendimiento: las imágenes **ya están optimizadas** (430 archivos, 24 MB en total,
  ninguna supera 210 KB) y los `sizes` actuales son correctos. No hace falta
  recomprimir nada. Al añadir imágenes nuevas, mantener `next/image` con `sizes`
  coherentes con el layout real, y **nunca cargar rutas crudas de `/public`
  saltándose el optimizador** (es lo que hace hoy el precargado de `ProjectSlider`,
  que descarga cada foto dos veces).
- Mobile first. En Guatemala la mayoría del tráfico llega desde celular.

---

## 7. Deuda técnica conocida

Problemas ya identificados en la versión actual. No los repitas y ayúdame a resolverlos:

1. **Contadores del home: resuelto.** Mostraban cero porque dos de las cuatro cifras no
   eran números ("Eficiencia", "Cobertura") y el contador animado las llevaba a `0`.
   Ahora la banda repite las cifras del sitio original —`+500` lámparas, `11` marcas,
   `9` proveedores, `+1,000` clientes satisfechos— y `AnimatedStat` deja pasar sin animar
   cualquier valor que no tenga dígitos, en vez de convertirlo en cero.
2. **Captura de leads: resuelta, con el aviso por correo pendiente.** El formulario
   de asesoría ya guarda el lead en Postgres (Neon) mediante `POST /api/leads` antes
   de abrir WhatsApp, así que deja de perderse si el usuario no tiene WhatsApp, si el
   salto falla o si nunca llega a pulsar enviar.

   **Pendiente: la notificación por correo.** El envío con Resend está implementado
   pero desactivado, porque el dominio del correo corporativo lo controla un tercero
   al que no tenemos acceso y no se puede verificar el remitente. Mientras falten
   `RESEND_API_KEY`, `LEADS_EMAIL_FROM` y `LEADS_EMAIL_TO`, el envío se omite, queda
   constancia en el log del servidor y **el lead se guarda igual**: el usuario ve la
   confirmación normal, no un error. Cuando se recupere el control del dominio basta
   con definir esas tres variables en Vercel; no hay que tocar código.

   Hasta entonces, las solicitudes solo se ven consultando la tabla `leads`. Conviene
   revisarla a diario o el lead se guarda pero nadie se entera. Queda ahí una solicitud
   de prueba (`id = 1`, «PRUEBA TECNICA - no es un cliente») que sirvió para comprobar
   que producción guardaba de verdad; se puede borrar cuando el dueño quiera.
3. **Exposición pública del proveedor: resuelta y desplegada el 26/08/2026.** La salida
   pública transforma rutas, nombres, descripciones, taxonomía y
   ficha técnica sin modificar el producto interno. La auditoría revisa 313 productos y
   408 identificadores normalizados y devuelve 0 coincidencias. La prueba específica
   confirma además que el panel conserva Artlite, Construlita, Highlum y Magnetrack Pro.
   Ver `docs/FUGAS-PROVEEDOR.md`.

   **Queda un cabo suelto:** las carpetas de imágenes antiguas
   (`/catalogos/construlita/…`) siguen existiendo y **responden 200 en producción** si
   alguien conoce la URL —comprobado el 26/08/2026—, aunque ninguna página las enlaza ya.
   Borrarlas cierra la fuga del todo y **necesita autorización expresa del dueño**.
4. **Una prueba falla desde antes de la migración.**
   `tests/catalog-quote.spec.ts:891` falla de forma determinista. **Comprobado otra vez el
   26/08/2026** haciendo `git checkout main` y ejecutándola sin nada del trabajo nuevo:
   falla igual. En la batería de ese día pasan las otras 103 y las 169 de unidad. No
   perder tiempo creyendo que es una regresión.
5. **Falta `og:image`** y el `twitter:card` está en `summary` en lugar de
   `summary_large_image`. Casi todo se comparte por WhatsApp en Guatemala.
6. **Regresión de SEO.** El sitio viejo posiciona para "lámparas LED Guatemala".
   El título nuevo ("Catálogo de iluminación por cotización") no lo busca nadie.
   Hay que conservar las palabras clave reales y mapear redirects 301 desde las
   URLs viejas de WordPress.
7. **Cuatro operaciones del panel leen antes de escribir sin transacción.** El alta de
   producto encadena tres sentencias —pedir el número de la secuencia, mirar la última
   posición e insertar— y `setProjectPublished`, `moveProjectImage` y
   `setProjectImageVisible` leen y después escriben. **Ya era así antes** de que existiera
   la capa de datos; el traslado del subproyecto 1 las dejó igual a propósito, porque
   encerrarlas en `escribir()` cambia su atomicidad y con ello lo que ocurre si algo falla
   a mitad. La capa ya ofrece `escribir()`, construido y probado, así que el arreglo es
   pequeño cuando se decida. **Es una decisión del dueño**, y no urge: una sola persona
   administra el panel, de modo que dos escrituras simultáneas sobre el mismo proyecto son
   improbables. El riesgo real es quedarse con una posición repetida o una foto a medio
   mover si Neon corta justo entre las dos sentencias.

8. **`app/components/ui/FilterChip.tsx` quedó sin usar** al retirar el filtro de series.
   No se borró porque la sección 9 prohíbe borrar archivos sin preguntar antes.

---

## 8. Requisitos operativos de Guatemala

Aplican a la pista de tienda y condicionan el diseño del checkout:

- **Factura electrónica (FEL/SAT):** toda venta requiere factura electrónica.
  El checkout debe capturar NIT y nombre fiscal como mínimo.
- **Pasarela de pago:** evaluar opciones locales y dejar transferencia bancaria
  con confirmación manual como alternativa.
- **Marco legal:** términos y condiciones, política de privacidad, política de envíos
  y política de devoluciones específica para compra en línea (la actual fue redactada
  para otro contexto). Obligaciones de información al consumidor ante DIACO.
- **Plazo de entrega y confirmación del proveedor:** ECONOLUZ no almacena mercancía, así
  que **no hay inventario que gestionar ni sincronizar**. Cada producto se le pide al
  proveedor cuando alguien lo compra. Lo que sí hay que resolver es el plazo de entrega
  que se le promete al cliente y qué ocurre cuando el proveedor no puede servir algo ya
  pagado: el pedido queda «pendiente de confirmar con el proveedor», y si no puede
  servirse se cancela y se reembolsa. Ver §0.2.
  *(Nota: hasta el 30/08/2026 este punto pedía definir la sincronización con un
  inventario interno. Quedó derogado.)*

---

## 9. Qué NO tocar

- Los assets de proyectos en `/public/proyectos/` — 104 archivos de fotografía propia de
  obra ejecutada, en 12 carpetas (`bmw`, `borghetto`, `casaycampo`, `desigual`, `geely`,
  `insigne`, `laestacion`, `once`, `perfilesled`, `quo`, `sanmartin`, `veka`).
  `app/data/projects.ts` arma las rutas con el nombre de carpeta y de archivo literales:
  renombrar cualquiera de los dos rompe la galería sin que falle el build.
- Las imágenes de catálogo en `/public/catalogos/`: las 326 originales organizadas por
  proveedor y sus 326 copias públicas neutras. `app/data/products.ts` conserva las rutas
  internas y `publicProductPrivacy.ts` decide la ruta que recibe el visitante. No borrar
  las originales hasta verificar el despliegue y recibir autorización expresa.
  Los PDF fuente están excluidos del repositorio por `.gitignore` (`/public/catalogos/*.pdf`).
- Los logos de `/public/proveedores/` — 11 marcas representadas. Los usa la cinta
  `SupplierMarquee` del home, con las rutas literales de `siteData.ts`.
- El logo (`/public/logo_econoluz.png`) — no recortar, recolorear ni regenerar.
- El bloque de `AGENTS.md` entre `BEGIN:nextjs-agent-rules` y `END:nextjs-agent-rules`
  lo genera Next.js y lo sobrescribe. Las reglas propias van en este archivo.
- Archivos generados: `.next/`, `node_modules/`, `next-env.d.ts`.
- Datos de contacto, direcciones y horarios (`app/data/siteData.ts`: teléfonos, WhatsApp,
  dirección): solo se cambian si yo lo indico expresamente.
- No publicar ni desplegar nada sin confirmación explícita.
- No borrar archivos sin preguntar antes.

---

## 10. Cómo quiero trabajar

- Antes de una tarea grande, propón el plan y espera mi aprobación.
- Si detectas un problema fuera del alcance de lo que pedí, dímelo, no lo arregles por tu cuenta.
- Prefiero evaluación honesta y directa antes que confirmación de lo que ya pensé.
  Si una idea mía es mala, dilo y explica por qué.
- Trabajo por ramas de git: cada bloque grande (tienda, proyectos, migración SEO)
  en su propia rama.
- **Quiero cargar y corregir el contenido yo mismo**, sin pedírselo a un programador.
  Cualquier dato que yo vaya a mantener —productos, precios, fotos— no
  debería nacer escrito dentro del código.
- Recuérdame en qué punto del plan general estamos, no solo el plan de la tarea de hoy.
- **Mantén los `.md` al día mientras trabajas, no al final.** Actualizar este archivo y
  `docs/CONTINUAR-PANEL.md` forma parte de terminar un paso, igual que pasar las
  pruebas. Trabajo a caballo entre herramientas y con límite de tokens: si la
  documentación describe un estado que ya no existe, quien retome el proyecto —otra
  persona u otro agente— actuará sobre información falsa.

---

## 11. Hoja de ruta

El orden importa: cada paso desbloquea al siguiente.

**Publicar lo que ya existe.** `DATABASE_URL` ya está en Vercel y las solicitudes de
asesoría se guardan de verdad en producción, comprobado enviando una al sitio publicado.
**Sigue pendiente apuntar el DNS de `econoluzgt.com` a Vercel**: hoy ese dominio todavía
sirve el WordPress viejo y solo `econoluz-gt.vercel.app` tiene el sitio nuevo. Es una
tarea de paneles, no de código, y la hace el dueño del proyecto.

**Paso 1 — Productos en base de datos y panel de administración.** Terminado en local.

- ~~Los 313 productos a Postgres~~, verificados campo por campo contra la huella
  congelada del catálogo.
- ~~Que `/catalogo` los lea de la base de datos~~, comprobado despublicando un producto
  y viendo que la página pasaba de 313 a 312.
- ~~La entrada al panel~~, activa y usada: usuarios en Neon, sesiones revocables y
  límite de intentos.
- ~~El panel de productos~~: listado con edición en línea, ficha completa y alta de
  productos nuevos.
- ~~La subida de fotos~~ a Vercel Blob, con el almacén ya creado y probado.
- ~~La galería de proyectos~~: 12 proyectos y 104 fotos visibles en Neon, edición,
  orden, publicación, retirada reversible y subida múltiple desde el panel.
  **El plan detallado de cada uno está en
  `docs/CONTINUAR-PANEL.md`**, escrito para poder retomarse sin contexto previo.

**Desplegado el 26/08/2026** en `econoluz-gt.vercel.app`, con autorización expresa del
dueño. Sigue pendiente apuntar el DNS de `econoluzgt.com`.

La anonimización del proveedor también se fusionó en `main` y se verificó en producción
el 26/08/2026: 326 rutas neutras, 0 rutas antiguas enlazadas y 0 identificadores sensibles
en el HTML y los recursos públicos revisados. Las carpetas originales siguen presentes
hasta recibir permiso separado para borrarlas.

**Paso 2 — Tienda.** Precio y compra conviviendo con la cotización. Se descompone en
cuatro piezas, y solo la primera está hecha:

- ~~**A. El carrito.**~~ Terminado y **fusionado en `main` el 26/08/2026**, todavía sin
  desplegar. Diseño en `docs/superpowers/specs/2026-08-26-tienda-carrito-design.md`,
  plan en `docs/superpowers/plans/2026-08-26-tienda-carrito.md`.
- **B. Checkout con datos fiscales (NIT).** No depende de nadie de fuera de la empresa,
  pero sí de cuatro subproyectos anteriores: 2 (identidad), 3 (catálogo relacional),
  5 (carrito persistente) y 9 (envíos). Es el subproyecto 6.
- **C. El cobro.** **Bloqueado**: depende de contratar una pasarela de pago, trámite que
  el dueño todavía no ha empezado. Puede llevar semanas. Eligió cobro con tarjeta.
- **D. Factura FEL.** Bloqueado: depende de contratar un certificador.

*(Nota: hubo una pieza E, «descuento de existencias». Se retiró el 30/08/2026 porque no
hay existencias que descontar, ver §0.2.)*

### El paso 2 se reorganizó el 30/08/2026

Las piezas B, C y D siguen siendo necesarias, pero **ya no se construyen sueltas sobre el
backend actual**. El diseño aprobado las reparte en diez subproyectos, cada uno con su
especificación, su plan, sus pruebas y un punto de revisión con el dueño:

1. Fundamentos y capa de datos · 2. Identidad de clientes · 3. Catálogo relacional v2 ·
5. Carrito persistente · 6. Checkout y pedidos · 7. Pasarela de pago (bloqueado) ·
8. Facturación FEL (bloqueado) · **9. Envíos** (dividido en 9A y 9B) ·
10. API v1 y preparación móvil · 11. Migración final y retirada del modelo antiguo.

**No existe un subproyecto 4:** era inventario y reservas, y desapareció con la decisión
de §0.2.

**El subproyecto 9 se divide en 9A y 9B:**
- **9A (fusionado en `main`, y con su modelo comercial corregido el 04/09/2026):** zonas
  de reparto, tarifas, algoritmo de cálculo, panel administrativo y catálogo geográfico
  INE. Añade 5 tablas nuevas (`geo_departamentos`, `geo_municipios`, `shipping_zones`,
  `shipping_zone_areas`, `shipping_rates`) y 2 columnas en `user_addresses`
  (`departamento_codigo` y `municipio_codigo`).
  **Su interpretación comercial quedó derogada**: ver «El modelo operativo de envíos» más
  abajo. La infraestructura geográfica, la seguridad y la auditoría siguen vigentes; las
  tarifas por zona y tramo, no. El catálogo geográfico vive en `db/datos/geografia-gt.json`
  (22 departamentos y 340 municipios extraídos del INE, ENEIC 2024-2025).
  SHA-256 del JSON: `33297eebe05a155b3e63f0fac15d21a1306a0257b8b7b3f2149f08ce926a7e66`.
  SHA-256 del PDF fuente: `1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e`.
  Ramas Neon creadas para 9A (no borrar hasta que la rama se integre en `main`):
  `envios-tarifas-dev` (solo esquema) y `envios-tarifas-e2e` (migraciones 012-014 aplicadas).
- **9B (pendiente):** envíos operativos y seguimiento de pedidos.


**El subproyecto 1 está terminado y desplegado**; su estado preciso está en §0.4 y en
`docs/superpowers/plans/2026-08-30-fundamentos-backend.md`. Se cerraron sus doce tareas,
se fusionó en `main`, se preparó Neon de producción y se publicó con autorización expresa
el 01/09/2026. Vercel marcó el despliegue como `Ready` y `Current`, y las rutas críticas se
comprobaron directamente. El **subproyecto 2, identidad de clientes**, está implementado, verificado y
**fusionado en `main` por avance rápido el 02/09/2026**. No se ha publicado ni desplegado
en Production: `main` va por delante de `origin/main` y empujarlo dispararía el despliegue.
Solo se creó un Preview para verificar el empaquetado y `/cuenta`.

**La identidad federada dejó de ser el bloqueo el 01/09/2026.** Está montada sobre
`econoluz-dev-d30ab` y demostrada: la prueba positiva pasó los tres puntos y la negativa
devolvió `unauthorized_client: The given credential is rejected by the attribute
condition` al estrechar la condición a `preview`. La cuenta de servicio tiene un rol
personalizado de cuatro permisos y ninguno predefinido. Diseño y evidencia en
`docs/superpowers/specs/2026-09-01-vercel-firebase-wif-design.md`.

**El bloqueo de empaquetado también quedó resuelto el 01/09/2026.**
`transpilePackages: ["firebase-admin"]` evita la excepción automática de Next 16.3.1,
que trata `firebase-admin` como paquete externo. El build local dejó de trazar
`firebase-admin`, `jwks-rsa` y `jose@6` como dependencias externas; el build remoto del
único Preview terminó y `/cuenta` devolvió `307` a `/cuenta/entrar`, con una ejecución
de nivel `info` y sin `ERR_REQUIRE_ESM`. `jose` v5 quedó como plan B y no se usó.

**Una pieza sigue construida y probada pero sin consumidor** (02/09/2026), y no debe darse
por activa: **los consentimientos**. La tabla `user_consents`, la migración y
`app/identidad/consentimientos*.ts` existen y están probados, pero **ninguna pantalla ni
ruta los llama**: hoy no se registra ni un consentimiento. **Engancharlos está bloqueado
por una decisión de negocio** —aprobar los textos legales y sus versiones—, no por trabajo
técnico: no tiene sentido registrar la aceptación de un texto que aún no existe.

La renovación de la sesión sí quedó conectada el 02/09/2026, junto con la revocación en
Firebase al cerrar sesión y los mensajes de error del formulario de direcciones.
**El subproyecto 3, catálogo relacional, tiene terminada la Fase B** (02/09/2026) en la
rama `feat/catalogo-relacional`. El diseño aprobado es
`docs/superpowers/specs/2026-09-02-nucleo-productos-tienda-design.md` y el plan ejecutado,
`docs/superpowers/plans/2026-09-02-catalogo-relacional-fase-b.md`.

La migración `010` crea **ocho tablas** —`category_attributes` no existe— y fue validada
dos veces en PostgreSQL 16.11 desechable, con 30 comprobaciones reales y creación de
`btree_gist` por un rol no superusuario con permiso `CREATE`. En Neon se aplicaron `009` y
`010` únicamente a la rama de desarrollo `catalogo-relacional-fase-b`
(`br-quiet-hat-avozt905`, endpoint `ep-green-union-avi3x99e`), hija de Production `main`
(`br-flat-dew-avc2njed`, endpoint `ep-misty-sun-avmcbgly`). Production no se tocó.

La importación conserva los campos originales en `technical_specs` y normaliza solo las
siete claves autorizadas. La simulación aceptó los 313 productos, sin rechazos; la primera
ejecución escribió 313 productos privados, 36 categorías, 313 relaciones de categoría,
327 imágenes, 7 atributos, 0 opciones, 45 valores y 25 precios. La segunda modificó 0 y
omitió los 313: el hash de contenido permaneció en
`a21ad178a5fb7ad2aea072a2fe1adbe9`.

El contrato de escritura es atómico, cierra el precio normal anterior antes de insertar el
nuevo, conserva opciones desactivadas ya existentes pero rechaza asignaciones nuevas y
mantiene la proyección pública saneada. `supplier_code` se puede buscar desde el contrato
privado y la verificación campo a campo confirma que nunca aparece en `public_products`.
El rol público no puede leer ninguna de las ocho tablas nuevas y sí puede leer la
proyección.

**La Fase C se ejecutó el 02/09/2026 y alcanzó paridad.** El modo `shadow` está
implementado y comprobado contra Neon y contra un Preview real, ya borrado: el visitante
recibió siempre el resultado `legacy`. La comparación de los 313 productos arrojó
**128 diferencias, todas de una sola causa** —los 64 productos con galería repetían su
foto principal como primera miniatura— y **el dueño autorizó limpiar el dato antiguo**.
Quitada esa repetición en la rama de desarrollo, la comparación quedó en **0 diferencias**.
La corrección es reversible desde `docs/respaldos/`; el detalle está en
`docs/CONTINUAR-PANEL.md`.

**La limpieza está aplicada en los tres sitios donde vivía el dato**, con autorización
expresa: la rama de desarrollo, **la rama de Producción** y `app/data/products.ts`. Lo
último no era opcional: `images` está en `CATALOG_COLUMNS`, así que un `catalogo:importar`
habría deshecho la limpieza en silencio. En Producción se reconstruyó además la proyección
pública, que no se mantiene sola, tras comprobar que solo cambiaban esas 64 galerías.

**Los comandos que reescriben el catálogo entero simulan por defecto** desde el
endurecimiento previo a la Fase D: `catalogo:importar` y `catalogo:reproyectar` no escriben
sin `-- --aplicar`, van en transacción y revierten si el conteo no cuadra. Antes escribían
por el mero hecho de ejecutarlos y sobre cualquier base.

**Producción se escribe por un camino aparte, no relajando el guardián.**
Escribir en Producción exige **tres** llaves a la vez: estar conectado a su endpoint,
`PERMITIR_ESCRITURA_PRODUCCION=true` y la palabra literal en `CONFIRMAR_PRODUCCION`. La
decisión vive en `scripts/guarda-neon.mjs` y la comparten los tres comandos que pueden
escribir. La vuelta atrás usa el mismo camino y los respaldos de `docs/respaldos/`.

**El lector público está preparado, pero no activado.** `relational_v2` ya tiene un
camino cacheado que usa exclusivamente `DATABASE_URL_PUBLIC`, hace una sola consulta a
`public_products` con orden determinista y valida/traduce las filas a `PublicProduct`
antes de cachearlas. Comparte la etiqueta `catalogo` y la caducidad de una hora con
`legacy`; un rollback no invalida. El lector privado de seis consultas se conserva para
administración, importación y `shadow`, y `supplier_code` sigue siendo exclusivamente
privado. Preparar estas piezas no autoriza la Fase D ni cambia la fuente servida.

**La segunda llave, `FASE_D_AUTORIZADA`, está abierta desde el 02/09/2026.** Se lee de la
variable de entorno del mismo nombre y **solo la cadena exacta `"true"` la abre**; en
Vercel vale `"true"` únicamente en Production. Mientras valió `"false"`, poner
`modelo_catalogo` en `relational_v2` no activaba nada. La vuelta atrás **no depende de esa
llave**: la bandera en `legacy` basta, sin desplegar.

### La Fase D está ejecutada: Producción sirve `relational_v2` (02/09/2026)

`modelo_catalogo` vale **`relational_v2` en Producción**. El catálogo público se lee de
`public_products` a través del rol `econoluz_publico` con `DATABASE_URL_PUBLIC`, en una
sola consulta cacheada con la etiqueta `catalogo` y una hora de caducidad. En Neon
Producción se aplicaron las migraciones `009` y `010` y se importaron los 313 productos de
forma idempotente: la segunda importación dio 0 modificados y 313 omitidos con la misma
huella. La comparación completa contra el modelo antiguo da **0 diferencias** en los 313
productos, antes y después de activar.

**El modelo antiguo sigue completo y la reversión está probada.** No se borró ninguna
tabla, columna ni dato, y `legacy` vuelve con una sola orden, sin desplegar:

```bash
PERMITIR_ESCRITURA_PRODUCCION=true CONFIRMAR_PRODUCCION=modelo-catalogo-en-produccion npm run catalogo:relacional:modelo -- --poner legacy --produccion
```

La rama `feat/catalogo-relacional` se fusionó en `main` por avance rápido y se publicó;
la rama y el worktree se conservan. Ese push publicó además el subproyecto 2, identidad de
clientes, que **viaja apagado**: ninguna navegación enlaza `/cuenta` y sus variables de
Firebase siguen sin configurar en Production a petición del dueño.

Toda la evidencia —conteos, registros reales de `shadow`, la prueba de que el camino
relacional depende del rol público, las variables de Vercel y las baterías— está en
`docs/CONTINUAR-PANEL.md`, sección «Fase D ejecutada».

**La retirada del modelo antiguo es el subproyecto 11 y no ha empezado.** Es justo lo que
hoy hace posible la reversión, así que no se toca sin autorización expresa del dueño.

### El modelo operativo de envíos corrige a 9A (04/09/2026)

Implementado en `feat/envios-operativos`, **sin fusionar, sin publicar y sin desplegar**.
El diseño aprobado es
`docs/superpowers/specs/2026-09-04-envios-checkout-operativo-design.md` y el plan
ejecutado, `docs/superpowers/plans/2026-09-04-correccion-envios-operativos.md`.

**La regla de negocio real, que 9A no reflejaba.** ECONOLUZ reparte con **mensajero
propio solo dentro del municipio de Guatemala**, y allí quien decide es la zona de la
ciudad. Todo lo demás va con **Guatex**, cuyo coste depende del peso del pedido y **la
web no lo conoce**.

- Mensajero propio: **Q35,00** de tarifa fija, y **envío gratis a partir de Q2.500,00
  inclusive** de subtotal de productos. Los dos importes son editables desde
  `/admin/envios`, se guardan en `app_settings` y se auditan en `audit_log`.
- Guatex: **coste desconocido**, que se escribe `envioCents: null` y **nunca cero**. Cero
  significaría que el envío es gratis, y sería una promesa que no podemos cumplir.
- Las **22 zonas** de la ciudad son 1 a 19, 21, 24 y 25. Las zonas 20, 22 y 23 no existen
  y se rechazan en el dominio, en el formulario, en el panel y en la base de datos.
- Las zonas **6, 17 y 18 nacen atendidas por Guatex**; las otras 19, por mensajero propio.
  El panel permite cambiar cualquiera en los dos sentidos, con un desplegable cerrado.

**Lo que se retiró de 9A, y lo que se conservó.** Desaparecen las tarifas por tramos, los
plazos de entrega del contrato de envío, el formulario de creación de zonas de reparto y
la ficha `/admin/envios/[zona]`, que ahora redirige a la portada. **Las tablas
`shipping_zones`, `shipping_zone_areas` y `shipping_rates` no se tocan**: se conservan
intactas y vacías, sin consumidores, para auditoría histórica y recuperación. Retirarlas
necesitaría autorización expresa.

**La migración `015_direccion_zona_capitalina.sql`** añade `user_addresses.zona_capitalina`
con dominio cerrado a las 22 zonas, impide que exista zona si el destino no es el
municipio de Guatemala —una dirección de Mixco con «zona 4» sería la zona de otra ciudad—
y siembra las dos claves de configuración en `app_settings`. La columna **admite NULL a
propósito**: las direcciones que ya existen no tienen zona y no se pueden invalidar hacia
atrás. Que sea obligatoria al dar de alta una dirección capitalina lo impone la
aplicación, en `validarDireccion`.

**Está aplicada únicamente en la rama de Neon `envios-operativos-dev`**
(`br-bitter-resonance-avf0rrgg`, endpoint `ep-crimson-bonus-av5c0mvh`), hija de Producción
y sellada con su marcador `rama_neon`. **Producción no recibió ninguna escritura.**

**Las pruebas E2E de clientes se autentican de verdad.** No hay cookie fabricada: se pide
un ID token al emulador de Firebase Authentication y se canjea por
`POST /api/clientes/sesion`, la misma frontera que usa el navegador. Si falta el emulador
o cualquiera de sus variables, la suite falla de forma explícita en lugar de degradar a
un atajo. Cómo levantarlo está en `docs/OPERACION-FIREBASE.md` §6.

**La suite de Playwright son 83 pruebas en 11 archivos.** `tests/admin-envios.spec.ts`
está fuera de `testMatch` a propósito y **no se ejecuta**: probaba el panel de zonas de
reparto y tarifas de 9A, retirado aquí. Se conserva en disco solo como evidencia
histórica —borrarla necesita autorización— y **no cuenta como cobertura vigente**. La
sustituye `tests/envios-operativos.spec.ts`.

**Lo que este subproyecto NO hace**, y conviene no darlo por hecho: no existe todavía el
checkout, ni la tabla `orders`, ni la pantalla de confirmación, ni el panel de pedidos.
Eso es el plan B —`docs/superpowers/plans/2026-09-04-checkout-solicitudes-guatex.md`—,
que está escrito y registrado pero **sin implementar**, porque depende del resultado de
este.

### El subproyecto 5, carrito persistente, está en su rama (03/09/2026)

Implementado y verificado en `feat/carrito-persistente`, **sin fusionar, sin publicar y sin
desplegar**. Producción no recibió ninguna escritura.

El carrito del visitante anónimo **no cambia**: sigue viviendo solo en `localStorage`. Lo
nuevo es que el del cliente con sesión vive en Neon y sobrevive al dispositivo. La migración
`011` crea **dos tablas y ni una más** —`carts` y `cart_items`—, que guardan qué y cuánto:
ni precios, ni nombres, ni imágenes, ni datos del proveedor, ni existencias. El rol público
las tiene denegadas de forma explícita.

Al iniciar sesión el servidor bloquea el carrito, suma, recorta a 999, descarta lo que ya no
se puede comprar y confirma en una transacción; el carrito anónimo se borra **solo después**
del éxito, y repetir la fusión con el mismo token no vuelve a sumar. Se comprobó contra una
base de verdad, incluidas dos fusiones concurrentes y la reversión completa.

**Un detalle que conviene no deshacer:** el enganche con la sesión es **cliente**, no
servidor. Leer la cookie en el layout raíz volvería dinámicas las páginas que hoy se
prerrenderizan y perderíamos la caché del catálogo.

Queda **pendiente de decisión del dueño** un fallo de `catalog-production-boundary.spec.ts`
que **no es de este subproyecto**: aparece cuando el catálogo lo sirve `relational_v2` y
desaparece con `legacy`. No es una fuga —`catalogo:auditar` sigue dando 0 coincidencias—,
sino que la exención de colisiones aprobadas de esa prueba se construye desde
`app/data/products.ts` y no encaja con la carga que sale de `public_products`. El detalle
está en `docs/CONTINUAR-PANEL.md`.

**En paralelo, y sin código de por medio:** contratar la pasarela de pago y el
certificador FEL, redactar los textos legales de venta en línea y —lo más lento— fijar
los precios (hoy 25 de 313).

**La cotización no se retira en ningún momento.**
