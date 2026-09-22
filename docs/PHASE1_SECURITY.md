# Fase 1 — Endurecimiento técnico y de seguridad

Este documento explica qué cambió en esta fase, por qué, y qué queda pendiente. El
modelo de negocio (una rifa por instalación, sin multi-tenant) **no cambió**: todo lo
de acá es infraestructura debajo de la misma UX.

## 1. Autenticación y sesiones

**Antes:** el PIN del vendedor y la clave del admin se reenviaban en el body (o en un
header `x-rifa-admin-key`) en **cada** request, y se guardaban en `sessionStorage` /
`localStorage` en el cliente.

**Ahora:**
- `POST /api/seller/login` y `POST /api/admin/login` son los **únicos** endpoints que
  reciben el PIN/clave. Si son correctos, crean una fila en `sessions` (con un token
  aleatorio de 32 bytes) y devuelven una cookie `HttpOnly; Secure` (cuando la request es
  HTTPS) `; SameSite=Lax` con el **token**, nunca el PIN.
- El resto de los endpoints (`/api/seller/number`, `/api/seller/numbers`,
  `/api/seller/change-pin`, `/api/admin`, `/api/admin/backup`) leen la sesión de la
  cookie. El cliente no vuelve a tocar el PIN salvo para loguearse o cambiarlo.
- La tabla `sessions` guarda el **hash** del token (`sha256`), no el token — si alguien
  lee la base, no puede reconstruir cookies válidas.
- Expiración: sesión de vendedor 14 días con renovación deslizante (se extiende en cada
  request válido); sesión de admin 12 horas fijas (privilegio más alto, se re-loguea
  más seguido).
- Revocación: `POST /api/seller/logout` y `POST /api/admin/logout` marcan la sesión
  como revocada. Cambiar el PIN del vendedor o la clave del admin revoca **todas** las
  demás sesiones activas de ese sujeto (`revokeAllSessionsFor`), así un dispositivo
  perdido/robado queda afuera al primer cambio de clave.
- `GET /api/seller/me` y (implícitamente) `GET /api/admin` sirven de "bootstrap": el
  front-end pregunta al cargar si hay sesión válida, en vez de leer credenciales de
  `sessionStorage`.
- **CSRF:** las cookies son `SameSite=Lax`. Un navegador no las adjunta en un POST/fetch
  disparado desde otro origen (solo en navegaciones GET de nivel superior), así que los
  endpoints de mutación quedan protegidos sin necesitar un token CSRF aparte. Si en el
  futuro se agrega un subdominio que también deba compartir sesión, esto hay que
  revisarlo.
- El cambio obligatorio de PIN en el primer acceso del vendedor (`must_change_pin`) se
  mantiene intacto — ahora simplemente ocurre dentro de una sesión ya autenticada.

## 2. Hashing seguro (`lib/security.ts`)

**Antes:** `sha256(pin)` sin sal, guardado tal cual.

**Ahora:** PBKDF2-HMAC-SHA256, 100.000 iteraciones, sal aleatoria de 16 bytes,
formato autodescriptivo `pbkdf2$<iteraciones>$<saltHex>$<hashHex>` (Web Crypto,
soportado nativamente en Cloudflare Workers — sin dependencias nuevas).

**Migración progresiva, sin romper nada:**
- `verifySecret(value, stored)` acepta **ambos** formatos: si `stored` es un hex de 64
  caracteres (el formato viejo), lo verifica con SHA-256 plano; si empieza con
  `pbkdf2$`, lo verifica con PBKDF2.
- Cuando un login exitoso usó un hash legacy, `verifySecret` devuelve
  `needsRehash: true`. Los tres puntos de login (`sellerFromCredentials`,
  `verifyAdminPin`, y el cambio de PIN) reescriben ese hash a PBKDF2 en la misma
  request, de forma transparente para el usuario.
- No hace falta una migración de datos aparte ni tocar filas existentes: la
  reescritura ocurre sola, un usuario a la vez, en su próximo login.
- El código de recuperación del admin sigue siendo `sha256(code)` sin sal — es
  aceptable porque el código tiene ~60 bits de entropía (12 caracteres de un alfabeto
  de 32), muy por encima de lo que un PIN corto puede ofrecer; no necesita una función
  lenta.
