# Diseño correctivo de envíos y cierre de compra

**Fecha:** 04/09/2026

**Estado:** aprobado por el dueño

**Ámbito:** corrección del modelo de negocio de envíos de 9A y frontera con el
subproyecto 6 (checkout y pedidos)

## 1. Propósito y precedencia

Este documento corrige la interpretación comercial de
`2026-09-03-envios-tarifas-design.md`. La infraestructura geográfica, la seguridad, la
auditoría y los invariantes de 9A siguen vigentes, pero dejan de ser válidas estas ideas:

- configurar tarifas fijas de Guatex por departamento o municipio;
- considerar cada departamento como una cobertura comercial editable;
- pedir al administrador que introduzca el importe exacto del envío para devolver al
  cliente al pago web;
- abrir WhatsApp en el dispositivo del cliente al terminar una solicitud de pedido.

En caso de contradicción, este documento prevalece para el cálculo del envío, la
configuración administrativa y el cierre de compra. Las tablas existentes no se borran ni
se transforman de forma destructiva como parte de esta corrección. Mientras no exista una
migración de retirada autorizada, se conservan para permitir recuperación y auditoría.

## 2. Reglas de negocio definitivas

### 2.1 Mensajero propio

El mensajero propio solo presta servicio dentro del **municipio de Guatemala**, según la
zona capitalina seleccionada por el cliente.

- Pedido con subtotal inferior a **Q2.500,00**: envío de **Q35,00**.
- Pedido con subtotal igual o superior a **Q2.500,00**: envío gratuito.
- El importe se calcula en centavos enteros y siempre con precios resueltos en el
  servidor.
- Estos pedidos continúan dentro del checkout y se pagan digitalmente desde la web o las
  futuras aplicaciones.

La comparación del umbral es inclusiva: Q2.499,99 paga Q35,00 y Q2.500,00 no paga envío.

### 2.2 Zonas capitalinas atendidas por Guatex

Las zonas **6, 17 y 18** del municipio de Guatemala no tienen mensajero propio y se
derivan a Guatex desde la configuración inicial.

El panel permitirá cambiar en el futuro cualquier zona capitalina de `mensajero_propio` a
`guatex`, y también devolverla a `mensajero_propio` si la cobertura real vuelve. La
selección será un desplegable cerrado; el administrador no escribirá nombres, códigos ni
métodos a mano.

Las zonas admitidas son **1 a 19, 21, 24 y 25**. No se ofrecerán 20, 22 ni 23. El cliente
no tendrá una opción «No sé mi zona»: cuando el municipio sea Guatemala, elegir una zona
válida será obligatorio.

### 2.3 Resto de Guatemala

Cualquier destino fuera del municipio de Guatemala se deriva automáticamente a Guatex.
El departamento y el municipio siguen siendo necesarios para:

- validar y normalizar la dirección del cliente;
- identificar el destino de la solicitud;
- entregar a ECONOLUZ la información necesaria para consultar el coste real;
- evitar errores de escritura mediante listas desplegables encadenadas.

No sirven para asignar una tarifa fija ni para mantener una lista de cobertura de Guatex.

### 2.4 Guatex

El coste de Guatex depende del pedido y de su peso. ECONOLUZ no dispone de una tarifa fija
fiable para calcularlo por departamento, por lo que la web:

- no estima el coste;
- no promete gratuidad;
- no permite pagarlo en línea;
- no solicita a un administrador que introduzca un importe para reanudar el checkout.

El pedido pasa a una solicitud pendiente de contacto y la compra se finaliza directamente
entre ECONOLUZ y el cliente por WhatsApp.

### 2.5 Recogida en tienda

La recogida en tienda permanece apagada y fuera de este flujo. No se presenta al cliente
ni se utiliza como alternativa automática cuando un destino corresponde a Guatex.

## 3. Flujo del cliente

### 3.1 Dirección

El checkout solicitará mediante controles estructurados:

1. departamento, en un desplegable;
2. municipio, en un desplegable filtrado por el departamento;
3. zona capitalina, en un desplegable obligatorio únicamente cuando el municipio sea
   Guatemala;
4. dirección detallada y referencias, como texto libre;
5. datos de contacto necesarios para continuar la compra.

Los datos estructurados se validan de nuevo en el servidor. La aplicación nunca confía en
el método de envío, el subtotal ni el coste enviados por el navegador.

