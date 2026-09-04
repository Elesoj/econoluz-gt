// Genera db/datos/geografia-gt.json desde la boleta del INE.
// Se niega a escribir si el conteo no es exactamente 22 y 340.
//
// Uso: node ./scripts/preparar-geografia.mjs <ruta-al-pdf>
//
// Sin dependencias nuevas: zlib y crypto de Node bastan para inflar los
// streams del PDF, resolver su tabla de objetos y comprobar su huella.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

const HUELLA_PDF = "1eb2a2e3a718c7132c944a26a83a1d2a317c42e7fc4f3ab4862026950da7ca0e";
const ESPACIO = 180; // por debajo es kerning, por encima es un espacio real

const rutaPdf = process.argv[2];
if (!rutaPdf) {
  console.error(
    "Uso: node ./scripts/preparar-geografia.mjs <ruta-al-pdf>\n" +
      "El PDF no viaja en el repositorio. Se descarga de:\n" +
      "  https://www.ine.gob.gt/wp-content/uploads/2025/06/BOLETA-ENEIC_LARGA.pdf\n" +
      "(o se usa la copia ya verificada en .superpowers/sdd/2026-09-03-envios-tarifas/).",
  );
  process.exit(1);
}

const pdf = readFileSync(rutaPdf);
const huella = createHash("sha256").update(pdf).digest("hex");
if (huella !== HUELLA_PDF) {
  console.error(`Huella del PDF inesperada:\n  esperada ${HUELLA_PDF}\n  obtenida ${huella}`);
  process.exit(1);
}

// --- Utilidades de bajo nivel sobre el PDF ---
//
// El texto de la tabla usa dos tipos de letra a la vez: `TT0` (TrueType
// simple, texto entre paréntesis) y `C2_0` (Type0/Identity-H, texto en
// hexadecimal de 2 bytes por glifo — el «código de carácter», CID, no es el
// carácter Unicode). El propio PDF trae, para cada fuente Type0, un stream
// `ToUnicode` con la tabla CID -> Unicode que hace falta para decodificarlo.
const textoLatin1 = pdf.toString("latin1");

function objetoCrudo(numero) {
  const patron = new RegExp(`(?:^|[^0-9])(${numero}\\s+\\d+\\s+obj)`);
  const m = patron.exec(textoLatin1);
  if (!m) return null;
  const inicio = m.index + m[0].length - m[1].length;
  const fin = textoLatin1.indexOf("endobj", inicio);
  if (fin === -1) return null;
  return { texto: textoLatin1.slice(inicio, fin), buf: pdf.subarray(inicio, fin) };
}

function streamDeObjeto(numero) {
  const o = objetoCrudo(numero);
  if (!o) return null;
  const marcaInicio = Buffer.from("stream");
  const marcaFin = Buffer.from("endstream");
  const si = o.buf.indexOf(marcaInicio);
  if (si === -1) return null;
  let cs = si + marcaInicio.length;
  if (o.buf[cs] === 0x0d) cs++;
  if (o.buf[cs] === 0x0a) cs++;
  const ei = o.buf.indexOf(marcaFin, cs);
  if (ei === -1) return null;
  const crudo = o.buf.subarray(cs, ei);
  try {
    return inflateSync(crudo);
  } catch {
    return crudo; // stream sin comprimir
  }
}

// 1. Inflar los streams. Recorremos `stream … endstream` del PDF y pasamos
// cada uno por inflateSync, ignorando los que fallen (imágenes y streams sin
// comprimir). La tabla vive en el único stream que contiene la cadena "Amatitl"
// (de "Amatitlán", el municipio que aparece en la tabla de códigos).
function localizarStreamDeLaTabla() {
  const marcaObj = /(\d+)\s+\d+\s+obj/g;
  let m;
  while ((m = marcaObj.exec(textoLatin1)) !== null) {
    const numero = Number(m[1]);
    const inflado = streamDeObjeto(numero);
    if (inflado && inflado.toString("latin1").includes("Amatitl")) {
      return { numero, texto: inflado.toString("latin1") };
    }
  }
  throw new Error("No se encontró el stream de la tabla (buscando 'Amatitl').");
}