- Las credenciales por defecto de una instalación nueva dejaron de ser un hash sin
  documentar: ahora son `admin1234` (admin) y `1234` (vendedora de ejemplo, ya con
  nombre "Olivia"), igual que antes en espíritu, pero ahora el valor real está
  documentado en este archivo — porque de nada sirve "ofuscar" una clave por defecto,
  solo genera falsa sensación de seguridad. La sección de riesgos pendientes cubre
  esto.

## 3. Protección de login

`lib/rate-limit.ts` implementa un backoff progresivo basado únicamente en
`login_attempts` (identidad + ip + éxito/fracaso + timestamp — **nunca** el PIN):

| Fallos recientes (15 min) | Bloqueo |
|---|---|
| 5 | 30 s |
| 8 | 2 min |
| 12 | 10 min |
| 20 | 30 min |

Se aplica a `/api/seller/login`, `/api/admin/login` y `/api/admin/recover`, contando
tanto por identidad (`seller:<nombre>`, `admin`, `admin_recovery`) como por IP — lo que
sea peor gana, así un atacante no lo esquiva rotando el nombre de vendedor probado.

Cada intento (éxito o fracaso) también queda en `audit_log` vía `logAudit`, sin el PIN.

**Turnstile (`lib/turnstile.ts`):** hook server-side listo para `/api/admin/login` y
`/api/admin/recover`. Está *feature-flagged*: si no hay `TURNSTILE_SECRET_KEY`
configurado como secret de Wrangler, la verificación se saltea y todo sigue
funcionando como hoy. **No se agregó el widget del lado del cliente** porque requiere
un site key real de Cloudflare que esta fase no tiene cómo generar ni probar — ver
riesgos pendientes.

## 4. Soft delete de vendedores

`sellers.deleted_at` (nullable). `delete_seller` en el admin ahora:
- Marca `deleted_at` + `active=0` en vez de `DELETE FROM sellers`.
- Libera solo las **reservas pendientes** de ese vendedor (`status != 'sold'`) — las
  ventas confirmadas (`status = 'sold'`) quedan intactas, con su `seller_id` apuntando
  al vendedor eliminado, preservando el historial real de quién vendió qué.
- `sellerFromCredentials` excluye `deleted_at IS NOT NULL`, así que un vendedor
  eliminado no puede volver a loguearse.
- El listado de vendedores del panel admin oculta los eliminados por defecto; un
  toggle "Ver eliminados" (`GET /api/admin?include_deleted=1`) los muestra, y hay una
  acción `restore_seller` para deshacer el borrado (no reactiva automáticamente —
  el admin decide aparte si además lo reactiva con el botón existente).

Este es un cambio de comportamiento respecto a la versión anterior (que liberaba
*todos* los números, incluidos los vendidos, al borrar un vendedor) — deliberado, para
cumplir "mantener intactas las ventas históricas".

## 5. Auditoría (`lib/audit.ts`)

`audit_log` gana columnas nuevas, todas nullable (migración aditiva, no rompe lectores
existentes): `actor_type`, `actor_id`, `entity_type`, `entity_id`, `before_json`,
`after_json`, `request_id`. Las columnas viejas (`action`, `actor`, `payload`,
`created_at`) se siguen llenando igual que antes.

`logAudit()` centraliza la escritura y **redacta** (`redact()`) cualquier campo
llamado `pin`, `newPin`, `new_admin_pin`, `code`, `recovery_code`, `new_recovery_code`,
`token` o `password` en `payload`/`before`/`after`, recursivamente, antes de
guardarlo. Se corrigió de paso un bug real que ya existía: cambiar el PIN de un
vendedor o la clave del admin dejaba el valor nuevo **en texto plano** en
`audit_log.payload` (cubierto por un test).

## 6. Concurrencia e idempotencia

- **Venta individual / reserva / liberación:** ya usaban `UPDATE ... WHERE number=?
  AND active=1 AND (status='available' OR seller_id=?)` + chequeo de
  `result.meta.changes`. D1 ejecuta cada sentencia de forma atómica, así que esto ya
  prevenía el double-selling; se mantiene.
- **Promo de a pares:** ambas filas se actualizan con `db.batch([...])` (transacción
  atómica en D1). Si alguna de las dos no cambió (porque otra familia se adelantó), se
  hace un batch compensatorio que libera la que sí se alcanzó a tomar, y se devuelve
  409 — nunca queda un número "medio vendido" de un par.
