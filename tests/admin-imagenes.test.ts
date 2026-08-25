import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TAMANO_MAXIMO_FOTO,
  esRutaDeImagenValida,
  nombreParaBlob,
  validarFoto,
} from "../app/admin/productos/imagenes";

test("acepta los formatos que usa el catálogo", () => {
  assert.equal(validarFoto("panel.webp", "image/webp", 120_000).ok, true);
  assert.equal(validarFoto("panel.jpg", "image/jpeg", 120_000).ok, true);
  assert.equal(validarFoto("panel.png", "image/png", 120_000).ok, true);
});

test("rechaza lo que no es una imagen", () => {
  const resultado = validarFoto("catalogo.pdf", "application/pdf", 1000);
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.error, /imagen/i);
});

test("rechaza una foto demasiado pesada y dice cuánto pesa", () => {
  const resultado = validarFoto("enorme.jpg", "image/jpeg", TAMANO_MAXIMO_FOTO + 1);
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.error, /MB/);
});

test("un archivo vacío no se sube", () => {
  assert.equal(validarFoto("vacia.jpg", "image/jpeg", 0).ok, false);
});

test("el nombre en el almacén se construye con la referencia pública", () => {
  const nombre = nombreParaBlob("ECO-CAT-0132", "Construlita Magnetrack.JPG");
  assert.match(nombre, /^productos\/eco-cat-0132-[a-z0-9]+\.jpg$/);
});

test("el nombre del archivo original no viaja al almacén", () => {
  // Los nombres de archivo del proveedor son justo lo que no puede acabar en
  // una URL pública: se ven con clic derecho sobre cualquier foto.
  const nombre = nombreParaBlob("ECO-IND-0007", "construlita-serie-corvus.webp");
  assert.equal(nombre.includes("construlita"), false);
  assert.equal(nombre.includes("corvus"), false);
});

test("dos subidas del mismo producto no se pisan", () => {
  const primera = nombreParaBlob("ECO-CAT-0132", "foto.webp");
  const segunda = nombreParaBlob("ECO-CAT-0132", "foto.webp");
  assert.notEqual(primera, segunda);
});

test("una extensión rara no se cuela en el nombre", () => {
  assert.match(nombreParaBlob("ECO-CAT-0132", "foto.PhP"), /\.webp$/);
});

test("la ruta de una foto vale tanto local como del almacén", () => {
  assert.equal(esRutaDeImagenValida("/catalogos/x/y.webp"), true);
  assert.equal(
    esRutaDeImagenValida("https://abc123.public.blob.vercel-storage.com/productos/eco-1.webp"),
    true,
  );
  assert.equal(esRutaDeImagenValida("https://otro-sitio.com/foto.webp"), false);
  assert.equal(esRutaDeImagenValida("no-es-una-ruta"), false);
});
