# Diseño de Asteria en Canton

## Introducción

Asteria es un bot challenge creado por TxPipe sobre el ledger de Cardano. Cada jugador controla una nave que se mueve por una grilla bidimensional, gasta combustible en cada desplazamiento, junta recursos de pellets distribuidos por el tablero y compite por llegar al centro para minar el premio acumulado. El diseño original está pensado para el modelo eUTxO de Cardano: naves y pellets son UTxOs con un datum, la lógica vive en validadores y minting policies, y el premio es ADA guardado en un UTxO.

Este documento describe la implementación de las mismas mecánicas en Canton. La grilla, la distancia Manhattan, el consumo de combustible, el límite de velocidad, las constantes y la economía del premio se mantienen. La comparación es de plataforma y no de juego: cada diferencia está marcada con dos explicaciones, la motivación que tenía el diseño original en Cardano y la motivación que tiene el cambio en Canton.

Las diferencias se agrupan en dos clases:

- **Cambios forzados por la plataforma.** Son consecuencias del modelo de Canton: contratos con choices en lugar de validadores, autorización por parties, visibilidad por stakeholders, tiempo asignado por el synchronizer y activos representados como contratos.
- **Decisiones del port.** Son elecciones donde existía más de una opción razonable. Cada una se documenta junto con la alternativa que se descartó.

La tabla siguiente resume las quince diferencias. El detalle de cada una está en la sección "Diferencias de portabilidad y motivación".

| # | Tema | Clase | Impacto en las mecánicas |
| --- | --- | --- | --- |
| 1 | Validadores y policies → templates y choices | Forzado | Ninguno |
| 2 | Datum y redeemer → campos y argumentos | Forzado | Ninguno |
| 3 | Emisión de tokens → contratos y choices | Forzado | Ninguno |
| 4 | `AdminToken` → party administradora y `gameId` | Forzado | Ninguno |
| 5 | Rango de validez → `getTime` | Forzado | Cambia la fuente del tiempo, la regla de velocidad se conserva |
| 6 | Ledger público → observers | Forzado | La grilla puede seguir siendo pública si se configura |
| 7 | min-ADA y ADA bloqueado → sin mínimo y traffic fees | Forzado | El pozo deja de acumularse dentro del estado del juego |
| 8 | Premio en ADA → contabilidad y pago con tokens | Forzado | La matemática se conserva, cambia el mecanismo de pago |
| 9 | Contención de UTxO → orden del sequencer | Forzado | La resolución de carreras se conserva, no hay mempool visible |
| 10 | `PilotToken` → autorización por party | Forzado | Ninguno |
| 11 | Hash de script inmutable → paquete Daml actualizable | Forzado | Ninguno, pero cambia la garantía de inmutabilidad |
| 12 | Contract keys no soportadas | Forzado | Ninguno, la unicidad se resuelve con el contador |
| 13 | Combustible como campo del `Ship` | Decisión | Ninguno |
| 14 | Financiación del pozo y pago de entrada | Decisión | En la fase 1 el pozo no crece con cada nave |
| 15 | Visibilidad de naves configurable (`shipObservers`) | Decisión | Default público (fiel al original); privado permite mostrar la privacidad por party |

Un principio recorre todo el diseño: en Daml la autorización reemplaza a la firma explícita del administrador. Cuando un piloto ejerce un choice sobre un contrato que el admin firmó, las consecuencias de esa acción heredan la autoridad del admin. Eso permite que el piloto mueva su nave, junte combustible y mine sin que el admin esté conectado, siempre que el admin haya definido de antemano qué transiciones permite cada contrato. El mismo mecanismo reemplaza al `PilotToken` del original.

## Glosario de constantes

Las constantes del juego se mantienen. La única diferencia de unidad aparece en `MAX_SPEED`, porque el tiempo del ledger se mide en segundos y no en un rango de validez elegido por el emisor.

| Constante | Significado |
| --- | --- |
| `MAX_SPEED` | Velocidad máxima de una nave, en unidades de grilla por segundo |
| `INITIAL_FUEL` | Combustible inicial de una nave al mintearse |
| `MAX_SHIP_FUEL` | Capacidad máxima de combustible de una nave |
| `FUEL_PER_STEP` | Combustible consumido por unidad de distancia |
| `MAX_ASTERIA_MINING` | Porcentaje máximo del pozo que se puede minar, entero entre 0 y 100 |
| `MIN_ASTERIA_DISTANCE` | Distancia mínima al centro permitida al crear una nave |
| `SHIP_MINT_FEE` | Tarifa de creación de una nave. Reemplaza a `SHIP_MINT_LOVELACE_FEE` porque la moneda cambia: en la fase 1 es cero y en la fase 2 se paga en Canton Coin |

Constantes nuevas, propias de la plataforma:

| Constante | Significado | Valor o nota |
| --- | --- | --- |
| `LEDGER_TIME_TOLERANCE` | Ventana máxima entre preparación y envío de una transacción que usa `getTime` | Aproximadamente un minuto en la Global Synchronizer |
| `OBSERVERS` | Party o lista de parties que pueden ver cada contrato | Decisión del port, se documenta en la diferencia 6 |
| `GAME_ID` | Identificador de la instancia del juego | Reemplaza a la función del `AdminToken` |
| `PACKAGE_VERSION` | Versión del paquete Daml desplegado | Reemplaza al hash del script |

