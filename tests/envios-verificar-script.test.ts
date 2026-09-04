import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decidirDestinoVerificacion,
  validarDestinoVerificacion,
} from "../scripts/verificar-envios.mjs";

const DESARROLLO = "ep-test-branch-12345.c-11.us-east-1.aws.neon.tech";
const PRODUCCION = "ep-misty-sun-avmcbgly.c-11.us-east-1.aws.neon.tech";

describe("scripts/verificar-envios.mjs", () => {
  it("decidirDestinoVerificacion detecta --produccion o desarrollo por defecto", () => {
    assert.equal(decidirDestinoVerificacion([]), "desarrollo");
    assert.equal(decidirDestinoVerificacion(["--contar"]), "desarrollo");
    assert.equal(decidirDestinoVerificacion(["--produccion"]), "produccion");
    assert.equal(decidirDestinoVerificacion(["--contar", "--produccion"]), "produccion");
  });

  it("validarDestinoVerificacion rechaza Producción si no se especifica --produccion", () => {
    const res = validarDestinoVerificacion({
      destino: "desarrollo",
      host: PRODUCCION,
      hostProduccion: PRODUCCION,
    });
    assert.equal(res.ok, false);
    assert.match(res.motivo ?? "", /producción/i);
    assert.match(res.motivo ?? "", /--produccion/i);
  });

  it("validarDestinoVerificacion rechaza Desarrollo si se pasa --produccion", () => {
    const res = validarDestinoVerificacion({
      destino: "produccion",
      host: DESARROLLO,
      hostProduccion: PRODUCCION,
    });
    assert.equal(res.ok, false);
    assert.match(res.motivo ?? "", /no es el de producción/i);
  });

  it("validarDestinoVerificacion acepta Producción con --produccion cuando el endpoint coincide", () => {
    const res = validarDestinoVerificacion({
      destino: "produccion",
      host: PRODUCCION,
      hostProduccion: PRODUCCION,
    });
    assert.equal(res.ok, true);
  });

  it("validarDestinoVerificacion acepta Desarrollo sin --produccion cuando no es Producción", () => {
    const res = validarDestinoVerificacion({
      destino: "desarrollo",
      host: DESARROLLO,
      hostProduccion: PRODUCCION,
    });
    assert.equal(res.ok, true);
  });
});
