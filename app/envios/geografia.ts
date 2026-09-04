// app/envios/geografia.ts
//
// Módulo puro de geografía de Guatemala: normalización de texto y emparejamiento
// unívoco de municipios y departamentos contra el catálogo oficial.
// Sin "server-only": ejecutable en cliente, servidor y scripts.

export type MunicipioCatalogo = {
  codigo: string;
  departamento: string; // código oficial de 2 dígitos
  nombre: string;
};

export type DepartamentoCatalogo = {
  codigo: string;
  nombre: string;
};

export type ResultadoEmparejado = {
  codigo: string;
  departamento: string;
};

export const DEPARTAMENTOS_OFICIALES: readonly DepartamentoCatalogo[] = [
  { codigo: "01", nombre: "Guatemala" },
  { codigo: "02", nombre: "El Progreso" },
  { codigo: "03", nombre: "Sacatepéquez" },
  { codigo: "04", nombre: "Chimaltenango" },
  { codigo: "05", nombre: "Escuintla" },
  { codigo: "06", nombre: "Santa Rosa" },
  { codigo: "07", nombre: "Sololá" },
  { codigo: "08", nombre: "Totonicapán" },
  { codigo: "09", nombre: "Quetzaltenango" },
  { codigo: "10", nombre: "Suchitepéquez" },
  { codigo: "11", nombre: "Retalhuleu" },
  { codigo: "12", nombre: "San Marcos" },
  { codigo: "13", nombre: "Huehuetenango" },
  { codigo: "14", nombre: "Quiché" },
  { codigo: "15", nombre: "Baja Verapaz" },
  { codigo: "16", nombre: "Alta Verapaz" },
  { codigo: "17", nombre: "Petén" },
  { codigo: "18", nombre: "Izabal" },
  { codigo: "19", nombre: "Zacapa" },
  { codigo: "20", nombre: "Chiquimula" },
  { codigo: "21", nombre: "Jalapa" },
  { codigo: "22", nombre: "Jutiapa" },
] as const;

/**
 * Normaliza un texto eliminando espacios sobrantes, colapsando espacios internos,
 * pasando a minúsculas y retirando marcas diacríticas / tildes.
 */
export function normalizar(texto: string): string {
  if (!texto || typeof texto !== "string") {
    return "";
  }
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Empareja un municipio de forma inequívoca.
 * Si el texto es ambiguo, no existe o no concuerda con el departamento, devuelve null.
 */
export function emparejarMunicipio(
  catalogoMunicipios: readonly MunicipioCatalogo[],
  departamentoTexto: string,
  municipioTexto: string,
  departamentosCatalogo: readonly DepartamentoCatalogo[] = DEPARTAMENTOS_OFICIALES,
): ResultadoEmparejado | null {
  const depNorm = normalizar(departamentoTexto);
  const munNorm = normalizar(municipioTexto);

  if (!depNorm || !munNorm) {
    return null;
  }

  // Resolver departamento por código de 2 dígitos o por nombre normalizado
  const departamentosCoincidentes = departamentosCatalogo.filter(
    (d) => d.codigo === depNorm || normalizar(d.nombre) === depNorm,
  );

  if (departamentosCoincidentes.length !== 1) {
    return null;
  }

  const depCodigo = departamentosCoincidentes[0].codigo;

  // Filtrar municipios pertenecientes a ese departamento cuyo nombre normalizado coincida exactamente
  const municipiosCoincidentes = catalogoMunicipios.filter(
    (m) => m.departamento === depCodigo && normalizar(m.nombre) === munNorm,
  );

  if (municipiosCoincidentes.length !== 1) {
    return null;
  }

  const municipio = municipiosCoincidentes[0];
  return {
    codigo: municipio.codigo,
    departamento: municipio.departamento,
  };
}
