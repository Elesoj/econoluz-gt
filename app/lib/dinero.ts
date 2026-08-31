/** Convierte quetzales a centavos enteros, redondeando al céntimo más cercano. */
export const aCentavos = (quetzales: number) => Math.round(quetzales * 100);

/** Convierte centavos enteros a quetzales. */
export const aQuetzales = (centavos: number) => centavos / 100;
