# Procedencia del catálogo geográfico

Fuente primaria: Instituto Nacional de Estadística de Guatemala (INE),
ENEIC 2024-2025, boleta larga, tabla «Lista de códigos de los municipios de la
República de Guatemala», página 7.

- **URL de descarga:** `https://www.ine.gob.gt/wp-content/uploads/2025/06/BOLETA-ENEIC_LARGA.pdf`
- **SHA-256 del PDF:** `1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e`
- **SHA-256 de `db/datos/geografia-gt.json`:** `33297eebe05a155b3e63f0fac15d21a1306a0257b8b7b3f2149f08ce926a7e66`

**Validación del universo y del formato:** *Metodología de actualización del
Directorio Nacional Estadístico de Empresas (DINESE)*, INE, diciembre de 2023
(`https://www.ine.gob.gt/wp-content/uploads/2023/12/METODOLOGIA-DE-ACTUALIZACION-DINESE.pdf`,
SHA-256 `09821d80a446ed0387d15654d4915e6fb7d44a80f33a9ba657a972b1a724dcf2`), §2.4,
página 7 del documento: confirma el **conteo** — 22 departamentos, 340
municipios, códigos departamentales de dos dígitos numerados del 01 al 22 —
pero **no enumera los 22 pares nombre↔código**. Se descargó y se revisó
entero (25 páginas) para comprobarlo antes de escribir esta nota.

**Limitación declarada sobre los 22 nombres de departamento.** No aparecen en
la tabla del PDF (esa tabla solo lista municipios) ni en el DINESE citado
arriba, que solo confirma el conteo. Tampoco viene de un catálogo distinto
citado con huella: `Baja Verapaz`, `Alta Verapaz`, `Petén` e `Izabal` no
aparecen ni una sola vez en todo el PDF de la boleta, y los otros 18 solo
aparecen ahí como nombre de un *municipio* que coincide con el nombre de su
departamento (p. ej. `0101 Guatemala`), no como rótulo de departamento. Los
22 nombres usados en `NOMBRES_DEPARTAMENTOS`
(`scripts/preparar-geografia.mjs`) son la división administrativa oficial de
Guatemala, verificable públicamente por cualquiera que conozca la geografía
del país, pero **no quedan fijados por huella en este repositorio**: es el
único dato del catálogo cuya procedencia no se puede auditar solo con lo que
hay aquí dentro. Si en el futuro aparece una fuente oficial que enumere estos
22 pares con su propia huella verificable, esta nota debe sustituirse por esa
cita y no al revés.

Generado por `scripts/preparar-geografia.mjs`, que no escribe nada si el
conteo final no es exactamente 22 departamentos y 340 municipios.

## Cómo se extrajo

1. El PDF trae la tabla como texto seleccionable (no es una imagen escaneada):
   se infla cada `stream … endstream` con `zlib.inflateSync` hasta encontrar
   el único que contiene la cadena `Amatitl` (de «Amatitlán»).
2. Ese stream mezcla dos tipos de letra: uno simple (texto entre paréntesis,
   codificación Latin-1/WinAnsi con escapes octales para acentos) y uno
   Type0/Identity-H (texto en hexadecimal, 2 bytes por glifo) para algunos
   nombres. El segundo necesita la tabla `CID -> Unicode` que el propio PDF
   trae en el stream `ToUnicode` de esa fuente; sin decodificarla, esos
   nombres salían vacíos o en códigos de glifo sin sentido.
3. Se reconstruye la posición `(x, y)` de cada fragmento de texto siguiendo
   los operadores `Tm`, `Td`/`TD`, `Tj` y `TJ`. `Td`/`TD` no es un simple
   `x += tx`: la nueva posición es `tx·a + ty·c + x` (y lo mismo para `y` con
   `b`, `d`), porque el desplazamiento se compone con la escala de la matriz
   de texto vigente, que en esta boleta es 5 o 6. Tratarlo como suma directa
   deja la posición equivocada por ese mismo factor, y es exactamente lo que
   le pasaba a los seis rótulos «PAÍSES DE …» del documento.
4. Cada código de municipio (`/^\d{3,4}$/` con valor `< 3000`) se empareja
   con el nombre a su derecha y algo más abajo: `dx = nombre.x - código.x` en
   `[-30, 110]`, `dy = código.y - nombre.y` en `[-10, 30]`. El emparejado es
   una asignación global (todas las parejas candidatas dentro de tolerancia,
   ordenadas por puntaje `dy·2 + |dx|` y confirmadas de mejor a peor sin
   repetir ni código ni nombre), no un recorrido código a código: recorrerlos
   uno a uno depende del orden de lectura del PDF y un código sin pareja
   libre todavía puede robarle por error el nombre a su vecino, encadenando
   el fallo fila tras fila.
5. Los rótulos en MAYÚSCULAS (los países — `CUBA`, `HAITÍ` — y los
   encabezados de continente — `PAÍSES DE AMÉRICA`) se descartan del
   conjunto de nombres antes de emparejar: ningún nombre de municipio real
   está en mayúsculas, y dejarlos competir podía ganarle el emparejado a la
   pareja real por estar en la misma columna. Es justo lo que le pasaba al
   código `2217` (ver más abajo).
6. Los códigos de tres cifras se completan con un cero inicial y el
   departamento sale de sus dos primeros dígitos.

Con este algoritmo la extracción automática resolvió los 340 códigos y sus
340 nombres sin dejar ningún hueco. Solo dos casos necesitan una corrección
puntual declarada (no una relajación de las tolerancias, que movería otros
emparejamientos ya correctos): ver la tabla de abajo.

**Verificación independiente:** el resultado se contrastó contra la
extracción de `pdftotext -raw` (Poppler/xpdf), una herramienta ajena a este
script y que decodifica el PDF con su propio motor. Los 340 códigos
coincidieron exactamente, incluida `0923 -> La Esperanza`, salvo la errata
tipográfica de `1330` que esta misma tabla documenta como corregida.

## Correcciones aplicadas

| Código | Como aparece en el PDF | Como se almacena | Motivo |
|---|---|---|---|
| 1330 | Santiago Chimaltenanango | Santiago Chimaltenango | Errata tipográfica del documento |
| 0923 | La Esperanza | La Esperanza | El texto es correcto y legible en la página 7; falló la extracción automática, no la fuente |

**`0923` es La Esperanza, Quetzaltenango**, entre `0922 Flores Costa Cuca` y
`0924 Palestina de los Altos`. Confirmado contra la página 7: no es una celda
vacía ni un dato inferido — el nombre está en el documento y el motivo real de
la corrección es que la fuente lo trae vía la fuente Type0/Identity-H
(descrita en el paso 2 de arriba), ya decodificada por el extractor. Esta
corrección puntual queda declarada de todas formas, tal como pide el
criterio de aceptación 14: el script avisa cuando una corrección **sí tiene
efecto** (cambia el nombre que salió del emparejado automático) y avisa
también, por separado, cuando una corrección **ya no hace falta** —como le
pasa hoy a `0923`, que el extractor ya resuelve solo—, para que ese cambio de
estado no pase inadvertido y quede claro que se puede retirar de
`CORRECCIONES` si se quiere.

Ninguna corrección adicional hizo falta: la extracción automática, con el
algoritmo de arriba, resolvió los 340 nombres sin huecos.
