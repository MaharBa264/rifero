# Sorteo basado en resultados oficiales de lotería (Fase 2)

Rifero puede resolver el número ganador de una rifa a partir del extracto
oficial de una lotería/quiniela (por ejemplo, Lotería de la Ciudad), en vez
de generar o sortear un número por su cuenta. El objetivo es que el
resultado sea **determinístico, auditable, reproducible y matemáticamente
justo**, incluso cuando la cantidad de números de la rifa no divide en
partes iguales al espacio de resultados oficiales (0000-9999).

## 1. Por qué hace falta un mapeo

Una rifa de `N` números no siempre "calza" con las 10.000 combinaciones
posibles de un resultado de lotería de 4 cifras. Si tomáramos el resultado
oficial módulo `N` sin más, algunos números de la rifa tendrían una
combinación de más que otros, dándoles una ventaja real aunque mínima. Para
evitarlo, Rifero:

1. Calcula el mayor múltiplo de `N` que entra en el espacio de resultados
   (por defecto 10.000). A eso se lo llama `usableResults` (resultados
   utilizables).
2. Cualquier resultado oficial mayor o igual a `usableResults` queda **fuera
   de rango** y se descarta: no se usa para determinar ganador.
3. Todo resultado dentro de rango se asigna a un número de la rifa por medio
   de `resultado % N`, y **todos los números de la rifa reciben exactamente
   la misma cantidad de resultados equivalentes** (`usableResults / N`).

Esto garantiza que ningún número de la rifa tiene más o menos probabilidad
que otro de salir sorteado.

## 2. Ejemplo de referencia (N = 1500)

Con una rifa de 1500 números (0000 a 1499) y un espacio de resultados de
10.000:

- `usableResults = floor(10000 / 1500) * 1500 = 9000`
- `equivalentsPerNumber = 9000 / 1500 = 6`
- Resultados descartados: `10000 - 9000 = 1000` (los que van de 9000 a 9999)

Por lo tanto:

- El número **0326** participa como resultado oficial con: `0326, 1826,
  3326, 4826, 6326, 7826` (seis combinaciones, cada una separada por 1500).
- El número **1499** participa con: `1499, 2999, 4499, 5999, 7499, 8999`.
- El número **0000** participa con: `0000, 1500, 3000, 4500, 6000, 7500`.
- Un resultado oficial de **8999** es válido (es el último usable) y
  resuelve al número 1499.
- Los resultados **9000** y **9999** son inválidos y se descartan.

## 3. Algoritmo de resolución

`resolveOfficialLotteryDraw` recibe la lista de resultados oficiales en el
orden en que fueron sorteados/publicados (posición 1, 2, 3…, tal como
figuran en el extracto oficial) y hace lo siguiente:

1. Recorre los resultados en orden.
2. Si un resultado está fuera de rango (`>= usableResults`), se descarta con
   motivo `out_of_range` y se sigue con el próximo.
3. Si un resultado es válido, calcula
   `winnerNumber = raffleStartNumber + (resultado % raffleNumberCount)`.
4. Según la **política de ganador no reclamado** configurada (ver sección
   5), decide si ese resultado ya resuelve el sorteo o si hay que seguir
   buscando.
5. Devuelve el número ganador, la posición del extracto usada, el resultado
   oficial usado, la lista completa de descartes (con motivo) y la fórmula
   aplicada, para que quede todo documentado.

### Ejemplo con descarte

Si el extracto trae, en orden, `9347` y luego `7826`:

- `9347` está fuera de rango (`>= 9000`) → se descarta (`out_of_range`).
- `7826` es válido → `7826 % 1500 = 326` → número ganador **0326**.

El sistema registra ambos resultados: el descartado y el usado, con la
fórmula completa (`7826 mod 1500 = 326 (+ 0 inicial) = 326`).

## 4. Números equivalentes

