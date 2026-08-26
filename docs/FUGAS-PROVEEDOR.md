# Anonimización del proveedor en el catálogo público

**Fecha:** 26/08/2026

**Rama de origen:** `ocultar-proveedores`, fusionada en `main`

**Estado:** implementado, fusionado, desplegado y verificado en producción.

## Decisión del dueño

El visitante no debe poder identificar al fabricante desde el catálogo público. El
personal autorizado sí necesita marca, serie y código para tramitar una cotización o un
pedido. Por tanto, **los datos internos no se borran ni se reescriben**: se anonimizan
únicamente al construir el producto público.

## Qué se ocultó

- Las rutas `/catalogos/artlite/…`, `/catalogos/construlita/…` y
  `/catalogos/highlum/…` dejan de viajar al navegador.
- Los nombres de líneas comerciales se retiran de nombres, descripciones y ficha
  técnica pública.
- `Magnetrack Pro` pasa a **«Microrriel magnético 48 V»**, tanto en la etiqueta visible
  como en el identificador del filtro.
- La auditoría normaliza mayúsculas, tildes, espacios, guiones y guiones bajos, de modo
  que `Magnetrack Pro`, `magnetrackpro` y `magnetrack_pro` no puedan pasar como casos
  distintos.

No se cambian términos técnicos o corrientes que no identifican por sí solos al
fabricante: `Bronce`, `Wallpack`, `Uplight`, `Landscape`, `Slim`, `Bright`,
`Canopy CCT`, `Spotlight COB`, `Module` y `Sombra`.

## Rutas públicas

| Ruta interna conservada | Ruta que recibe el visitante |
|---|---|
| `artlite/` | `electrico/` |
| `highlum/` | `lineal/` |
| `construlita/` | `arquitectonico/` |
| `construlita/magnetrackpro/` | `arquitectonico/microrriel-48v/` |

Se crearon 326 copias neutras —18 MB— y se compararon por SHA-256 con los originales:
0 diferencias. Los originales siguen presentes porque el proyecto prohíbe borrar sin
autorización expresa.

## Cómo funciona

`app/data/publicProductPrivacy.ts` contiene la transformación. `toPublicProduct` la
aplica a rutas, textos, etiquetas y especificaciones antes de construir el objeto que
recibe el navegador. `fromProductRow` normaliza el identificador histórico
`magnetrack_pro` al leer las filas actuales de Neon.

Esto evita una actualización masiva de la base de datos. El panel sigue leyendo los
campos originales `supplier_*` y conserva Artlite, Construlita, Highlum, Magnetrack Pro,
los códigos y los nombres del fabricante.

## Verificación local

```powershell
npm run test:proveedores
npm run catalogo:auditar
npm run catalogo:verificar
```

Resultado de la auditoría: 313 productos, 408 identificadores buscados y 0 presentes en
la proyección pública. La prueba específica confirma también que los datos internos no
han desaparecido.

Verificación completa superada:

- privacidad del proveedor: 3/3 pruebas;
- panel de administración: 134/134 pruebas;
- catálogo público y límites de producción: 99/99 pruebas de Playwright;
- `typecheck`, `lint` y `build`: sin errores.

## Verificación en producción

El 26/08/2026 se fusionó en `main` y Vercel desplegó el cambio con autorización expresa.
La comprobación posterior confirmó:

- respuesta HTTP 200 del catálogo;
- las 326 rutas neutras presentes;
- 0 rutas antiguas enlazadas;
- «Microrriel magnético 48 V» visible;
- 0 identificadores sensibles en el HTML y los recursos públicos revisados.

Solo falta pedir autorización separada antes de borrar las tres carpetas antiguas. Hasta
ese momento ya no están enlazadas, pero una URL antigua conocida seguirá respondiendo.

No hizo falta ejecutar una migración ni actualizar Neon para desplegar este cambio.