- **Idempotency-Key:** nuevo header opcional (`lib/idempotency.ts`, tabla
  `idempotency_keys`) en `/api/seller/number`, `/api/seller/numbers` y `/api/admin`
  (acciones POST). Si el cliente reenvía la misma request con la misma clave (por un
  doble tap o un retry de red), se devuelve la respuesta guardada en vez de repetir el
  efecto. El front-end genera una clave nueva por intento de venta.
- Test de concurrencia (`tests/api/sale-concurrency.test.ts`): dos requests
  simultáneas por el mismo número → exactamente una gana (200/409), y un reintento con
  la misma `Idempotency-Key` no duplica la fila de auditoría.

## 7. Backups y recuperación

- El JSON exportado ahora declara `version: 3` (antes era un `2` sin validar en el
  restore).
- `POST /api/admin { action: "restore" }` valida el archivo con **zod** antes de tocar
  la base (`backupSchema` en `app/api/admin/route.ts`). Un archivo mal formado se
  rechaza con 400 sin escribir nada — cubierto por test.
- El restore aplica settings + premios dentro de un único `db.batch([...])`
  (transacción D1: todo o nada).
- **Alcance sin cambios (documentado, no expandido esta fase):** el restore sigue sin
  tocar `sellers` ni `raffle_numbers` — es intencional, para que restaurar una
  configuración vieja nunca borre ventas reales en curso. Si en el futuro se quiere un
  restore completo, tiene que ser una acción separada y explícita, con más
  confirmaciones.
- **Estrategia recomendada para producción:** descargar el JSON completo (pestaña
  Respaldos) después de cada tanda de cambios de configuración importantes, y el CSV de
  ventas periódicamente para tener una copia legible aparte de D1. D1 en sí mismo tiene
  point-in-time recovery de Cloudflare a nivel de cuenta, pero eso no reemplaza tener
  una copia exportada fuera de Cloudflare.

## 8. Tests

Sin infraestructura de tests previa. Se agregó `vitest` (Node puro, sin browser) más
una capa de soporte en `tests/support/`:

- **`tests/support/d1-shim.ts`**: una implementación de la interfaz de D1
  (`prepare/bind/first/all/run/batch`) sobre `node:sqlite` (built-in de Node ≥22,
  mismo motor SQLite que usa D1 por debajo). `createMigratedD1()` aplica **todas** las
  migraciones reales de `drizzle/*.sql` en orden sobre una base en memoria nueva por
  test — o sea, los tests corren contra el esquema real, no una maqueta aparte.
- **`tests/support/cloudflare-workers-shim.ts`** + alias en `vitest.config.ts`:
  reemplaza el módulo `cloudflare:workers` (que solo existe dentro de un Worker real)
  por un `env` mutable, así los route handlers se importan y ejecutan **sin
  modificar**, tal cual corren en producción.
- Los tests de API (`tests/api/*.test.ts`) importan directamente los `GET`/`POST`
  exportados de cada `route.ts` y les pasan objetos `Request` reales — son tests de
  integración genuinos, no mocks de la lógica.

Cobertura (52 tests, 11 archivos):

| Área | Archivo |
|---|---|
| Login correcto/incorrecto, rehash de hash legacy, vendedor eliminado no loguea | `tests/api/seller-login.test.ts` |
| Rate limiting (vendedor y admin) | dentro de `seller-login.test.ts` y `admin-auth.test.ts` |
| Cambio de PIN (éxito, PIN actual incorrecto, revocación de sesión vieja) | `tests/api/change-pin.test.ts` |
| Login admin, recuperación admin (single-use, código inválido), rotación de sesión al cambiar clave, no-leak de PIN en auditoría | `tests/api/admin-auth.test.ts` |
| Venta simultánea del mismo número, Idempotency-Key, promo de 2 números (con rollback), límite por vendedor, tope de reservas | `tests/api/sale-concurrency.test.ts` |
| Soft delete (venta preservada, reserva liberada, restore) | `tests/api/soft-delete.test.ts` |
| Backup export (sin hashes), restore válido/ inválido, alcance del restore | `tests/api/backup-restore.test.ts` |
| Health endpoint | `tests/api/health.test.ts` |
| Hashing, redacción de auditoría, cálculo de precio | `tests/unit/*.test.ts` |

`pnpm test` corre todo (`vitest run`); `pnpm test:watch` para desarrollo.

**Lo que esto NO cubre** (ver riesgos pendientes): concurrencia real a nivel de
Worker/D1 con conexiones separadas (el shim es single-threaded/sincrónico, así que
"simultáneo" en los tests es "en el mismo tick de Node", no dos requests HTTP
paralelas de verdad contra D1 en producción), y E2E de navegador real (Playwright).

