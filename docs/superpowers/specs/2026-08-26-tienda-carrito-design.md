# Tienda ECONOLUZ — Pieza A: el carrito

**Fecha:** 2026-08-26
**Estado:** diseño aprobado por el dueño, pendiente de plan de implementación.

## Qué se construye

El cesto de compra del catálogo: añadir productos, cambiar cantidades, ver el
total en quetzales y que todo eso siga ahí al volver al día siguiente.

## Qué NO se construye aquí

No cobra, no pide NIT, no emite factura y no descuenta existencias. El botón
«Ir a pagar» queda visible pero sin destino hasta la pieza siguiente.

Esta separación no es pereza: el cobro depende de contratar una pasarela de
pago, un trámite que puede llevar semanas y que a fecha de hoy ni siquiera ha
empezado. El carrito no depende de esa decisión, así que se construye antes.

## De dónde se parte

El catálogo **ya tiene un cesto**: `app/catalogo/quoteSelection.ts` (el motor),
`useQuoteSelection.ts` (el estado), `quotePersistence.ts` (sessionStorage) y
`QuoteDrawer` (el cajón lateral). Sirve para la cotización de proyectos y
funciona; sus pruebas están en verde y la huella del catálogo está congelada.

Le faltan tres cosas para ser un carrito de compra: dinero, existencias y
permanencia entre visitas.

Estado real de los datos el 2026-08-26, comprobado contra Neon:

| Productos | Con precio | Con existencias | Vendibles en línea |
|-----------|-----------|-----------------|--------------------|
| 313       | 25        | 24              | **0**              |

Mientras esa última columna sea cero, **el carrito no se le verá a nadie**.
Marcar productos como vendibles es trabajo del dueño desde el panel, no del
programador.

## Decisiones del dueño

1. **Un camino por producto.** Si el producto tiene precio y está marcado como
   vendible, su tarjeta enseña «Añadir al carrito». En cualquier otro caso
   enseña el control de cotización de siempre. Nunca los dos a la vez: dos
   botones en la misma tarjeta obligan al cliente a elegir sin saber por qué.
   Quien quiera un proyecto grande sigue teniendo el enlace a `/asesoria`.

2. **Las existencias avisan, no bloquean.** Pedir más unidades de las
   apuntadas muestra «puede tardar unos días» en esa línea, y deja seguir. El
   número del panel se desfasa con facilidad, y un stock desfasado que bloquea
   cuesta ventas reales. Se puede endurecer más adelante sin rehacer nada.

## Arquitectura

### Un motor propio, separado del de cotización

El carrito vive en `app/tienda/` con su propio reductor, gemelo del de
cotización pero con dinero y existencias. **No se toca `quoteSelection.ts`.**

La razón es que los dos flujos divergen desde el primer día: el carrito necesita
precios, subtotales, aviso de plazo y permanencia; la cotización no necesita
nada de eso y no debe cargar con ello. Un solo motor con dos personalidades se
llenaría de condicionales `if (esCarrito)` en cuanto entrara el checkout.
Duplicar unas cien líneas de reductor sale más barato que eso, y deja intacto
código cubierto por pruebas.

Archivos previstos:

- `app/tienda/carrito.ts` — el reductor puro: `añadir`, `quitar`, `fijarCantidad`,
  `vaciar`. Sin React, sin navegador, comprobable con `node:test`.
- `app/tienda/totales.ts` — subtotales y total, en centavos enteros.
- `app/tienda/carritoPersistencia.ts` — leer y escribir en `localStorage`,
  tolerando que el navegador lo tenga bloqueado.
- `app/tienda/useCarrito.ts` — el enganche con React.
- `app/tienda/CarritoDrawer.tsx` — el cajón lateral.

### El precio se calcula en el servidor, siempre

El navegador guarda **solo referencia y cantidad**. Nunca el precio.

Al pintar el carrito y al pagar, los precios se vuelven a leer del catálogo del
servidor. Si el navegador enviara el precio, cualquiera podría editar su propio
`localStorage` y comprar un panel por un quetzal. Esta regla se hereda a las
piezas siguientes: **ningún importe que venga del navegador se acepta como
bueno**.

### Aritmética en centavos

