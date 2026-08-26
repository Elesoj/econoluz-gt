<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ECONOLUZ GT — lee esto antes de escribir código

Las reglas de este proyecto **no están en este archivo**. El bloque de arriba lo genera
Next.js y lo sobrescribe en cada arranque, así que nada propio puede vivir dentro de él.

1. **`CLAUDE.md`** (en esta misma carpeta) contiene las reglas del proyecto: qué es,
   los dos públicos y la decisión de que tienda y cotización convivan, la marca y sus
   colores, el stack, las convenciones, la deuda técnica conocida, qué no se toca y
   cómo quiere trabajar el dueño. **Léelo entero antes de proponer o escribir código.**
   El nombre del archivo es de una herramienta concreta, pero su contenido vale para
   cualquiera que trabaje aquí.

2. **`docs/CONTINUAR-PANEL.md`** contiene el estado del trabajo y **qué hacer ahora**,
   paso a paso, con las decisiones ya tomadas por el dueño, las trampas concretas y cómo
   verificar cada paso. **Empieza por su sección «0.1 Qué hacer ahora».**

3. **`docs/FUGAS-PROVEEDOR.md`** (26/08/2026) es el diagnóstico de los datos del
   proveedor que hoy se escapan al catálogo público. Está **sin resolver y esperando
   decisiones del dueño**. Si vas a tocar imágenes, descripciones o la auditoría, léelo
   antes: corrige varios números del informe automático, que cuenta como fugas cosas que
   no lo son.

4. **El paso 2, la tienda**, va por su primera pieza. El diseño está en
   `docs/superpowers/specs/2026-08-26-tienda-carrito-design.md` y el plan ejecutado en
   `docs/superpowers/plans/2026-08-26-tienda-carrito.md`. El carrito está terminado en la
   rama `tienda-carrito`, **sin fusionar ni desplegar**.

5. **`docs/superpowers/plans/2026-08-19-econoluz-hardening.md`** es un documento
   **histórico y ya completado**. Sus restricciones («nunca añadir precios,
   autenticación ni base de datos») eran correctas para aquella tarea y **hoy
   contradicen la dirección aprobada**. No lo tomes como norma vigente.

Dos reglas que conviene no descubrir por las malas:

- **Responde siempre en español de España**, y escribe en español los comentarios de
  código nuevos, los mensajes de commit y los resúmenes. No traduzcas nombres de
  variables, funciones, rutas ni salidas literales de terminal.
- **No publiques, despliegues ni hagas push sin confirmación explícita del dueño**, y
  no borres archivos sin preguntar antes.