### 3.2 Decisión de ruta

El servidor resuelve una de estas dos salidas:

| Destino | Método | Siguiente paso |
|---|---|---|
| Municipio de Guatemala y zona configurada como mensajero propio | `mensajero_propio` | calcular Q35,00 o gratuidad y continuar al pago digital |
| Municipio de Guatemala y zona configurada como Guatex | `guatex` | guardar solicitud y mostrar confirmación |
| Cualquier otro municipio | `guatex` | guardar solicitud y mostrar confirmación |

La misma función de dominio será consumida por la web y por las futuras aplicaciones para
que no existan diferencias de cobertura ni de precio entre clientes.

### 3.3 Solicitud de Guatex

El cliente completa el carrito y sus datos y pulsa **«Solicitar pedido»**. El servidor:

1. vuelve a resolver productos, cantidades y precios;
2. valida la dirección y determina que corresponde a Guatex;
3. guarda la solicitud, sus líneas, el subtotal y una instantánea de la dirección;
4. genera una referencia pública no secuencial;
5. confirma la escritura antes de responder;
6. registra una notificación para el equipo de ECONOLUZ.

Solo después de guardar correctamente se muestra:

> **¡Solicitud recibida!**
>
> Hemos recibido tu pedido **#EC-1234**. Nos pondremos en contacto contigo por WhatsApp
> para finalizar la compra.

`#EC-1234` representa la referencia real de cada solicitud. La pantalla no abre WhatsApp,
no cambia de aplicación y no obliga al cliente a enviar ningún mensaje.

### 3.4 Atención por ECONOLUZ

La solicitud aparece en el panel administrativo y genera un aviso por correo. Desde su
ficha, un empleado puede pulsar **«Contactar por WhatsApp»**; ese enlace se abre en el
dispositivo del equipo de ECONOLUZ, con el número del cliente y un mensaje que incluye la
referencia del pedido.

La web no puede fabricar un mensaje entrante como si lo hubiera escrito el cliente. Una
integración posterior con WhatsApp Business Platform podrá enviar al cliente una plantilla
de confirmación aprobada, pero no forma parte de esta primera versión y no condiciona que
la solicitud quede registrada.

## 4. Panel administrativo de envíos

La portada de envíos se simplificará para representar únicamente decisiones reales:

- tarifa global del mensajero propio: Q35,00;
- umbral global de gratuidad: Q2.500,00;
- tabla de las 22 zonas capitalinas;
- desplegable por zona con `Mensajero propio` y `Guatex`;
- estado de la recogida en tienda, desactivado.

No se mostrarán formularios para crear zonas comerciales, asignar departamentos, publicar
tarifas de Guatex, definir límites por peso o escribir códigos geográficos. Los nombres de
departamento, municipio y zona siempre procederán de catálogos y se elegirán mediante
desplegables o controles equivalentes.

Toda modificación administrativa continuará protegida por sesión, permiso explícito,
validación de origen, transacción y `audit_log`. El cambio de método de una zona surtirá
efecto para solicitudes nuevas; nunca reescribirá pedidos anteriores.

## 5. Pedidos, estados y pago

El subproyecto 6 persistirá tanto pedidos que continúan a pago como solicitudes que
requieren contacto. Como mínimo debe poder distinguir:

- **pendiente de pago:** mensajero propio calculado y pedido preparado para una pasarela;
- **pendiente de contacto:** destino Guatex, sin importe de envío ni intento de cobro;
- **contactado:** ECONOLUZ inició la atención por WhatsApp;
- **cerrado o cancelado:** resultado final de la gestión manual.

La elección de la pasarela y el cobro efectivo siguen perteneciendo al subproyecto 7. El
checkout y los pedidos pueden construirse antes, dejando la transición al proveedor de
pago detrás de una interfaz explícita. No se simulará un pago ni se marcará un pedido
como pagado sin confirmación verificable de la pasarela.

El coste de envío de una solicitud Guatex será nulo como dato desconocido, no cero: cero
significaría erróneamente que el envío es gratuito.

## 6. Fiabilidad, privacidad y errores

- Si guardar la solicitud falla, no se muestra la confirmación; se conserva el carrito y
  se ofrece reintentar.
- Si el correo o el aviso administrativo falla después de guardar, la solicitud sigue
  siendo válida y recuperable desde el panel. El fallo se registra sin datos personales y
  se reintenta de forma idempotente.