## Especificación de contratos

El original describe cada UTxO con tres partes: address, datum y value. En Canton, la dirección del UTxO se convierte en la autorización del contrato (signatories y observers), el datum en los campos, y el value en tenencias de tokens o en campos de contabilidad. Esta sección especifica cada contrato con esa correspondencia.

### `Game` (reemplaza al `AsteriaUtxo`)

El `AsteriaUtxo` era un único UTxO que guardaba el contador de naves, el identificador de la policy y las recompensas, y cuya posición en el tablero era siempre `(0, 0)`. En Canton, el estado y las tenencias se separan: `Game` guarda la configuración y el contador, y `PrizePool` representa el pozo.

Campos:

| Campo | Tipo | Equivalencia |
| --- | --- | --- |
| `admin` | `Party` | Reemplaza al `AdminToken` y a los parámetros del validador |
| `gameId` | `Text` | Identifica la instancia y la versión del juego |
| `shipCounter` | `Int` | Campo `ship_counter` del original |
| `shipMintFee` | `Decimal` | `SHIP_MINT_LOVELACE_FEE` |
| `observers` | `[Party]` | Visibilidad, no existía en el original |

Autorización: `signatory admin`, `observer observers`. El original no tenía signatories porque la legitimidad venía del `AdminToken` presente en el value. En Canton, la legitimidad viene de que el admin firma el contrato: nadie más puede crear un `Game`, un `Pellet` o una nave del juego.

Choices:

- `RegisterShip : (Int, ContractId Game)`, controlado por `admin`. Incrementa `shipCounter` y devuelve el número de serie junto con el `ContractId` del `Game` recreado, porque `RegisterShip` archiva el contrato anterior y el `Shipyard` necesita actualizar su referencia.
- `ConsumeGame`, controlado por `admin`. Archiva el contrato. Daml exige nombres de choice únicos por módulo, así que el consumo del juego y el del pozo llevan nombres distintos.

Tenencias: ninguna. En el original el `AsteriaUtxo` también guardaba el valor del pozo, que en Canton es una tenencia separada (diferencia 7).

### `PrizePool` (parte del value del `AsteriaUtxo`)

| Campo | Tipo | Equivalencia |
| --- | --- | --- |
| `admin` | `Party` | Autoridad que reemplaza al `AdminToken` |
| `gameId` | `Text` | Instancia del juego |
| `pot` | `Decimal` | Recompensas acumuladas |
| `maxAsteriaMining` | `Int` | Porcentaje máximo que se puede minar |
| `observers` | `[Party]` | Visibilidad |

Autorización: `signatory admin`, `observer observers`.

Choices:

- `Payout`, controlado por `admin`, con `winner : Party`. Verifica que el pozo alcance, calcula el pago, crea un `GameToken` para el ganador y descuenta del pozo. Se ejerce con la autoridad del admin propagada desde la nave en `Mine`, sin una firma del admin en línea.
- `ConsumePool`, controlado por `admin`. Archiva el contrato.

Tenencias: en la fase 1 el pozo es una contabilidad (`pot`) y el pago emite `GameToken`. En la fase 2 el pozo es una tenencia de Canton Coin y el pago usa el workflow del token estándar (diferencia 8).

### `Ship` (reemplaza al `ShipState`)

| Campo | Tipo | Equivalencia |
| --- | --- | --- |
| `admin` | `Party` | Autoridad del juego |
| `pilot` | `Party` | Dueño de la nave. Reemplaza al `PilotToken` |
| `gameId` | `Text` | Instancia del juego |
| `serial` | `Int` | Nombre del `ShipToken`, generado con `shipCounter` |
| `posX`, `posY` | `Int` | Posición en la grilla |
| `fuel` | `Int` | Combustible. En el original era un token aparte |
| `lastMoveTime` | `Time` | Reemplaza a `last_move_latest_time` |
| `config` | `ShipConfig` | Parámetros del validador spacetime |
| `observers` | `[Party]` | Visibilidad |

Autorización: `signatory admin, pilot`. El piloto es signatory para que el admin no pueda archivar la nave por su cuenta. El original no tenía un concepto equivalente: la nave era un UTxO cuya dirección era el validador spacetime.

`ShipConfig` agrupa los parámetros que el original pasaba como parámetros del validador: `maxSpeed`, `maxFuel`, `fuelPerStep`, `initialFuel` y `minAsteriaDistance`. Se copia en la nave al crearla, igual que los parámetros del validador spacetime aplicaban a todas las naves de una versión del juego.

Firma ilustrativa del template y del choice de movimiento:

```haskell
template Ship
  with
    admin : Party
    pilot : Party
    gameId : Text
    serial : Int
    posX : Int
    posY : Int
    fuel : Int
    lastMoveTime : Time
    config : ShipConfig
    observers : [Party]
  where
    signatory admin, pilot
    observer observers

    choice Move : ContractId Ship
      with
        deltaX : Int
        deltaY : Int
      controller pilot
      do
        now <- getTime
        let dist = abs deltaX + abs deltaY
        let cost = dist * config.fuelPerStep
        let elapsed = convertRelTimeToMicroseconds (subTime now lastMoveTime)
        assert (fuel >= cost)
        assert (dist * 1000000 <= config.maxSpeed * elapsed)
        create this with
          posX = posX + deltaX
          posY = posY + deltaY
          fuel = fuel - cost
          lastMoveTime = now
```