Para que cualquier persona pueda verificar por qué su número participa o no
de un resultado dado, Rifero muestra los **números equivalentes** de cada
número vendido: todos los resultados oficiales de 4 cifras que, aplicando
la fórmula, resuelven a ese número. Esto se calcula con
`getOfficialEquivalentNumbers` y se muestra:

- En el comprobante (ticket) de cada venta, agrupado por número si es una
  venta de a pares (promo x2), en tipografía secundaria/pequeña para no
  saturar el comprobante.
- En la sección pública "Método de sorteo" del sitio, con un ejemplo real
  tomado de la configuración vigente.

## 5. Política de ganador no reclamado (`unclaimed_winner_policy`)

Puede pasar que el resultado oficial válido corresponda a un número que
nadie compró. Rifero requiere que esta política se defina **antes del
sorteo** y no se pueda cambiar una vez cerrado el padrón:

- **`no_winner`** (por defecto): el primer resultado válido del extracto
  ES el sorteo, se haya vendido o no ese número. Si no se vendió, la rifa
  simplemente queda sin ganador — no se sigue buscando otro resultado.
- **`next_valid_official_position`**: si el primer resultado válido
  corresponde a un número no vendido, se descarta con motivo `not_sold` y
  se sigue buscando el próximo resultado válido del extracto hasta
  encontrar uno vendido (o hasta agotar los resultados cargados, en cuyo
  caso el estado queda `exhausted` y hay que cargar más posiciones del
  extracto oficial).

Todos los descartes, sea por estar fuera de rango o por no estar vendido,
quedan registrados con su motivo.

## 6. Cierre de padrón (roster close)

Antes de resolver el sorteo, especialmente si se usa la política
`next_valid_official_position`, el padrón de números vendidos debe
**cerrarse**:

- Bloquea nuevas ventas y cambios de comprador (rutas de vendedores y de
  administración devuelven 409 si el padrón está cerrado).
- Registra la fecha/hora de cierre.
- Calcula un **hash SHA-256** reproducible sobre la lista ordenada y
  deduplicada de números vendidos (`computeRosterHash`), que se publica en
  el sitio público como "Padrón cerrado · Hash: …".

Cualquiera puede recalcular ese hash a partir de la lista pública de
números vendidos para comprobar que no se modificó después de conocerse el
resultado oficial.

## 7. Resolución y correcciones

La acción de administración `resolve_draw`:

- Exige que el método de sorteo sea `official_lottery_mapping`, que el
  padrón esté cerrado y que se hayan cargado resultados oficiales.
- Guarda en `draw_resolutions` todos los resultados cargados, la lista de
  descartes, la posición y resultado oficial usados, el número ganador, si
  estaba vendido, y quién confirmó la resolución.
- Si ya existe un sorteo resuelto, exige una confirmación explícita
  (`confirmCorrection`) y un motivo de corrección (`correctionReason`);
  la corrección queda enlazada a la resolución anterior (`correction_of`)
  y auditada.

## 8. Visibilidad pública

Una vez resuelto el sorteo, el sitio público muestra:

- El resultado oficial utilizado y la posición del extracto.
- El cálculo (fórmula) aplicado.
- El número ganador.
- El nombre del comprador, solo si `show_winner_buyer_name` está activado.
- El vendedor, si corresponde.
- El enlace a la fuente oficial.

## 9. Auditoría

Todas las acciones relevantes quedan en `audit_log`: activación/cambio del
método de sorteo, cierre de padrón, carga de resultados y descartes,
resolución del sorteo y correcciones. Los eventos de auditoría no pueden
borrarse desde la interfaz.

## 10. Alcance de esta fase

La primera versión no incluye scraping automático de resultados oficiales:
el extracto se carga manualmente en el panel de administración junto con
la URL de la fuente oficial, ya verificado por quien administra la rifa.
La arquitectura (una lista simple de resultados numéricos, en orden) permite
incorporar en el futuro un proveedor automático de resultados sin cambiar
el algoritmo de resolución.
