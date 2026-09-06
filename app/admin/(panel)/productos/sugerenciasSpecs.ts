/**
 * Catálogo de sugerencias comunes para los comboboxes de la ficha técnica.
 * Todas las opciones son meramente sugerencias accesibles: el campo sigue
 * permitiendo texto libre.
 */
export const SUGERENCIAS_ESPECIFICACIONES: Record<string, readonly string[]> = {
  power: ["5 W", "7 W", "10 W", "12 W", "15 W", "18 W", "20 W", "24 W", "30 W", "35 W", "40 W", "50 W", "100 W", "150 W"],
  voltage: ["12 V", "24 V", "100-240 V", "100-277 V", "120 V", "120-277 V", "220-240 V"],
  luminousFlux: ["300 lm", "450 lm", "600 lm", "800 lm", "1000 lm", "1200 lm", "1500 lm", "2000 lm", "3000 lm", "4500 lm", "6000 lm", "10000 lm"],
  efficiency: ["40 lm/W", "60 lm/W", "80 lm/W", "90 lm/W", "100 lm/W", "110 lm/W", "120 lm/W", "130 lm/W", "140 lm/W"],
  colorTemperature: ["2 700 K", "3 000 K", "3 500 K", "4 000 K", "5 000 K", "6 500 K", "RGB", "RGBW"],
  cri: ["> 80", "> 90", "80", "90", "95"],
  beamAngle: ["15°", "24°", "36°", "45°", "60°", "90°", "100°", "110°", "120°"],
  protection: ["IP20", "IP40", "IP44", "IP54", "IP65", "IP66", "IP67", "IP68", "IK08", "IK10"],
  material: ["Aluminio", "Aluminio inyectado", "Aluminio extruido", "Policarbonato", "Acero inoxidable", "Termoplástico", "Cristal templado"],
  dimming: ["ON/OFF", "0-10 V", "TRIAC", "DALI", "DALI-2", "DMX", "Corte de fase", "Atenuable"],
  lifetime: ["25 000 h", "30 000 h", "40 000 h", "50 000 h", "60 000 h", "100 000 h"],
  warranty: ["1 año", "2 años", "3 años", "5 años", "10 años"],
};