Choices:

- `Move`, controlado por `pilot`. Actualiza posición, combustible y `lastMoveTime`.
- `GatherFuel`, controlado por `pilot`. Verifica que la nave esté en la posición del pellet, que el pellet tenga combustible suficiente y que la carga no supere `MAX_SHIP_FUEL`; luego ejerce `Provide` sobre el pellet y recrea la nave con más combustible.
- `Mine`, controlado por `pilot`. Verifica que la nave esté en `(0, 0)` y ejerce `Payout` sobre el pozo. La nave se archiva, que es el equivalente a quemar el `ShipToken` y el combustible restante.
- `Quit`, controlado por `pilot`. Archiva la nave. En el original devolvía el min-ADA bloqueado; en Canton no hay valor bloqueado que devolver.

Tenencias: ninguna. `fuel` es un campo, no un token (diferencia 13). No hay min-ADA.

### `Pellet` (reemplaza al `PelletState`)

| Campo | Tipo | Equivalencia |
| --- | --- | --- |
| `admin` | `Party` | Autoridad del juego |
| `gameId` | `Text` | Instancia |
| `posX`, `posY` | `Int` | Posición en la grilla |
| `fuel` | `Int` | Combustible disponible |
| `prize` | `Decimal` | Tokens de premio del pellet |
| `observers` | `[Party]` | Visibilidad |

Autorización: `signatory admin`, `observer observers`.

Choices:

- `Provide`, controlado por `admin`, con `recipient : Party`, `amount : Int` y `prizeAmount : Decimal`. Verifica cantidades, descuenta combustible y premio, recrea el pellet y crea los `GameToken` de premio para el piloto si corresponde. Se ejerce con la autoridad del admin propagada desde la nave en `GatherFuel`.
- `Consume`, controlado por `admin`. Archiva el pellet y devuelve el premio restante al admin.

Tenencias: ninguna. En el original el pellet guardaba min-ADA, `AdminToken`, combustible y tokens de premio; acá el combustible y el premio son campos.

### `Shipyard` (reemplaza a la `ShipyardPolicy`)

| Campo | Tipo | Equivalencia |
| --- | --- | --- |
| `admin` | `Party` | Autoridad de emisión |
| `gameId` | `Text` | Instancia |
| `gameCid` | `ContractId Game` | Referencia al `Game` para leer la tarifa y pedir el número de serie |
| `config` | `ShipConfig` | Parámetros compartidos con spacetime |
| `observers` | `[Party]` | Visibilidad |

Autorización: `signatory admin`, `observer observers`.

Choices:

- `MintShip`, con `pilot : Party`, `posX : Int` y `posY : Int`, controlado por `pilot`. Verifica que la distancia al centro sea al menos `MIN_ASTERIA_DISTANCE`, pide el número de serie al `Game`, y crea la nave con `INITIAL_FUEL`, `lastMoveTime` igual al tiempo del ledger y la configuración del juego. En la fase 2 verifica además el pago de la entrada. Como `RegisterShip` recrea el `Game`, `MintShip` recrea también el `Shipyard` con el `ContractId` actualizado.
- `BurnShip` no existe como choice separado: archivar la nave en `Quit` o `Mine` cumple esa función.

Tenencias: ninguna. El `ShipToken` y el `PilotToken` que emitía la policy son opcionales (ver más abajo).

### `GameToken` (fase 1)

Token de juego que representa el premio mientras no haya valor real en juego.

| Campo | Tipo |
| --- | --- |
| `issuer` | `Party` (el admin) |
| `owner` | `Party` |
| `gameId` | `Text` |
| `amount` | `Decimal` |

Autorización: `signatory issuer`, `observer owner`. Choice `Transfer`, controlado por `owner`, para transferir el token. El admin actúa como emisor y respalda la contabilidad del pozo. La fase 2 reemplaza este contrato por Canton Coin o por el token estándar CIP-0056.

### `ShipToken` y `PilotRight` (opcionales)

En el original, el `ShipToken` identifica la nave y el `PilotToken` autoriza al piloto. En Canton, la identidad de la nave es el `ContractId` y la autorización del piloto es la firma de la party, así que ninguno de los dos es necesario para las mecánicas. Se pueden agregar como contratos si se quiere que la nave sea transferible: un `PilotRight` transferible cambiaría el campo `pilot` por un `ContractId PilotRight` y habilitaría compraventa de naves. Queda fuera de la fase 1.

## Operaciones

Cada operación del original se traduce a una acción de la party correspondiente sobre un choice. El campo "Equivalente" indica la transacción del diseño original.

### Crear el juego

- **Quién:** el admin.
- **Acción:** crea `Game`, `PrizePool` y `Shipyard`, y financia el pozo inicial con `GameToken`.
- **Chequeos:** ninguno en lógica. La creación exige la firma del admin porque es signatory de los tres contratos, así que un tercero no puede crear un juego que pase por legítimo.
- **Equivalente:** "Create Asteria UTxO".

### Crear un pellet

- **Quién:** el admin.
- **Acción:** crea un `Pellet` en la posición elegida, con el combustible y el premio indicados.
- **Chequeos:** ninguno en lógica, por el mismo motivo que la operación anterior.
- **Equivalente:** "Create a PelletState UTxO".