// Localiza, para la página que contiene el stream dado, el objeto de fuente
// Type0 asignado al nombre de recurso `/C2_0`, y devuelve su tabla CID ->
// Unicode ya resuelta desde su stream `/ToUnicode`.
function resolverMapaCidAUnicodeDeLaPagina(numeroStreamContenido) {
  const marcaObj = /(\d+)\s+\d+\s+obj/g;
  let m;
  let recursos = null;
  while ((m = marcaObj.exec(textoLatin1)) !== null) {
    const numero = Number(m[1]);
    const o = objetoCrudo(numero);
    if (!o) continue;
    if (!o.texto.includes("/Type/Page") || o.texto.includes("/Type/Pages")) continue;
    const refContenido = new RegExp(`/Contents\\s+${numeroStreamContenido}\\s+0\\s+R`);
    if (refContenido.test(o.texto)) {
      recursos = o.texto;
      break;
    }
  }
  if (!recursos) throw new Error("No se encontró la página que referencia el stream de la tabla.");

  const refFuente = /\/C2_0\s+(\d+)\s+0\s+R/.exec(recursos);
  if (!refFuente) {
    // La página no usa la fuente Type0 en absoluto: no hace falta CMap.
    return new Map();
  }
  const fuente = objetoCrudo(Number(refFuente[1]));
  const refToUnicode = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(fuente.texto);
  if (!refToUnicode) return new Map();

  const cmapBuf = streamDeObjeto(Number(refToUnicode[1]));
  const cmapTexto = cmapBuf.toString("latin1");
  return parsearCMapBfchar(cmapTexto);
}

// Un CMap ToUnicode declara pares `<CID> <Unicode>` dentro de bloques
// `beginbfchar … endbfchar` (y, potencialmente, rangos `beginbfrange`, que
// esta boleta no usa). El lado derecho puede traer más de 2 bytes cuando el
// glifo representa una ligadura (p. ej. "fi" -> 0066 0069).
function parsearCMapBfchar(cmapTexto) {
  const mapa = new Map();
  const bloques = cmapTexto.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const bloque of bloques) {
    const patronPar = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let par;
    while ((par = patronPar.exec(bloque)) !== null) {
      const cid = par[1].toUpperCase().padStart(4, "0");
      const destino = par[2];
      let texto = "";
      for (let i = 0; i < destino.length; i += 4) {
        texto += String.fromCharCode(parseInt(destino.slice(i, i + 4), 16));
      }
      mapa.set(cid, texto);
    }
  }
  return mapa;
}

// 2. Reconstruir con coordenadas. Recorremos los operadores Td, TD, Tm, Tj y
// TJ llevando la posición (x, y). Dentro de un array TJ insertamos un espacio
// solo si el ajuste numérico es >= 180 en valor absoluto.
//
// Td/TD no son un simple `x += tx; y += ty`: por definición del PDF, la nueva
// matriz de línea es `[1 0 0 1 tx ty] × Tlm_anterior`, así que el
// desplazamiento (tx, ty) se compone con la escala/rotación de la matriz de
// texto vigente (a, b, c, d), no con los ejes de la página. En esta boleta
// el tamaño de letra (los componentes a y d de Tm) es 5 o 6, así que
// ignorar esa composición deja la posición fuera por un factor de 5-6 y
// hace fallar el emparejado — es justo lo que le pasaba a los seis casos en
// los que el documento usa Td (tras cada rótulo "PAÍSES DE …").
function tokenizarFragmentosDeTexto(contenido, mapaCidAUnicode) {
  const fragmentos = []; // { x, y, texto }
  // Matriz de texto/línea vigente (a b c d e f); (e, f) es la posición.
  let a = 1, b = 0, c = 0, d = 1, x = 0, y = 0;

  const patronOperacion =
    /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(Td|TD)|(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+Tm|\(((?:[^()\\]|\\.)*)\)\s*Tj|<([0-9A-Fa-f\s]*)>\s*Tj|\[((?:[^\]])*)\]\s*TJ/g;

  let match;
  while ((match = patronOperacion.exec(contenido)) !== null) {
    const [, td1, td2, tdOp, tmA, tmB, tmC, tmD, tmE, tmF, tjCadena, tjHex, tjArray] = match;

    if (tdOp === "Td" || tdOp === "TD") {
      // Tlm_nueva.(e,f) = (tx*a + ty*c + e, tx*b + ty*d + f); (a,b,c,d) no cambian.
      const tx = parseFloat(td1);
      const ty = parseFloat(td2);
      const nuevaX = tx * a + ty * c + x;
      const nuevaY = tx * b + ty * d + y;
      x = nuevaX;
      y = nuevaY;
    } else if (tmF !== undefined) {
      // Tm: matriz de texto absoluta `a b c d e f Tm`.
      a = parseFloat(tmA);
      b = parseFloat(tmB);
      c = parseFloat(tmC);
      d = parseFloat(tmD);
      x = parseFloat(tmE);
      y = parseFloat(tmF);
    } else if (tjCadena !== undefined) {
      // Tj con cadena literal entre paréntesis.
      const texto = decodificarCadenaPdf(tjCadena);
      if (texto.trim().length > 0) fragmentos.push({ x, y, texto });
    } else if (tjHex !== undefined) {
      // Tj con cadena hexadecimal (fuente Type0/Identity-H): cada CID son
      // 2 bytes (4 dígitos hex) que hay que resolver contra el CMap.
      const texto = decodificarHexConCMap(tjHex, mapaCidAUnicode);
      if (texto.trim().length > 0) fragmentos.push({ x, y, texto });
    } else if (tjArray !== undefined) {
      // TJ: array de cadenas (literales o hex) y ajustes numéricos.
      const partes = tokenizarArrayTJ(tjArray, mapaCidAUnicode);
      let texto = "";
      for (const parte of partes) {
        if (parte.tipo === "texto") {
          texto += parte.valor;
        } else {
          // Ajuste numérico: negativo en la convención PDF avanza (mueve a la
          // derecha); insertamos espacio solo si supera la tolerancia.
          if (Math.abs(parte.valor) >= ESPACIO) texto += " ";
        }
      }
      if (texto.trim().length > 0) fragmentos.push({ x, y, texto });
    }
  }

  return fragmentos;
}

