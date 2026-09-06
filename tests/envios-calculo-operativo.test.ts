import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularTarifaMensajeroPropio,
  calcularEnvioOperativo,
  TARIFA_MENSAJERO_DEFECTO_CENTS,
  UMBRAL_GRATIS_DEFECTO_CENTS,
} from "../app/envios/tarifas";

test("constantes comerciales por defecto: Q35,00 (3500 céntimos) y Q2.500,00 (250000 céntimos)", () => {
  assert.equal(TARIFA_MENSAJERO_DEFECTO_CENTS, 3500);
  assert.equal(UMBRAL_GRATIS_DEFECTO_CENTS, 250000);
});

test("mensajero propio con subtotal menor a Q2.500 cobra Q35 (3500 centavos)", () => {
  const res = calcularTarifaMensajeroPropio(249999);
  assert.equal(res.envioCents, 3500);
  assert.equal(res.gratuito, false);
  assert.equal(res.faltanParaGratisCents, 1);
});

test("mensajero propio con subtotal exactamente Q2.500 (250000 centavos) es gratuito", () => {
  const res = calcularTarifaMensajeroPropio(250000);
  assert.equal(res.envioCents, 0);
  assert.equal(res.gratuito, true);
  assert.equal(res.faltanParaGratisCents, 0);
});

test("mensajero propio con subtotal mayor a Q2.500 es gratuito", () => {
  const res = calcularTarifaMensajeroPropio(300000);
  assert.equal(res.envioCents, 0);
  assert.equal(res.gratuito, true);
  assert.equal(res.faltanParaGratisCents, 0);
});

test("mensajero propio admite reglas comerciales personalizadas", () => {
  const reglas = { tarifaCents: 4000, umbralGratisCents: 300000 };
  const resPaga = calcularTarifaMensajeroPropio(299999, reglas);
  assert.equal(resPaga.envioCents, 4000);
  assert.equal(resPaga.gratuito, false);
  assert.equal(resPaga.faltanParaGratisCents, 1);

  const resGratis = calcularTarifaMensajeroPropio(300000, reglas);
  assert.equal(resGratis.envioCents, 0);
  assert.equal(resGratis.gratuito, true);
  assert.equal(resGratis.faltanParaGratisCents, 0);
});

test("guatex devuelve coste desconocido (null), nunca 0", () => {
  const res = calcularEnvioOperativo({
    metodo: "guatex",
    subtotalCents: 10000,
  });
  assert.equal(res.tipo, "solicitud_contacto");
  assert.equal(res.metodo, "guatex");
  assert.equal(res.envioCents, null);
  assert.equal(res.gratuito, false);
  assert.equal(res.faltanParaGratisCents, null);
});