### Mintear una nave

- **Quién:** el piloto nuevo.
- **Acción:** ejerce `MintShip` sobre el `Shipyard`. El cuerpo verifica la distancia mínima, pide el número de serie al `Game`, crea la nave y, en la fase 2, verifica el pago de la entrada.
- **Chequeos:** distancia al centro mayor o igual a `MIN_ASTERIA_DISTANCE`; pago de `SHIP_MINT_FEE` en la fase 2.
- **Equivalente:** "Create a ShipState UTxO". En el original la transacción minteaba `ShipToken`, `PilotToken` y `INITIAL_FUEL`, creaba el `ShipState` y sumaba la tarifa al `AsteriaUtxo`.

### Mover una nave

- **Quién:** el piloto.
- **Acción:** ejerce `Move` sobre su `Ship`.
- **Chequeos:** combustible suficiente para la distancia; distancia avanzada menor o igual a `MAX_SPEED` multiplicado por el tiempo transcurrido desde `lastMoveTime`; en el original se comparaba contra el rango de validez de la transacción.
- **Efectos:** se actualizan posición, combustible y `lastMoveTime`. La nave vieja se archiva y se crea la nueva dentro del mismo choice.
- **Equivalente:** "Move a Ship".

### Juntar combustible

- **Quién:** el piloto.
- **Acción:** ejerce `GatherFuel` sobre su `Ship`, pasando el `ContractId` del pellet. El cuerpo verifica la posición y las cantidades, y luego ejerce `Provide` sobre el `Pellet` con la autoridad del admin propagada desde la nave.
- **Chequeos:** misma posición que el pellet; cantidad pedida menor o igual al combustible del pellet; carga resultante menor o igual a `MAX_SHIP_FUEL`.
- **Efectos:** la nave gana combustible y el pellet lo pierde. Si el pellet tiene premio, el piloto recibe `GameToken` por ese monto.
- **Equivalente:** "Gather Fuel".

### Minar Asteria

- **Quién:** el piloto.
- **Acción:** ejerce `Mine` sobre su `Ship`. El cuerpo verifica la posición y ejerce `Payout` sobre el `PrizePool`, de nuevo con la autoridad del admin propagada desde la nave.
- **Chequeos:** posición `(0, 0)`; el pozo debe alcanzar para el pago.
- **Efectos:** el pozo se reduce como máximo `MAX_ASTERIA_MINING` por ciento y el ganador recibe ese monto; la nave se archiva, lo que equivale a quemar el `ShipToken` y el combustible restante.
- **Equivalente:** "Mine Asteria UTxO".

### Abandonar el juego

- **Quién:** el piloto.
- **Acción:** ejerce `Quit` sobre su `Ship`.
- **Efectos:** la nave se archiva. En el original se devolvía el min-ADA bloqueado; en Canton no hay valor bloqueado.
- **Equivalente:** "Quit Game".

### Consumir el juego

- **Quién:** el admin.
- **Acción:** ejerce `ConsumeGame` sobre `Game` y `ConsumePool` sobre `PrizePool`. El pozo restante se devuelve al admin.
- **Equivalente:** "Consume Asteria UTxO".

### Consumir un pellet

- **Quién:** el admin.
- **Acción:** ejerce `Consume` sobre el `Pellet`. El combustible restante no tiene valor que rescatar y el premio restante se devuelve al admin.
- **Equivalente:** "Consume PelletState UTxO".

## Templates y choices: mapa de chequeos

La tabla siguiente mapea cada regla del original a su mecanismo en Canton. La columna "Tipo" distingue tres casos: **estructural** (la regla desaparece porque el choice define la transacción y no hay transacciones arbitrarias que inspeccionar), **explícita** (la regla se conserva como una aserción en el cuerpo del choice) y **autorización** (la regla se cumple porque el ledger exige la firma de una party).

### Spacetime validator

| Regla original | Mecanismo en Canton | Tipo |
| --- | --- | --- |
| El `ShipState` input es el único script input | El choice `Move` solo puede archivar y recrear la nave sobre la que se ejerce | Estructural |
| Hay un único `ShipState` output | El cuerpo crea exactamente una nave | Estructural |
| El `PilotToken` está presente en un input | El choice está controlado por `pilot` | Autorización |
| El output solo contiene `ShipToken`, combustible y ADA | Desaparece: no hay valor adjunto que controlar | Estructural |
| Hay combustible suficiente para el desplazamiento | `assert (fuel >= cost)` | Explícita |
| Distancia dividida por el rango de validez no supera `MAX_SPEED` | `assert` con `getTime` y `lastMoveTime` | Explícita |
| `last_move_latest_time` no supera el inicio del rango | Desaparece: el tiempo del ledger es monótono por causalidad | Estructural |
| La posición y `last_move_latest_time` se actualizan | El cuerpo del choice recrea la nave con los valores nuevos | Estructural |
| El combustible gastado se quema | El campo `fuel` se descuenta | Estructural |
| En `GatherFuel`, hay dos script inputs | La nave se ejerce y el pellet se referencia por `ContractId` | Estructural |
| Posición del pellet igual a la de la nave | `assert` comparando los campos | Explícita |
| La carga no supera `MAX_SHIP_FUEL` | `assert` en el cuerpo | Explícita |
| No se mintean tokens | No hay primitiva de minteo: los tokens se crean solo en los choices definidos | Estructural |
| En `MineAsteria`, hay dos script inputs | La nave se ejerce y el pozo se referencia por `ContractId` | Estructural |
| La nave está en `(0, 0)` | `assert` en `Mine` | Explícita |
| `ShipToken` y combustible se queman | La nave se archiva con el choice de consumo | Estructural |
| En `Quit`, el `ShipState` es el único script input | El choice solo toca la nave | Estructural |

