# Anonimización del proveedor en el catálogo público

**Fecha:** 26/08/2026

**Rama:** `ocultar-proveedores`
**Estado:** implementado y verificado en local; sin fusionar ni desplegar.

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

## Qué falta para llevarlo a producción

1. Fusionar y desplegar únicamente con autorización expresa.
2. Comprobar en producción el catálogo, las fichas y las 326 rutas neutras.
3. Confirmar que el HTML y los chunks públicos no contienen identificadores del
   proveedor.
4. Pedir autorización separada antes de borrar las tres carpetas antiguas. Hasta ese
   momento ya no estarán enlazadas, pero una URL antigua conocida seguirá respondiendo.

No hace falta ejecutar una migración ni actualizar Neon para desplegar este cambio.