function tokenizarArrayTJ(cuerpoArray, mapaCidAUnicode) {
  const partes = [];
  const patron = /\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]*)>|(-?\d+\.?\d*)/g;
  let match;
  while ((match = patron.exec(cuerpoArray)) !== null) {
    if (match[1] !== undefined) {
      partes.push({ tipo: "texto", valor: decodificarCadenaPdf(match[1]) });
    } else if (match[2] !== undefined) {
      partes.push({ tipo: "texto", valor: decodificarHexConCMap(match[2], mapaCidAUnicode) });
    } else if (match[3] !== undefined) {
      partes.push({ tipo: "ajuste", valor: parseFloat(match[3]) });
    }
  }
  return partes;
}

function decodificarHexConCMap(hex, mapaCidAUnicode) {
  const limpio = hex.replace(/\s+/g, "");
  let texto = "";
  for (let i = 0; i + 4 <= limpio.length; i += 4) {
    const cid = limpio.slice(i, i + 4).toUpperCase();
    texto += mapaCidAUnicode.get(cid) ?? "";
  }
  return texto;
}

function decodificarCadenaPdf(cadena) {
  return cadena
    // Escapes octales (\NNN): el PDF codifica así los caracteres acentuados
    // fuera del rango ASCII imprimible. El valor decimal resultante coincide
    // con su punto de código Latin-1/WinAnsi, que es el que usa esta tabla.
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

// 3. Separar códigos de nombres. Código es /^\d{3,4}$/ con valor < 3000: los
// >= 3000 son códigos de país que la misma boleta incluye (3030 Cuba,
// 4007 Bélgica, 5008 China) y no son municipios; se descartan sin más, no
// son un nombre de municipio.
//
// La misma tabla imprime, en MAYÚSCULAS, los países y los rótulos de
// continente ("PAÍSES DE AMÉRICA", "CUBA", "OTRO"…) que acompañan a esos
// códigos de país. Ningún nombre de municipio real está en mayúsculas —
// todos van en Type Case ("Quezada", "El Progreso")—, así que un rótulo en
// mayúsculas nunca es la pareja de un código de municipio y se descarta
// aquí: dejarlo en el conjunto de nombres podía ganarle el emparejado a la
// pareja real por estar en la misma columna, un caso concreto que apareció
// en el código 2217 (ver FUENTE.md).
function separarCodigosYNombres(fragmentos) {
  const codigos = [];
  const nombres = [];
  for (const frag of fragmentos) {
    const texto = frag.texto.trim();
    if (/^\d{3,4}$/.test(texto)) {
      if (Number(texto) < 3000) codigos.push({ x: frag.x, y: frag.y, codigo: texto });
    } else if (texto.length > 0) {
      const esRotuloEnMayusculas = texto === texto.toUpperCase() && texto !== texto.toLowerCase();
      if (!esRotuloEnMayusculas) nombres.push({ x: frag.x, y: frag.y, texto });
    }
  }
  return { codigos, nombres };
}

// Completa con un cero inicial los códigos de tres cifras (departamentos 01
// a 09): la boleta los imprime como `101`, `923`, etc., y aquí se guardan
// siempre como `char(4)`.
function normalizarCodigo(codigo) {
  return codigo.length === 3 ? `0${codigo}` : codigo;
}

// 4. Emparejar por columna. El nombre de un código está a su derecha y algo
// más abajo. Tolerancias verificadas: dx = nombre.x - codigo.x en [-30, 110]
// y dy = codigo.y - nombre.y en [-10, 30]; entre los candidatos, gana el de
// menor dy*2 + |dx|.
//
// El emparejado se hace por asignación global, no código a código: se
// listan TODAS las parejas (código, nombre) que caen dentro de tolerancia,
// se ordenan por puntaje ascendente y se van confirmando de mejor a peor,
// saltando cualquiera cuyo código o nombre ya haya quedado asignado. Recorrer
// los códigos uno a uno y quedarse con "el mejor disponible en ese momento"
// depende del orden de lectura del PDF: un código sin su pareja real todavía
// libre puede robarle por error el nombre a otro código vecino, y ese robo
// se encadena fila tras fila. La asignación global es insensible a ese orden.
function emparejarCodigosConNombres(codigos, nombres) {
  const candidatos = [];
  for (let i = 0; i < codigos.length; i++) {
    const cod = codigos[i];
    for (let j = 0; j < nombres.length; j++) {
      const nom = nombres[j];
      const dx = nom.x - cod.x;
      const dy = cod.y - nom.y;
      if (dx < -30 || dx > 110) continue;
      if (dy < -10 || dy > 30) continue;
      candidatos.push({ i, j, puntaje: dy * 2 + Math.abs(dx) });
    }
  }
  candidatos.sort((a, b) => a.puntaje - b.puntaje);

  const nombrePorCodigo = new Array(codigos.length).fill(null);
  const codigosUsados = new Set();
  const nombresUsados = new Set();
  for (const { i, j } of candidatos) {
    if (codigosUsados.has(i) || nombresUsados.has(j)) continue;
    codigosUsados.add(i);
    nombresUsados.add(j);
    nombrePorCodigo[i] = j;
  }

  return codigos.map((cod, i) => {
    // 5. Derivar el departamento de los dos primeros dígitos del código ya
    // normalizado a cuatro cifras.
    const codigoNormalizado = normalizarCodigo(cod.codigo);
    const departamento = codigoNormalizado.slice(0, 2);
    const j = nombrePorCodigo[i];
    return {
      codigo: codigoNormalizado,
      departamento,
      nombre: j === null ? "" : nombres[j].texto.trim(),
    };
  });
}

// Correcciones puntuales respaldadas por la página 7 del PDF y documentadas
// en db/datos/geografia-gt.FUENTE.md. Se aplican DESPUÉS del emparejado
// automático. El script avisa solo cuando una corrección tiene efecto de
// verdad (cambia el nombre que salió del emparejado); si ya no hace falta
// -como le pasa hoy a `0923`, que el extractor ya resuelve solo- no avisa,
// y también avisa por separado si una corrección deja de ser necesaria, para
// que ese cambio de estado no pase inadvertido.
const CORRECCIONES = {
  "0923": "La Esperanza",           // legible en la página 7 (ver FUENTE.md para el detalle)
  "1330": "Santiago Chimaltenango", // errata tipográfica del documento
};

function aplicarCorrecciones(municipios) {
  for (const [codigo, nombre] of Object.entries(CORRECCIONES)) {
    const fila = municipios.find((m) => m.codigo === codigo);
    if (!fila) {
      console.error(`La corrección de ${codigo} no encuentra su fila. Revisa la extracción.`);
      process.exit(1);
    }
    if (fila.nombre !== nombre) {
      console.warn(`Corrección aplicada en ${codigo}: ${JSON.stringify(fila.nombre)} -> ${nombre}`);
      fila.nombre = nombre;
    } else {
      console.warn(`Corrección de ${codigo} ya no hace falta: el emparejado automático ya trae "${nombre}". Se puede retirar de CORRECCIONES.`);
    }
  }
}

// Nombres oficiales de los 22 departamentos de Guatemala. La tabla del PDF
// solo lista municipios, no departamentos —el DINESE (§2.4) confirma el
// CONTEO (22, códigos 01-22) pero no enumera los pares nombre<->código—, así
// que esta lista no tiene una fuente citable con huella verificable dentro
// de este repositorio. Es nomenclatura geográfica oficial, pública y
// verificable, pero su procedencia no queda fijada por huella: ver la
// limitación declarada en db/datos/geografia-gt.FUENTE.md.
const NOMBRES_DEPARTAMENTOS = {
  "01": "Guatemala",
  "02": "El Progreso",
  "03": "Sacatepéquez",
  "04": "Chimaltenango",
  "05": "Escuintla",
  "06": "Santa Rosa",
  "07": "Sololá",
  "08": "Totonicapán",
  "09": "Quetzaltenango",
  "10": "Suchitepéquez",
  "11": "Retalhuleu",
  "12": "San Marcos",
  "13": "Huehuetenango",
  "14": "Quiché",
  "15": "Baja Verapaz",
  "16": "Alta Verapaz",
  "17": "Petén",
  "18": "Izabal",
  "19": "Zacapa",
  "20": "Chiquimula",
  "21": "Jalapa",
  "22": "Jutiapa",
};

// Construye la lista de departamentos a partir de los códigos que de verdad
// aparecen en los municipios extraídos (no del literal de NOMBRES_DEPARTAMENTOS
// a secas): así, si la extracción alguna vez trajera un código fuera de
// 01-22, o le faltara alguno, el conteo de más abajo lo detecta en vez de
// limitarse a repetir el tamaño de un objeto fijo.
function construirDepartamentos(codigosDepartamentoVistos) {
  return [...codigosDepartamentoVistos]
    .map((codigo) => ({ codigo, nombre: NOMBRES_DEPARTAMENTOS[codigo] }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// --- Ejecución ---

const { numero: numeroStream, texto: contenido } = localizarStreamDeLaTabla();
const mapaCidAUnicode = resolverMapaCidAUnicodeDeLaPagina(numeroStream);
const fragmentos = tokenizarFragmentosDeTexto(contenido, mapaCidAUnicode);
const { codigos, nombres } = separarCodigosYNombres(fragmentos);

const codigosUnicos = new Map();
for (const c of codigos) {
  const normalizado = normalizarCodigo(c.codigo);
  if (codigosUnicos.has(normalizado)) {
    console.warn(`Código de municipio repetido en el PDF, se descarta la repetición: ${normalizado}`);
    continue;
  }
  codigosUnicos.set(normalizado, c);
}

let municipios = emparejarCodigosConNombres([...codigosUnicos.values()], nombres);

aplicarCorrecciones(municipios);

municipios.sort((a, b) => a.codigo.localeCompare(b.codigo));

// Guardián: todo departamento que aparezca en un municipio tiene que existir
// en NOMBRES_DEPARTAMENTOS. Un código fuera de 01-22 se escribiría igual en
// el JSON y solo reventaría después, al aplicar la clave foránea de
// `012_geografia_gt.sql` — este es el sitio del brief donde se pone esa
// responsabilidad, no la migración.
const departamentosDesconocidos = municipios
  .map((m) => m.departamento)
  .filter((codigo) => !(codigo in NOMBRES_DEPARTAMENTOS));
if (departamentosDesconocidos.length > 0) {
  console.error(
    `Departamento desconocido en NOMBRES_DEPARTAMENTOS: ${[...new Set(departamentosDesconocidos)].join(", ")}.\n` +
      "Revisa la extracción: un código de municipio fuera de 01-22 no puede escribirse.",
  );
  process.exit(1);
}

const codigosDepartamentoVistos = new Set(municipios.map((m) => m.departamento));
const departamentos = construirDepartamentos(codigosDepartamentoVistos);

// La verificación final es la que manda: si no cuadra, no se escribe nada.
// `departamentos.length` sale de los departamentos que de verdad aparecen en
// los municipios extraídos (arriba), no de un literal fijo, así que esta
// comprobación sí puede fallar si la extracción trajera de menos.
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

writeFileSync(
  "db/datos/geografia-gt.json",
  JSON.stringify({ departamentos, municipios }, null, 2) + "\n",
);

console.log(`Escrito db/datos/geografia-gt.json: ${departamentos.length} departamentos, ${municipios.length} municipios.`);