### Pellet validator

| Regla original | Mecanismo en Canton | Tipo |
| --- | --- | --- |
| El `ShipToken` está en un input | `GatherFuel` está controlado por `pilot` | Autorización |
| El `AdminToken` está en el output `PelletState` | El pellet se recrea con `admin` como signatory | Estructural |
| La cantidad pedida no supera el combustible del pellet | `assert` en `Provide` | Explícita |
| El datum se preserva | El cuerpo recrea el pellet con los mismos campos salvo cantidades | Estructural |

### Asteria validator

| Regla original | Mecanismo en Canton | Tipo |
| --- | --- | --- |
| `AddNewShip` suma la tarifa al `AsteriaUtxo` | `MintShip` actualiza el pozo, en la fase 2 al verificar el pago | Explícita |
| El `AdminToken` sigue en el output | `Game` y `PrizePool` recreados con `admin` como signatory | Estructural |
| El contador de naves sube en 1 | `Game.RegisterShip` devuelve el número de serie | Explícita |
| `Mine` reduce el pozo como máximo `MAX_ASTERIA_MINING` por ciento | `assert` y cálculo en `Payout` | Explícita |
| El `ShipToken` está en un input | `Mine` está controlado por `pilot` y verifica la posición | Autorización |
| `ConsumeAsteria` exige el `AdminToken` en una wallet | `ConsumeGame` controlado por `admin` | Autorización |

### Shipyard policy

| Regla original | Mecanismo en Canton | Tipo |
| --- | --- | --- |
| El `AsteriaUtxo` está en un input | `MintShip` se ejerce sobre el `Shipyard` y actualiza el `Game` | Estructural |
| Se mintean `ShipToken`, `PilotToken` y `INITIAL_FUEL` | Se crea la nave con `fuel = INITIAL_FUEL` y, si se quieren, los contratos de token | Estructural |
| El nombre del `ShipToken` es `SHIP` más el contador | `serial` sale de `RegisterShip` | Explícita |
| La posición inicial respeta `MIN_ASTERIA_DISTANCE` | `assert` en `MintShip` | Explícita |
| El `ShipState` output tiene solo `ShipToken`, combustible y ADA | Desaparece: no hay valor adjunto | Estructural |
| `BurnShip` quema un token de la policy | Archivar la nave en `Quit` o `Mine` | Estructural |

### Fuel policy

| Regla original | Mecanismo en Canton | Tipo |
| --- | --- | --- |
| `MintFuel` exige el `AdminToken` y mintea `FUEL` | `fuel` es un campo que se inicializa en `MintShip` y que sube con `GatherFuel` | Decisión del port |
| `BurnFuel` quema `FUEL` | El campo se descuenta en `Move` | Decisión del port |

## Diferencias de portabilidad y motivación

Cada diferencia se presenta con la misma estructura: cómo se resolvía en Cardano, por qué se resolvía así, cómo se resuelve en Canton, por qué cambia y qué impacto tiene sobre las mecánicas del juego.

### Cambios forzados por la plataforma

#### 1. Validadores y policies → templates y choices

**En Cardano:** la transacción se construye fuera de la cadena y los validadores la inspeccionan. Son funciones puras que reciben el datum, el redeemer y el contexto de la transacción, y devuelven si el gasto se permite o no.

**Motivación en Cardano:** en el modelo eUTxO la validación tiene que ser determinista y local al UTxO. El ledger no ejecuta lógica en nombre del contrato, solo verifica la que el emisor ya armó, lo que permite validar transacciones fuera de la cadena y procesarlas en paralelo.

**En Canton:** el choice define las consecuencias de una acción. La transacción se construye dentro del contrato, y el ledger verifica autorizaciones en lugar de inspeccionar una transacción armada afuera.

**Motivación en Canton:** la autorización por party y la privacidad por vistas exigen que cada sub-acción tenga autorizantes identificables. Construir la transacción desde el contrato garantiza que solo ocurran las transiciones que el template declara. Como efecto secundario, muchos chequeos del original dejan de existir: reglas como "el input es el único script input" o "no se mintean otros tokens" son estructurales en Daml, porque no hay una transacción arbitraria que pueda violarlas.

**Impacto en el juego:** ninguno. Cambia dónde se escribe la lógica, no lo que la lógica permite.

#### 2. Datum y redeemer → campos y argumentos del choice

**En Cardano:** el datum es el estado adjunto al UTxO, el redeemer es la intención del gastador y el contexto es la transacción completa.

**Motivación en Cardano:** el modelo UTxO necesita estado identificable por output y lógica evaluable de forma local y pura.

**En Canton:** los campos del contrato son el datum y los argumentos del choice son el redeemer. El contexto queda limitado a lo que el cuerpo del choice consulta con `fetch` y `exercise`.

