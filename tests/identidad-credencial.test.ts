import assert from "node:assert/strict";
import { test } from "node:test";
import { VARIABLES_DE_FEDERACION, elegirModo } from "../app/identidad/credencial";

const COMPLETO = {
  VERCEL: "1",
  GCP_PROJECT_NUMBER: "629521051305",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel",
  GCP_SERVICE_ACCOUNT_EMAIL:
    "econoluz-identidad-preview@econoluz-dev-d30ab.iam.gserviceaccount.com",
  GCP_AUDIENCE:
    "https://iam.googleapis.com/projects/629521051305/locations/global/workloadIdentityPools/vercel/providers/vercel",
};

test("fuera de Vercel se usan las credenciales predeterminadas", () => {
  assert.equal(elegirModo({}), "adc");
});

test("fuera de Vercel no importa que falten las variables de federacion", () => {
  assert.equal(elegirModo({ GCP_PROJECT_NUMBER: "629521051305" }), "adc");
});

test("en Vercel con todas las variables se usa la credencial federada", () => {
  assert.equal(elegirModo(COMPLETO), "federada");
});

/**
 * La regla más importante del módulo: en Vercel no hay respaldo. Caer hacia
 * `applicationDefault()` sería elegir el camino más privilegiado justo cuando falta
 * configuración, que es exactamente lo que prohíbe la regla del proyecto y lo que ya
 * evita `app/data/origenPublico.ts` con el rol público de Neon.
 */
for (const variable of VARIABLES_DE_FEDERACION) {
  test(`en Vercel, sin ${variable}, se lanza en vez de caer hacia ADC`, () => {
    const incompleto: Record<string, string | undefined> = { ...COMPLETO };
    delete incompleto[variable];

    assert.throws(
      () => elegirModo(incompleto),
      (error: Error) => error.message.includes(variable),
      `Sin ${variable} tiene que lanzar, y el mensaje tiene que nombrarla.`,
    );
  });
}

test("el mensaje de error nombra todas las variables que faltan, no solo la primera", () => {
  assert.throws(
    () => elegirModo({ VERCEL: "1" }),
    (error: Error) => VARIABLES_DE_FEDERACION.every((v) => error.message.includes(v)),
  );
});
