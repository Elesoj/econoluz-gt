// app/admin/(panel)/envios/[zona]/page.tsx
//
// La ficha de zona de reparto de 9A ya no existe: el modelo operativo no tiene
// zonas configurables ni tarifas por tramos. La ruta se conserva redirigiendo,
// para no romper enlaces guardados o marcadores del panel.

import { redirect } from "next/navigation";

export default function RedirigirEnviosZona() {
  redirect("/admin/envios");
}