**Motivación en Canton:** el estado vive en el contrato y los tipos se verifican en compilación. El participant ejecuta la lógica, y el acceso al contexto se limita para no romper la privacidad.

**Impacto en el juego:** ninguno.

#### 3. Emisión de tokens → contratos y choices

**En Cardano:** las minting policies controlan la acuñación de naves, pilotos y combustible. La policy id identifica el activo y su hash actúa como identidad global.

**Motivación en Cardano:** el ledger tiene activos nativos de primera clase, con identidad criptográfica y sin custodia de un contrato externo.

**En Canton:** no hay multi-asset nativo. Emitir un token es crear un contrato, y la autorización de creación viene de los signatories. La policy se convierte en un contrato emisor, el `Shipyard`, con choices controladas.

**Motivación en Canton:** los activos se representan como contratos para preservar la privacidad y la autorización. La legitimidad de un token viene de quién puede firmar su creación.

**Impacto en el juego:** ninguno. En la fase 2, el token estándar CIP-0056 agrega interfaces comunes de transferencia.

#### 4. `AdminToken` → party administradora y `gameId`

**En Cardano:** un token centinela marca los UTxOs legítimos del juego y parametriza los validadores, lo que permite tener varias versiones del juego.

**Motivación en Cardano:** en eUTxO no hay namespaces ni identidad de contrato. Un token es la forma canónica de distinguir instancias y atar la lógica a una versión.

**En Canton:** la party admin es la autoridad y `gameId` agrupa las instancias. Un contrato es legítimo cuando el admin es signatory.

**Motivación en Canton:** la identidad y la autorización son nativas. Un token centinela sería redundante porque la firma del admin ya prueba la legitimidad.

**Impacto en el juego:** ninguno.

#### 5. Rango de validez → `getTime`

**En Cardano:** la transacción declara un rango de validez. El validador calcula la velocidad como distancia dividida por la diferencia entre el límite superior y el último movimiento, y usa el límite inferior para evitar replays.

**Motivación en Cardano:** no hay un reloj global confiable. El rango acota la ejecución y hace determinista la validación temporal, además de permitir al emisor elegir una ventana cómoda.

**En Canton:** el emisor no elige la ventana. El synchronizer asigna el tiempo del ledger, que crece de forma monótona por causalidad, y `getTime` lo expone en el choice. La velocidad se calcula como distancia dividida por el tiempo transcurrido desde `lastMoveTime`.

**Motivación en Canton:** el tiempo lo fija la infraestructura y no el emisor, lo que elimina la ambigüedad de los rangos y la posibilidad de elegir un límite conveniente. El costo es que `getTime` ata la preparación y el envío de la transacción a una ventana de aproximadamente un minuto, aceptable para un bot que firma y envía de inmediato. Para flujos con firmas externas existen las aserciones de tiempo del ledger, que no tienen esa restricción.

**Impacto en el juego:** la regla de velocidad se conserva. Cambia la fuente del tiempo y desaparece la carrera por elegir el límite superior del rango.

#### 6. Ledger público → observers

**En Cardano:** todos los UTxOs son visibles para cualquiera. El tablero completo es público y cualquier bot puede leer posiciones, pellets y premios sin permisos.

**Motivación en Cardano:** transparencia y verificabilidad global del ledger.

**En Canton:** la visibilidad es por stakeholders. Cada contrato declara signatories y observers, y quien no está en esas listas no ve nada. Para reproducir la grilla pública hay que agregar a los jugadores y a una party observadora del operador en cada contrato.

**Motivación en Canton:** la privacidad es parte del protocolo y no una capa agregada. La contrapartida es que la publicidad hay que declararla: sin observers, cada jugador solo vería sus propias naves.

**Decisión del port:** cada contrato guarda una lista `observers` con los jugadores registrados al momento de su creación, más la party del operador que indexa la partida. La party del operador garantiza que el estado completo siempre sea agregable fuera de la cadena. Limitación conocida: un jugador que se registra después no ve los contratos creados antes, salvo a través del índice del operador. La alternativa, usar solo la party del operador como observadora, centraliza la lectura y se aleja del original. La alternativa de recrear contratos para sumar observers al registrar un jugador agrega escrituras y complejidad.

La implementación confirmó un límite importante de este punto: la autorización se propaga de un contrato a otro, pero la visibilidad no. Para que un piloto pueda ejercer `MintShip`, `GatherFuel` o `Mine`, el `Game`, el `Shipyard`, el `Pellet` y el `PrizePool` tienen que incluirlo entre sus observers. Sin eso, la transacción se rechaza aunque el choice esté controlado por el piloto, porque el contrato que se ejerce no es visible para las parties actuantes. La propagación de autoridad alcanza para las consecuencias de un choice, no para divulgar el contrato de origen.

**Impacto en el juego:** la grilla puede seguir siendo pública si el operador la sirve. Los jugadores conectados desde el inicio ven todo directamente.

#### 7. min-ADA y ADA bloqueado → sin mínimo y traffic fees

**En Cardano:** cada output debe llevar un mínimo de ADA. El `AsteriaUtxo` acumula el ADA de las entradas y el pozo es una cantidad real bloqueada en el UTxO.

