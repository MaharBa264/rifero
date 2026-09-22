# Rifero — Rifa escolar reutilizable

Aplicación web para administrar rifas escolares: vendedores con PIN propio, números disponibles/reservados/vendidos, comprobantes para WhatsApp, premios, respaldos y personalización visual.

- Sitio: https://rifa-sexto.abraham-medina.chatgpt.site
- Dominio personalizado: https://rifa6grado.islgsanluis.com.ar

## Funciones principales

- Acceso público sin cuenta de ChatGPT.
- Vendedores asociados al nombre del alumno, con sesión propia y PIN obligatorio a cambiar en el primer ingreso.
- Límites por cantidad máxima o por rango de números, más un tope general de reservas sin vender.
- Promo opcional de 2 números a precio combinado.
- Comprobante compartible por WhatsApp como imagen o texto; los vendedores pueden reenviar cualquiera de sus propios comprobantes.
- Panel administrador para configuración, premios, vendedores (activar/desactivar/eliminar con historial preservado), números, seguridad y diseño.
- Reinicio de ventas de prueba o reinicio total.
- Respaldo JSON versionado y exportación CSV de ventas.
- Persistencia en Cloudflare D1 mediante OpenAI Sites.

## Arquitectura de seguridad

Ver [`docs/PHASE1_SECURITY.md`](docs/PHASE1_SECURITY.md) para el detalle completo. Resumen:

- **Sesiones, no credenciales reenviadas.** El PIN del vendedor y la clave del admin solo viajan en el login (`/api/seller/login`, `/api/admin/login`) o al recuperar la clave (`/api/admin/recover`). El resto de los endpoints usan una cookie de sesión `HttpOnly; Secure; SameSite=Lax` — nunca se guarda una credencial en `localStorage`/`sessionStorage`.
- **Hashing con sal.** PIN y claves se guardan con PBKDF2 (100.000 iteraciones, sal aleatoria). Hashes viejos en SHA-256 sin sal se siguen aceptando y se migran solos al próximo login exitoso.
- **Rate limiting con backoff progresivo** en login de vendedor, login de admin y recuperación de admin, más soporte opcional de Cloudflare Turnstile (server-side, activable con un secret).
- **Soft delete.** Eliminar un vendedor no borra la fila ni sus ventas confirmadas; solo libera sus reservas pendientes y le corta el acceso. Se puede restaurar.
- **Auditoría ampliada** (`audit_log`) con actor, entidad y datos antes/después, redactando siempre PINs/claves/códigos.
- **Protección contra doble venta**: guards SQL optimistas + soporte de `Idempotency-Key` en las operaciones de venta/admin.
- **Backups versionados y validados** (zod) antes de restaurar, en una transacción D1.
- **`GET /api/health`** para monitoreo externo, y logging estructurado con id de correlación por request.

## Desarrollo

```bash
npm install
npm run db:generate
npm run build
```

La publicación en OpenAI Sites usa `.openai/hosting.json` y las migraciones versionadas en `drizzle/`.

### Tests

```bash
npm test          # corre toda la suite una vez (vitest run)
npm run test:watch
```

Los tests corren contra una base SQLite en memoria (usando `node:sqlite`) migrada con los mismos archivos `.sql` de `drizzle/`, y ejecutan directamente los `route.ts` reales — no hace falta Wrangler ni una base D1 real para correrlos. Ver la sección 8 de `docs/PHASE1_SECURITY.md` para el detalle de qué cubren y qué no.

### Migraciones de base de datos

```bash
npm run db:generate        # genera una migración nueva a partir de db/schema.ts
npm run db:deploy:local    # aplica las migraciones pendientes contra D1 local (wrangler dev)
npm run db:deploy          # aplica las migraciones pendientes contra D1 remoto (producción)
```

Todas las migraciones son aditivas (agregan columnas/tablas, nunca borran ni renombran), así que aplicarlas sobre una base de producción existente es seguro y no pierde datos.

### Despliegue

```bash
npm run deploy   # aplica migraciones remotas y despliega con wrangler
```

Antes de desplegar: correr `npm run lint`, `npm run build` y `npm test`, y confirmar que los tres terminan sin errores.

Variables/secrets opcionales de Cloudflare Workers:

- `TURNSTILE_SECRET_KEY` — si se configura como secret de Wrangler, `/api/admin/login` y `/api/admin/recover` exigen y verifican un token de Cloudflare Turnstile. Si no se configura, esos endpoints funcionan igual que antes (sin el chequeo).

> No se incluyen claves, PIN ni datos reales en este repositorio. Las credenciales por defecto de una instalación nueva (`admin1234` para el panel, `1234` para la vendedora de ejemplo "Olivia") están documentadas a propósito en `docs/PHASE1_SECURITY.md` — cambiala en el primer uso real.
