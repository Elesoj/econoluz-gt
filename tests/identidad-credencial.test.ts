import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VARIABLES_DE_FEDERACION,
  adaptarCredencial,
  audienciaDelTestigo,
  configuracionFederada,
  elegirModo,
} from "../app/identidad/credencial";

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

test("la configuracion apunta al proveedor y a la cuenta de servicio esperados", () => {
  const config = configuracionFederada(COMPLETO);

  assert.equal(config.type, "external_account");
  assert.equal(config.subject_token_type, "urn:ietf:params:oauth:token-type:jwt");
  assert.equal(config.token_url, "https://sts.googleapis.com/v1/token");
  // La audiencia del STS tiene su propia prueba justo debajo: no es GCP_AUDIENCE tal cual.
  assert.equal(
    config.service_account_impersonation_url,
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      `${COMPLETO.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
  );
});

/**
 * Las dos audiencias NO se escriben igual, y confundirlas cuesta una tarde. Comprobado
 * contra el STS el 01/09/2026: con `https://` responde
 * «Invalid value for "audience". This value should be the full resource name of the
 * Identity Provider».
 *
 * - Al **testigo** se le pide la audiencia tal y como la publica el proveedor, con
 *   `https://`: es lo que va en la afirmación `aud` que Google valida.
 * - Al **STS** se le pasa el nombre de recurso, que empieza por `//`.
 */
test("la audiencia del STS es el nombre de recurso, sin esquema", () => {
  assert.equal(
    configuracionFederada(COMPLETO).audience,
    "//iam.googleapis.com/projects/629521051305/locations/global/workloadIdentityPools/vercel/providers/vercel",
  );
});

test("al testigo se le pide la audiencia con https, que es la que publica el proveedor", () => {
  assert.equal(audienciaDelTestigo(COMPLETO), COMPLETO.GCP_AUDIENCE);
});

test("si GCP_AUDIENCE ya viene como recurso, las dos formas siguen saliendo bien", () => {
  const comoRecurso = {
    ...COMPLETO,
    GCP_AUDIENCE:
      "//iam.googleapis.com/projects/629521051305/locations/global/workloadIdentityPools/vercel/providers/vercel",
  };

  assert.equal(configuracionFederada(comoRecurso).audience, comoRecurso.GCP_AUDIENCE);
  assert.equal(audienciaDelTestigo(comoRecurso), COMPLETO.GCP_AUDIENCE);
});

test("la configuracion no lleva ninguna clave privada", () => {
  const texto = JSON.stringify(configuracionFederada(COMPLETO));
  assert.equal(texto.includes("private_key"), false);
  assert.equal(texto.includes("BEGIN PRIVATE KEY"), false);
});

test("la credencial devuelve el testigo de acceso y su vida en segundos", async () => {
  const ahora = 1_000_000_000_000;
  const credencial = adaptarCredencial(
    () => ({
      getAccessToken: async () => ({ token: "testigo-de-acceso" }),
      credentials: { expiry_date: ahora + 3_600_000 },
    }),
    () => ahora,
  );

  assert.deepEqual(await credencial.getAccessToken(), {
    access_token: "testigo-de-acceso",
    expires_in: 3600,
  });
});

test("el cliente se construye una sola vez aunque se pida el testigo varias veces", async () => {
  let construcciones = 0;
  const credencial = adaptarCredencial(() => {
    construcciones += 1;
    return {
      getAccessToken: async () => ({ token: "testigo" }),
      credentials: { expiry_date: Date.now() + 60_000 },
    };
  });

  await credencial.getAccessToken();
  await credencial.getAccessToken();
  assert.equal(construcciones, 1);
});

test("un canje sin testigo falla en vez de devolver una credencial vacia", async () => {
  const credencial = adaptarCredencial(() => ({
    getAccessToken: async () => ({ token: null }),
    credentials: { expiry_date: Date.now() + 60_000 },
  }));

  await assert.rejects(() => credencial.getAccessToken(), /no devolvi/i);
});

test("un testigo sin caducidad falla en vez de inventarse una vida", async () => {
  const credencial = adaptarCredencial(() => ({
    getAccessToken: async () => ({ token: "testigo" }),
    credentials: {},
  }));

  await assert.rejects(() => credencial.getAccessToken(), /caducidad/i);
});

test("una caducidad ya pasada da cero, nunca un numero negativo", async () => {
  const ahora = 1_000_000_000_000;
  const credencial = adaptarCredencial(
    () => ({
      getAccessToken: async () => ({ token: "testigo" }),
      credentials: { expiry_date: ahora - 5_000 },
    }),
    () => ahora,
  );

  const { expires_in } = await credencial.getAccessToken();
  assert.equal(expires_in, 0);
});
