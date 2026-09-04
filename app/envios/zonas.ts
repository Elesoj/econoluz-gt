// app/envios/zonas.ts

export type Cobertura = {
  zoneId: number;
  departamentoCodigo: string | null;
  municipioCodigo: string | null;
  activa: boolean;
};

export type ResolucionDeZona =
  | { tipo: "zona"; zoneId: number }
  | { tipo: "sin_cobertura" }
  | { tipo: "cobertura_desactivada" };

export type DestinoResolucion = {
  departamentoCodigo: string;
  municipioCodigo: string;
};

/**
 * Precedencia por especificidad, fija y no configurable: el municipio manda
 * sobre el departamento. Si existe una cobertura municipal, esa decide aunque
 * esté inactiva — «aquí no entregamos» no es lo mismo que «aquí aplica la regla
 * general», y por eso no se cae al nivel superior.
 */
export function resolverZona(
  cobertura: readonly Cobertura[],
  destino: DestinoResolucion,
): ResolucionDeZona {
  const porMunicipio = cobertura.find((c) => c.municipioCodigo === destino.municipioCodigo);
  if (porMunicipio) {
    return porMunicipio.activa
      ? { tipo: "zona", zoneId: porMunicipio.zoneId }
      : { tipo: "cobertura_desactivada" };
  }
  const porDepartamento = cobertura.find((c) => c.departamentoCodigo === destino.departamentoCodigo);
  if (porDepartamento) {
    return porDepartamento.activa
      ? { tipo: "zona", zoneId: porDepartamento.zoneId }
      : { tipo: "cobertura_desactivada" };
  }
  return { tipo: "sin_cobertura" };
}