**Motivación en Cardano:** el min-ADA evita outputs con valor insignificante y paga el costo de almacenamiento del ledger. El valor nativo se mueve como parte del balance de la transacción.

**En Canton:** no hay min-ADA ni valor adjunto a un contrato. Los costos se pagan como traffic por transacción, según tamaño, cómputo y demanda.

**Motivación en Canton:** la persistencia no se paga con valor bloqueado. El costo de uso se cobra aparte, y por eso el pozo no puede vivir dentro del estado del juego.

**Impacto en el juego:** el pozo deja de acumularse solo. La tarifa de entrada que en el original engrosaba el premio requiere una transferencia explícita, que en la fase 1 no aplica y en la fase 2 se paga en Canton Coin.

#### 8. Premio en ADA → contabilidad y pago con tokens

**En Cardano:** el premio es el campo `value` del `AsteriaUtxo`. Pagar es restar del output del juego y sumar al output del ganador, todo en la misma transacción y sin custodia intermedia.

**Motivación en Cardano:** el valor nativo es parte del balance de la transacción; la aritmética de outputs resuelve el pago.

**En Canton:** el valor es una tenencia. En la fase 1 el `PrizePool` lleva la contabilidad en el campo `pot` y el pago emite `GameToken` al ganador. En la fase 2 el pozo es una tenencia de Canton Coin y el pago usa el workflow del token estándar, con transferencia directa o instrucción aceptada.

**Motivación en Canton:** un contrato no puede tener valor nativo adjunto. Los activos son contratos y su transferencia tiene autorización y workflow propios.

**Impacto en el juego:** la matemática del premio es idéntica. Cambia el mecanismo de pago y, en la fase 2, aparecen requisitos operativos como la pre-aprobación de la party del pozo o el uso de instrucciones de transferencia.

#### 9. Contención de UTxO → orden del sequencer

**En Cardano:** si dos transacciones gastan el mismo UTxO, la que entra primero en el bloque gana y la otra falla. La contención es una propiedad estructural del modelo.

**Motivación en Cardano:** el gasto único de cada output previene el doble gasto y permite procesar en paralelo las transacciones que no comparten inputs.

**En Canton:** el sequencer fija un orden total y la transacción que intenta consumir un contrato ya archivado es rechazada. No hay mempool público, así que los bots no pueden ver transacciones pendientes.

**Motivación en Canton:** la garantía anti doble gasto se conserva sin exponer datos. La privacidad elimina el front-running basado en transacciones pendientes visibles, y eso cambia la estrategia de los bots, no las reglas.

**Impacto en el juego:** la carrera por un pellet se resuelve igual, uno gana y el otro reintenta. Desaparece la lectura del mempool.

#### 10. `PilotToken` → autorización por party

**En Cardano:** el `PilotToken` presente en un input prueba que quien gasta la nave es el piloto autorizado.

**Motivación en Cardano:** en eUTxO la identidad se expresa con tokens y llaves dentro de los inputs. Los scripts no tienen un concepto nativo de party firmante.

**En Canton:** los choices de la nave están controlados por la party `pilot`, y el ledger exige su autorización. El token deja de ser necesario.

**Motivación en Canton:** la autorización por party es nativa. El mismo mecanismo, combinado con la propagación de autoridad, permite que el piloto dispare acciones sobre contratos firmados por el admin sin que el admin esté en línea.

**Impacto en el juego:** ninguno. Si se quiere que la licencia de piloto sea transferible, se modela con un contrato `PilotRight`, que queda fuera de la fase 1.

#### 11. Hash de script inmutable → paquete Daml actualizable

**En Cardano:** el script se referencia por hash y su lógica no cambia. Actualizar el juego implica publicar un script nuevo y migrar los UTxOs.

**Motivación en Cardano:** la inmutabilidad del código y su auditabilidad por hash.

**En Canton:** los paquetes Daml se actualizan mediante soft forks. Un DAR nuevo puede cambiar el comportamiento de contratos ya desplegados, porque la plataforma permite actualizar el código sin migrar el estado.

**Motivación en Canton:** permitir correcciones y evolución sin migrar el estado. La contrapartida es que hay que fijar una política de versiones y tratar cada actualización como un cambio auditable.

**Impacto en el juego:** ninguno en las mecánicas, pero cambia la garantía de inmutabilidad y obliga a versionar el paquete.

#### 12. Contract keys no soportadas

**En Cardano:** no aplica. La identidad del UTxO es la referencia al output y no existen claves globales.

**En Canton:** el modelo tiene contract keys, pero no están soportadas en los despliegues de Canton Network. La unicidad del número de serie se resuelve con el contador del `Game`, que era exactamente el mecanismo del original.

**Motivación en Canton:** es una limitación de la plataforma, no una decisión de diseño. El contador preserva la mecánica sin depender de claves.

**Impacto en el juego:** ninguno.

### Decisiones del port

#### 13. Combustible como campo del `Ship`

**En Cardano:** el combustible es un token nativo con su propia policy. Se mintea con la nave, se gasta al mover y se recupera al juntar.

**Motivación en Cardano:** los tokens nativos son baratos de usar, transferibles y el modelo de valor del UTxO maneja cantidades sin contratos extra.

**En Canton:** el combustible es un campo entero del `Ship` que se descuenta al mover y se incrementa al juntar.

