import { neon } from "@neondatabase/serverless";

// El driver de Neon habla HTTP, pero el handler usa runtime de Node porque
// también llama a la API de Resend y no necesita las restricciones de edge.
export const runtime = "nodejs";

// El esquema de la tabla está en db/001_leads.sql y se ejecuta a mano una vez.

const MAX_BODY_BYTES = 16_000;

const FIELD_LIMITS = {
  fullName: 120,
  phone: 40,
  email: 160,
  projectType: 60,
  estimatedArea: 40,
  budgetRange: 60,
  lightingType: 60,
  message: 4_000,
  ledSummary: 4_000,
  source: 40,
} as const;

const MAX_PRODUCTS = 200;
const MAX_PRODUCT_LENGTH = 300;

// Mismo patrón que valida el cliente, para que no acepte cosas distintas.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LeadRecord = {
  fullName: string;
  phone: string;
  email: string;
  projectType: string;
  estimatedArea: string;
  budgetRange: string;
  lightingType: string;
  message: string;
  ledSummary: string;
  products: string[];
  source: string;
};

const asText = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

const asProducts = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .slice(0, MAX_PRODUCTS)
        .map((item) => item.trim().slice(0, MAX_PRODUCT_LENGTH))
        .filter(Boolean)
    : [];

const buildEmailBody = (lead: LeadRecord, userAgent: string) =>
  [
    "Nueva solicitud de asesoría desde econoluz-gt.vercel.app",
    "",
    `Nombre: ${lead.fullName}`,
    `Teléfono: ${lead.phone}`,
    `Email: ${lead.email}`,
    lead.projectType ? `Tipo de proyecto: ${lead.projectType}` : "",
    lead.estimatedArea ? `Área estimada: ${lead.estimatedArea} m²` : "",
    lead.budgetRange ? `Presupuesto: ${lead.budgetRange}` : "",
    lead.lightingType ? `Tipo de iluminación: ${lead.lightingType}` : "",
    "",
    lead.products.length
      ? `Luminarias seleccionadas (${lead.products.length}):\n${lead.products
          .map((product) => `  - ${product}`)
          .join("\n")}`
      : "Sin luminarias seleccionadas.",
    "",
    lead.message ? `Mensaje:\n${lead.message}` : "",
    lead.ledSummary ? `\n${lead.ledSummary}` : "",
    "",
    "---",
    `Origen: ${lead.source || "desconocido"}`,
    `Navegador: ${userAgent || "desconocido"}`,
    "",
    "Aviso: el cliente pudo no llegar a enviar el mensaje de WhatsApp.",
    "Esta solicitud se guardó antes de ese paso, así que conviene contactarle igual.",
  ]
    .filter((line) => line !== "")
    .join("\n");

const saveToDatabase = async (lead: LeadRecord, userAgent: string) => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return { attempted: false, ok: false };
  }

  // El cliente se crea aquí y no a nivel de módulo para que la ausencia de
  // DATABASE_URL en local no reviente la importación del handler.
  const sql = neon(connectionString);

  await sql`
    insert into leads (
      full_name, phone, email, project_type, estimated_area,
      budget_range, lighting_type, message, products, led_summary,
      source, user_agent
    ) values (
      ${lead.fullName}, ${lead.phone}, ${lead.email}, ${lead.projectType},
      ${lead.estimatedArea}, ${lead.budgetRange}, ${lead.lightingType},
      ${lead.message}, ${JSON.stringify(lead.products)}, ${lead.ledSummary},
      ${lead.source}, ${userAgent}
    )
  `;

  return { attempted: true, ok: true };
};

const notifyByEmail = async (lead: LeadRecord, userAgent: string) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEADS_EMAIL_FROM;
  const to = process.env.LEADS_EMAIL_TO;

  if (!apiKey || !from || !to) {
    return { attempted: false, ok: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: to.split(",").map((address) => address.trim()),
      reply_to: lead.email,
      subject: `Solicitud de asesoría: ${lead.fullName}${
        lead.projectType ? ` (${lead.projectType})` : ""
      }`,
      text: buildEmailBody(lead, userAgent),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Resend respondió ${response.status}: ${await response.text().catch(() => "")}`,
    );
  }

  return { attempted: true, ok: true };
};

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_demasiado_grande" }, { status: 413 });
  }

  let payload: Record<string, unknown>;

  try {
    const raw = await request.text();

    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ error: "payload_demasiado_grande" }, { status: 413 });
    }

    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "json_invalido" }, { status: 400 });
  }

  // Trampa para bots: el campo va oculto en el formulario y una persona
  // nunca lo rellena. Se responde 200 para no darle pistas al bot.
  if (asText(payload.website, 200)) {
    return Response.json({ ok: true, stored: "descartado" });
  }

  const lead: LeadRecord = {
    fullName: asText(payload.fullName, FIELD_LIMITS.fullName),
    phone: asText(payload.phone, FIELD_LIMITS.phone),
    email: asText(payload.email, FIELD_LIMITS.email),
    projectType: asText(payload.projectType, FIELD_LIMITS.projectType),
    estimatedArea: asText(payload.estimatedArea, FIELD_LIMITS.estimatedArea),
    budgetRange: asText(payload.budgetRange, FIELD_LIMITS.budgetRange),
    lightingType: asText(payload.lightingType, FIELD_LIMITS.lightingType),
    message: asText(payload.message, FIELD_LIMITS.message),
    ledSummary: asText(payload.ledSummary, FIELD_LIMITS.ledSummary),
    products: asProducts(payload.products),
    source: asText(payload.source, FIELD_LIMITS.source),
  };

  const invalidFields = [
    lead.fullName ? "" : "fullName",
    lead.phone ? "" : "phone",
    lead.email && emailPattern.test(lead.email) ? "" : "email",
  ].filter(Boolean);

  if (invalidFields.length > 0) {
    return Response.json(
      { error: "campos_invalidos", fields: invalidFields },
      { status: 400 },
    );
  }

  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 500);

  const [database, email] = await Promise.allSettled([
    saveToDatabase(lead, userAgent),
    notifyByEmail(lead, userAgent),
  ]);

  const databaseOk = database.status === "fulfilled" && database.value.ok;
  const emailOk = email.status === "fulfilled" && email.value.ok;

  if (database.status === "rejected") {
    console.error("[leads] fallo al guardar en base de datos:", database.reason);
  }

  if (email.status === "rejected") {
    console.error("[leads] fallo al notificar por correo:", email.reason);
  }

  // Si al menos un destino aceptó el lead, para el usuario está guardado.
  if (databaseOk || emailOk) {
    return Response.json({ ok: true, stored: databaseOk ? "db" : "email" });
  }

  const nothingConfigured =
    database.status === "fulfilled" &&
    !database.value.attempted &&
    email.status === "fulfilled" &&
    !email.value.attempted;

  // En local, sin credenciales, el lead se imprime y se da por bueno para no
  // bloquear el desarrollo. En producción eso sería tragarse el lead en
  // silencio, así que ahí se devuelve error y el usuario ve las alternativas.
  if (nothingConfigured && process.env.NODE_ENV !== "production") {
    console.warn(
      "[leads] sin DATABASE_URL ni credenciales de Resend. Lead recibido:\n" +
        buildEmailBody(lead, userAgent),
    );
    return Response.json({ ok: true, stored: "solo-consola" });
  }

  if (nothingConfigured) {
    console.error(
      "[leads] no hay ningún destino configurado en producción: se perdería el lead.",
    );
  }

  return Response.json({ error: "no_se_pudo_guardar" }, { status: 500 });
}
