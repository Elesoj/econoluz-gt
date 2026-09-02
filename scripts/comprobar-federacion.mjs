// Comprueba que la identidad federada de Vercel sirve de verdad contra Firebase.
//
// Recorre el camino entero: coge el testigo OIDC de Vercel, lo canjea en el Security
// Token Service de Google, suplanta la cuenta de servicio y hace una llamada real de
// solo lectura a Firebase Authentication. Los tres pasos son distintos y fallan por
// motivos distintos, asi que se informan por separado.
//
// NO imprime el testigo OIDC, ni el federado, ni el de acceso. Solo dice si sirven.
// tests/identidad-frontera.test.ts lo vigila.
//
// Uso, con el entorno de Vercel descargado a un archivo aparte:
//   npx vercel env pull .env.vercel.local
//   npm run identidad:federacion

import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const VARIABLES = [
  "FIREBASE_PROJECT_ID",
  "GCP_PROJECT_NUMBER",
  "GCP_WORKLOAD_IDENTITY_POOL_ID",
  "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GCP_SERVICE_ACCOUNT_EMAIL",
  "GCP_AUDIENCE",
];

const faltan = VARIABLES.filter((v) => !process.env[v]);
if (faltan.length > 0) {
  console.error(`Faltan variables: ${faltan.join(", ")}`);
  console.error("");
  console.error("Descarga el entorno de Vercel a un archivo APARTE, nunca sobre .env.local:");
  console.error("  npx vercel link");
  console.error("  npx vercel env pull .env.vercel.local");
  console.error("");
  console.error("Las cinco variables GCP_* se anaden a mano a ese archivo; ninguna es secreta.");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const cuenta = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

// Las dos audiencias NO se escriben igual, y confundirlas es el fallo mas facil de
// cometer aqui. Al testigo se le pide la URL con https, que es la que publica el
// proveedor y acaba en la afirmacion aud. Al STS se le pasa el nombre de recurso, que
// empieza por //; con https responde "Invalid value for audience". Ver credencial.ts.
const recurso = process.env.GCP_AUDIENCE.replace(/^https:/, "");
const audiencia = `https:${recurso}`;

console.log(`Proyecto:       ${projectId}`);
console.log(`Cuenta:         ${cuenta}`);
console.log("Credenciales:   identidad federada (Workload Identity Federation)");
console.log("");

// Lee las afirmaciones del testigo sin exponerlo. Se usa solo para informar de que
// entorno dice venir, que es el dato que explica un rechazo del paso 2.
function entornoDelTestigo(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).environment ?? "?";
  } catch {
    return "?";
  }
}

// 1. Hay testigo OIDC de Vercel?
try {
  const testigo = await getVercelOidcToken({ audience: audiencia });
  console.log(`  ok     hay testigo OIDC de Vercel (entorno: ${entornoDelTestigo(testigo)})`);
} catch (error) {
  console.error("  FALLA  no hay testigo OIDC de Vercel.");
  console.error("  Enlaza el proyecto y descarga el entorno:");
  console.error("    npx vercel link");
  console.error("    npx vercel env pull .env.vercel.local");
  console.error(`  Motivo: ${error?.message ?? "desconocido"}`);
  process.exit(1);
}

// 2. Google lo acepta y entrega una credencial temporal?
const cliente = ExternalAccountClient.fromJSON({
  type: "external_account",
  audience: recurso,
  subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
  token_url: "https://sts.googleapis.com/v1/token",
  service_account_impersonation_url:
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${cuenta}:generateAccessToken`,
  subject_token_supplier: {
    getSubjectToken: () => getVercelOidcToken({ audience: audiencia }),
  },
});

if (!cliente) {
  console.error("  FALLA  google-auth-library no reconocio la configuracion de cuenta externa.");
  process.exit(1);
}

const vidaEnSegundos = () =>
  Math.max(0, Math.floor((cliente.credentials.expiry_date - Date.now()) / 1000));

try {
  await cliente.getAccessToken();
  console.log(`  ok     Google acepta la identidad federada (la credencial vale ${vidaEnSegundos()} s)`);
} catch (error) {
  console.error("  FALLA  Google rechaza la identidad federada.");
  console.error("  Repasa la condicion de atributos del proveedor y el enlace del principal.");
  console.error("  Si el entorno del paso 1 no es el que admite la condicion, es eso.");
  console.error(`  Motivo: ${error?.message ?? "desconocido"}`);
  process.exit(1);
}

// 3. Firebase Authentication acepta esa credencial? Tener testigo no es tener permiso:
//    esto es lo unico que prueba que el rol concedido alcanza.
const credencial = {
  getAccessToken: async () => {
    await cliente.getAccessToken();
    return { access_token: cliente.credentials.access_token, expires_in: vidaEnSegundos() };
  },
};

try {
  const app = initializeApp({ credential: credencial, projectId });
  // Listar cero usuarios es la operacion mas barata que ejercita permisos reales.
  await getAuth(app).listUsers(1);
  console.log("  ok     Firebase Authentication acepta la credencial temporal");
} catch (error) {
  console.error("  FALLA  Firebase Authentication no acepta la credencial.");
  console.error("  Suele ser el rol: la cuenta necesita firebaseauth.users.get.");
  console.error(`  Codigo: ${error?.errorInfo?.code ?? error?.code ?? "sin codigo"}`);
  console.error(`  Motivo: ${error?.message ?? "desconocido"}`);
  process.exit(1);
}

console.log("");
console.log("Todo correcto: la identidad federada funciona de extremo a extremo.");