## 9. Observabilidad

- `lib/observability.ts`: `logEvent()` escribe JSON estructurado a `console.log`/
  `console.error` (Cloudflare Workers los captura en `wrangler tail` / el dashboard de
  Logs). `newRequestId()` genera un UUID por request.
- Todas las respuestas relevantes llevan header `x-request-id`; los errores 5xx se
  loguean server-side con ese id vía `apiError()` (que ya nunca devolvió el stack al
  cliente — eso no cambió, solo se agregó el log del lado del servidor).
- `GET /api/health`: hace `SELECT 1` contra D1, devuelve `{ok, dbOk, time, latencyMs}`
  con status 200/503. Sin autenticación (no expone nada sensible) — pensado para un
  monitor externo simple (UptimeRobot, cron de health-check, etc.).

## 10. Qué NO cambió (a propósito)

- El modelo de datos sigue siendo una rifa por base D1 (`id=1` en `raffle_settings`).
  Nada de esto introduce un concepto de tenant/organización.
- La UX pública y del panel admin es la misma; los cambios de esta fase son
  invisibles para quien ya usa la app, salvo que ahora hace falta loguearse una vez
  (con cookie) en vez de que el navegador reenvíe el PIN solo.
- Todas las migraciones son aditivas (`ALTER TABLE ... ADD` o `CREATE TABLE` nuevas).
  Ninguna columna ni tabla vieja se borra o renombra — una base de producción existente
  migra sin pérdida de datos corriendo `pnpm db:deploy`.

## Riesgos y trabajo pendiente

1. **Turnstile sin widget de cliente.** El servidor ya sabe verificar el token si se
   configura `TURNSTILE_SECRET_KEY`, pero nadie puede generar ese token sin el widget
   de Cloudflare en el formulario de login/recuperación admin. Falta: agregar el
   `<script>` de Turnstile + el site key (público, se puede hardcodear o poner en
   config) al login admin y a "¿Olvidaste tu clave?" cuando se decida activarlo.
2. **Credenciales por defecto siguen siendo conocidas públicamente**
   (`admin1234` / `1234`). Es mejor que un hash sin documentar (ahora al menos se sabe
   cuál es y se puede exigir cambiarla), pero sigue siendo responsabilidad de quien
   despliega cambiarla en el primer uso. Posible mejora futura: forzar el mismo flujo
   de "cambio obligatorio" que ya existe para vendedores, también para el admin, en el
   primer login tras un deploy nuevo.
3. **Rate limiting es por-base-de-datos, no por-edge.** No hay protección a nivel de
   Cloudflare (WAF / Rate Limiting Rules) delante de estos endpoints; alguien con
   muchas IPs distintas podría intentar más combinaciones de las que el backoff
   asume por IP única. Cloudflare Rate Limiting Rules (a nivel de cuenta/zona) sería
   la capa complementaria natural, fuera del alcance del código de la app.
4. **Sin pruebas de concurrencia real contra D1.** Los tests de "venta simultánea"
   validan la lógica del guard SQL con un shim sincrónico; no reproducen dos Workers
   distintos pegándole a la misma base al mismo tiempo. La garantía real de
   atomicidad depende de que D1 serialice escrituras por base (documentado por
   Cloudflare), no fue re-verificada con carga real en este pase.
5. **Sin E2E de navegador.** No se agregó Playwright/Cypress; el "E2E crítico" pedido
   se cubrió a nivel de API (que ejercita el mismo código que corre en producción,
   pero no valida la UI real ni el flujo de click-a-click).
6. **`idempotency_keys` no tiene limpieza automática todavía** — crece sin límite. No
   es grave a la escala de una rifa escolar, pero si esto se usa por mucho tiempo
   conviene un cron/admin action que borre filas viejas (ej. > 7 días), similar a
   `pruneOldAttempts()` que ya existe para `login_attempts` pero tampoco está
   agendado automáticamente (hay que llamarlo manualmente o desde un cron externo —
   Cloudflare Cron Triggers sería lo natural, no configurado en esta fase).
7. **Sesión de vendedor de 14 días** es una elección de UX vs. seguridad — un
   dispositivo compartido/perdido queda con sesión válida hasta el logout manual o
   el próximo cambio de PIN. Aceptable para el contexto (rifa escolar, dispositivos
   familiares), pero vale la pena revisarlo si el contexto cambia.