- Repetir el envío del formulario con la misma clave idempotente no crea dos solicitudes.
- El navegador nunca proporciona precios confiables, estados administrativos ni el método
  de envío definitivo.
- Los registros técnicos no contienen nombre, teléfono, dirección ni contenido del
  carrito. La información personal solo vive en las tablas protegidas del pedido.
- El rol público no puede leer pedidos, direcciones ni notificaciones.
- Un fallo de la base de datos o del catálogo no se convierte en «Guatex» ni en un importe
  estimado; el checkout informa de indisponibilidad temporal.

## 7. Transición desde 9A

La transición será aditiva y reversible:

1. Mantener `geo_departamentos` y `geo_municipios` como catálogo oficial.
2. Añadir la representación estructurada de la zona capitalina a las direcciones e
   instantáneas de pedido.
3. Introducir la configuración global del mensajero propio y el método por zona.
4. Cambiar el motor de envíos para resolver únicamente `mensajero_propio` o `guatex`.
5. Sustituir la interfaz administrativa antigua por la simplificada.
6. Dejar sin consumidores nuevos `shipping_zone_areas` y `shipping_rates`.
7. Conservar esas tablas hasta que una retirada destructiva tenga diseño, respaldo y
   autorización expresa del dueño.

Las tres tablas de configuración de 9A están vacías en Producción en el momento de este
diseño, por lo que la corrección no necesita convertir tarifas ni coberturas existentes.

## 8. Pruebas y criterios de aceptación

### 8.1 Dominio

- Q2.499,99 en mensajero propio produce Q35,00.
- Q2.500,00 y más en mensajero propio produce envío gratuito.
- Zonas 6, 17 y 18 empiezan en Guatex.
- Las demás zonas admitidas empiezan en mensajero propio.
- Cambiar cualquier zona a Guatex altera solicitudes nuevas.
- Fuera del municipio de Guatemala siempre se elige Guatex.
- Un método inventado por el navegador se ignora.
- Guatex devuelve coste desconocido, nunca Q0.

### 8.2 Formularios y panel

- Municipio depende del departamento y no se puede escribir libremente.
- Zona capitalina aparece y es obligatoria solo para el municipio de Guatemala.
- Solo aparecen las 22 zonas admitidas.
- El panel usa un desplegable cerrado para el método de cada zona.
- No existe una interfaz pública o administrativa para asignar tarifas fijas a Guatex.

### 8.3 Persistencia e integración

- La solicitud se guarda antes de mostrar el mensaje aprobado.
- Un reintento idempotente conserva una sola solicitud.
- La instantánea mantiene la dirección original aunque el cliente la edite después.
- Un fallo de notificación no borra ni duplica el pedido.
- Los permisos impiden al rol público leer todas las tablas nuevas.
- La auditoría registra cambios administrativos sin registrar actividad geográfica de
  clientes en los logs.

### 8.4 Recorridos de navegador

- Pedido local inferior al umbral continúa a pago con Q35,00.
- Pedido local en el umbral continúa a pago con envío gratuito.
- Zona 6, 17 o 18 guarda la solicitud y muestra el mensaje exacto sin abrir WhatsApp.
- Un municipio del interior sigue el mismo cierre por solicitud.
- El pedido aparece en el panel y el botón de contacto abre WhatsApp únicamente para el
  empleado.
- Un fallo al guardar conserva el carrito y permite reintentar.

## 9. Fuera de alcance

- Integración técnica con Guatex o consulta automática de sus tarifas.
- Cálculo por peso, dimensiones o número de bultos.
- Pago en línea de pedidos enviados por Guatex.
- Contratación e integración de la pasarela de pago.
- Facturación FEL.
- Automatización con WhatsApp Business Platform.
- Seguimiento del paquete y eventos del transportista, que pertenecen a 9B.
- Borrado de tablas, ramas, worktrees o datos existentes.
- Push, despliegue o escritura en Producción.

## 10. Resumen de la decisión

El catálogo geográfico sirve para capturar bien el destino, no para fingir que ECONOLUZ
conoce el precio de Guatex. El mensajero propio tiene una regla única y transparente; lo
que no cubre pasa a una solicitud guardada que el equipo termina por WhatsApp. La tienda
no pierde el carrito, no abre aplicaciones en el teléfono del cliente y nunca cobra un
envío cuyo importe todavía desconoce.
