// Comprueba que firebase-admin puede autenticarse con las credenciales
// predeterminadas de la aplicacion (ADC).
//
// No hay claves privadas de cuenta de servicio: la organizacion las prohibe
// por politica. En local, ADC son las que deja `gcloud auth
// application-default login`, guardadas en el perfil del usuario y NUNCA
// dentro del repositorio.
//
// Este script NO imprime credenciales ni testigos: solo dice si funcionan.
//
// Uso:
//   npm run identidad:adc

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  console.error("Falta FIREBASE_PROJECT_ID en .env.local.");
  console.error("Deberia ser el identificador del proyecto de Firebase de desarrollo.");
  process.exit(1);
}

console.log(`Proyecto:       ${projectId}`);
console.log("Credenciales:   predeterminadas de la aplicacion (ADC)");
console.log("");

let credencial;
try {
  credencial = applicationDefault();
} catch (error) {
  console.error("No se pudieron preparar las credenciales predeterminadas.");
  console.error(`Motivo: ${error?.message ?? "desconocido"}`);
  process.exit(1);
}

// 1. ¿Hay credenciales y sirven para pedir un testigo?
try {
  const testigo = await credencial.getAccessToken();
  // Nunca se imprime el testigo: solo que existe y cuanto le queda.
  console.log(`  ok     hay credenciales y dan un testigo (vale ${testigo.expires_in} s)`);
} catch (error) {
  console.error("  FALLA  no hay credenciales utilizables.");
  console.error("");
  console.error("  Autenticate con la cuenta corporativa:");
  console.error("    gcloud auth application-default login");
  console.error(`    gcloud auth application-default set-quota-project ${projectId}`);
  console.error("");
  console.error(`  Motivo: ${error?.message ?? "desconocido"}`);
  process.exit(1);
}

// 2. ¿Sirven de verdad para hablar con Firebase Authentication? Pedir un
//    testigo solo prueba que hay identidad; esto prueba que ademas tiene
//    permiso sobre este proyecto.
const app = initializeApp({ credential: credencial, projectId });

try {
  // Listar cero usuarios es la operacion mas barata que ejercita permisos
  // reales sin tocar ni crear nada.
  await getAuth(app).listUsers(1);
  console.log("  ok     Firebase Authentication acepta estas credenciales");
} catch (error) {
  console.error("  FALLA  las credenciales no tienen acceso a Firebase Authentication.");
  console.error("");
  console.error("  Comprueba que la cuenta con la que iniciaste sesion tiene el rol");
  console.error(`  de administrador de Firebase Authentication sobre ${projectId}, y que`);
  console.error("  el proyecto de cuota es ese mismo:");
  console.error(`    gcloud auth application-default set-quota-project ${projectId}`);
  console.error("");
  console.error(`  Codigo: ${error?.errorInfo?.code ?? error?.code ?? "sin codigo"}`);
  process.exit(1);
}

console.log("");
console.log("Todo correcto: firebase-admin se autentica mediante ADC.");