**Motivación en Canton:** evita crear un contrato de token por cada operación y elimina la custodia de un activo que el juego solo usa como contador. El juego no necesita que el combustible sea transferible. La alternativa, un token CIP-0056, se descartó para la fase 1 y queda documentada por si se quiere un mercado de combustible o pagar movimientos con tokens.

**Impacto en el juego:** ninguno. Cambia el modelo de datos, no las reglas.

#### 14. Financiación del pozo y pago de entrada

**En Cardano:** `SHIP_MINT_LOVELACE_FEE` se suma al value del `AsteriaUtxo` en la misma transacción que crea la nave. El pozo se financia solo con cada minteo.

**Motivación en Cardano:** ADA es la moneda nativa y la tarifa es una transferencia de valor dentro de la misma transacción.

**En Canton fase 1:** no hay tarifa. El admin financia el pozo con `GameToken` al crear el juego. Evita el problema de circularidad de pedir una moneda de juego que todavía no existe para los jugadores nuevos.

**En Canton fase 2:** la tarifa se paga en Canton Coin con el token estándar. Verificar el pago dentro de `MintShip` requiere un diseño adicional, porque el cuerpo del choice no puede inspeccionar acciones ajenas. Las opciones son una instrucción de transferencia que el `Shipyard` acepta como parte del minteo, o un flujo de propuesta y aceptación con automatización del admin. Queda como pregunta abierta.

**Motivación en Canton:** en la fase 1 no hay valor real en juego y la contabilidad alcanza. En la fase 2, la transferencia de valor tiene autorización y workflow propios que no se pueden verificar mirando el balance de una transacción.

**Impacto en el juego:** en la fase 1 el pozo no crece con cada nave, así que el premio depende de la financiación inicial del admin. Es la diferencia más visible respecto del original y desaparece en la fase 2.

#### 15. Visibilidad de naves configurable (`shipObservers`)

**En Cardano:** todos los UTxOs son públicos; cualquier observador del tablero ve las naves.

**Motivación en Cardano:** el modelo eUTxO no tiene visibilidad selectiva, y el juego original asume que todos los bots ven la grilla completa.

**En Canton:** el `Shipyard` define dos listas: `observers` (quién ve el shipyard y puede ejercer `MintShip`) y `shipObservers` (quién ve cada nave). `MintShip` copia `shipObservers` al crear el `Ship`; el admin y el piloto siempre la ven porque son signatories.

**Motivación en Canton:** con el default `shipObservers = observers` la grilla queda pública, fiel al original (diferencia 6). Pasar `shipObservers = []` deja cada nave visible solo para su piloto y el admin, lo que permite demostrar la privacidad por party sin tocar los templates. La alternativa, fijar los observers por piloto dentro del `Ship`, se descartó porque el `Shipyard` es único y no puede tener observers distintos por nave.

**Impacto en el juego:** en modo privado los jugadores no ven las naves rivales, así que se pierde la estrategia de persecución del original. Es una opción de demostración: `setup` usa el tablero público salvo `--private-ships`.

## Riesgos y preguntas abiertas

- **Pago en Canton Coin.** Falta definir el mecanismo exacto para que el pozo pague al ganador y para verificar la tarifa de entrada dentro del minteo. Las dos opciones son instrucciones de transferencia y flujos de propuesta y aceptación.
- **Costo de traffic.** Un bot que mueve cada pocos segundos paga traffic por cada transacción. Hay que medir el costo real de un `Move` y compararlo con el fee de Cardano.
- **Ventana de `getTime`.** Los bots deben preparar y enviar cada movimiento dentro de la ventana de aproximadamente un minuto. Es holgado para un bot automatizado, pero hay que verificarlo bajo carga y con varios participantes.
- **Observers y privacidad.** La lista de observers crece con cada jugador y queda fija en cada contrato. Hay que definir si el operador indexa la partida o si se recrean contratos al registrar jugadores.
- **Conflictos concurrentes.** Falta validar el comportamiento de dos naves que juntan el mismo pellet en el mismo instante y el mensaje de error que recibe la que pierde.
- **Actualizaciones del paquete.** Un DAR nuevo puede cambiar el comportamiento de contratos existentes. Hay que definir la política de upgrades antes de desplegar.
- **Autoridad propagada.** El diseño depende de que las choices sobre contratos de la nave hereden la autoridad del admin. Es el mecanismo central del port y conviene escribir tests específicos que lo cubran, incluidas las rutas no autorizadas.

## Fuentes

- [Asteria: diseño original](https://github.com/txpipe/asteria/blob/main/onchain/docs/design/design.md)
- [Asteria: README](https://github.com/txpipe/asteria/blob/main/README.md)
- [Canton: modelo de autorización](https://docs.canton.network/appdev/modules/m3-authorization)
- [Canton: choices](https://docs.canton.network/appdev/modules/m3-choices)
- [Canton: manejo del tiempo](https://docs.canton.network/appdev/modules/m3-working-with-time)
- [Canton: modelo de ledger](https://docs.canton.network/overview/learn/ledger-model)
- [Canton: arquitectura](https://docs.canton.network/overview/learn/architecture)
- [Canton: modelo de privacidad](https://docs.canton.network/overview/learn/privacy-model)
- [CIP-0056: token standard](https://docs.canton.network/overview/reference/cip-0056)