Los totales se calculan en centavos con enteros y se formatean al final con
`formatPrice`. Sumar `12.30 + 4.15` en coma flotante acumula errores que acaban
saliendo en pantalla como un céntimo que no cuadra.

### Datos nuevos que bajan al navegador

`PublicProduct` gana dos campos **opcionales**, igual que se hizo con `priceGtq`:

```ts
stock?: number;
sellableOnline?: boolean;
```

Opcionales y no `null` a propósito: un `null` cambiaría la forma de los 313
productos y la huella congelada del catálogo dejaría de coincidir sin que nada
haya cambiado de verdad. Se pueblan en `toPublicProduct` a través de
`PublicProductExtras`, y la consulta de `catalog.server.ts` añade `stock` y
`sellable_online` a las columnas que ya lee.

Ninguno de los dos revela nada del proveedor, así que la frontera pública
sigue cumpliéndose.

## Lo que ve el cliente

**Tarjeta vendible** (`sellableOnline` y `priceGtq`): precio, y «Añadir al
carrito» con el control de cantidad.

**Cualquier otra tarjeta**: exactamente lo de hoy, sin cambios.

**Cabecera**: un botón de carrito con el número de artículos, que abre el cajón.
Vive en la barra de navegación del sitio, y **solo aparece cuando el carrito
tiene algo dentro**: un carrito vacío permanente en todas las páginas es ruido.

**Cajón del carrito**: cada línea con imagen, nombre, precio unitario, cantidad
editable y subtotal; el aviso «puede tardar unos días» en las líneas que superen
las existencias apuntadas —solo cuando el producto tiene existencias apuntadas:
si la casilla está vacía no se sabe nada del inventario y no se avisa de nada—; el total abajo; y «Ir a pagar», deshabilitado con la
nota de que el pago en línea está en preparación.

**Permanencia**: el carrito se guarda en `localStorage` y sobrevive a cerrar el
navegador. La selección de cotización se queda en `sessionStorage` como está.

## En el panel

La casilla «se vende en línea» se añade al listado de productos, junto a precio
y existencias, editable en la fila. Hoy solo se puede marcar abriendo la ficha
de cada producto: con 25 productos con precio, eso son 25 fichas.

## Errores y casos límite

- **Un producto guardado ya no existe o dejó de ser vendible.** Al restaurar el
  carrito se descarta esa línea en silencio y se avisa en el cajón de que un
  producto ya no está disponible. No se rompe el carrito entero por una línea.
- **El precio cambió desde que se añadió.** Manda el del servidor. El cliente
  ve el precio vigente, no el que vio ayer.
- **`localStorage` inaccesible** (modo privado, navegador con el almacenamiento
  bloqueado). El carrito funciona igual durante la visita y simplemente no
  persiste. Nada revienta: mismo criterio que ya usa `quotePersistence.ts`.
- **Cantidades absurdas.** El reductor rechaza lo que no sea un entero positivo
  y protege el total del desbordamiento, igual que hace hoy el de cotización.
- **La base de datos no responde.** `getPublicCatalog` ya cae al catálogo
  escrito en el código, que no tiene precios: sin precios no hay productos
  vendibles, así que el carrito desaparece y el catálogo sigue funcionando para
  cotizar. Degrada bien, sin página rota.

## Pruebas

**De unidad** (`node:test`, sin navegador): el reductor —añadir, sumar sobre lo
ya añadido, bajar a cero, cantidades inválidas—; los totales en centavos; la
persistencia —serializar, restaurar, descartar líneas caducadas, sobrevivir a
un `localStorage` que lanza excepción—.

**De navegador** (Playwright): añadir un producto vendible, comprobar el total,
recargar la página y comprobar que el carrito sigue ahí; comprobar que una
tarjeta sin precio sigue enseñando el control de cotización y no el carrito;
comprobar que pedir más unidades de las apuntadas muestra el aviso de plazo.

Se trabaja con TDD: prueba en rojo antes que código.

## Lo siguiente

Piezas restantes del paso 2, en orden: **B.** checkout con datos fiscales
(NIT); **C.** cobro, que depende de contratar la pasarela; **D.** factura FEL,
que depende de contratar un certificador; **E.** descuento de existencias.
