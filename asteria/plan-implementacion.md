# Plan de implementación de Asteria en Canton

## Objetivo y principios

Este documento describe cómo construir el PoC de Asteria en Canton por etapas. El alcance es on-chain: contratos Daml, tests y el checklist de paridad con el original en Aiken.

Los principios que gobiernan la implementación son cuatro:

1. **Codebase mínima.** Solo los templates y choices que el juego necesita. Sin helpers, capas de abstracción ni features que no estén en `design-canton.md`.
2. **Casi réplica del original.** Un módulo Daml por archivo Aiken, los mismos nombres de constantes y de choices, los mismos chequeos en el mismo orden de los validadores, y un test Daml Script por cada archivo de `validators/tests/`.
3. **Solo las diferencias del design.** Cada desvío respecto de Aiken está enumerado en `design-canton.md`. Nada se cambia por conveniencia durante la implementación.
4. **Trazabilidad.** Cada aserción lleva un comentario con la regla del validador original que implementa, para poder comparar los dos códigos lado a lado.

Fuera de alcance: bot off-chain, frontend, visualización, Canton Coin y despliegue en DevNet, TestNet o MainNet.

## Estructura de carpetas

La documentación de Canton recomienda separar los contratos de los tests en dos paquetes. El proyecto queda así:

```
asteria/
  design-canton.md
  plan-implementacion.md
  daml/
    multi-package.yaml
    contracts/
      daml.yaml
      daml/Asteria/Types.daml
      daml/Asteria/Utils.daml
      daml/Asteria/Asteria.daml
      daml/Asteria/Spacetime.daml
      daml/Asteria/Pellet.daml
    tests/
      daml.yaml
      daml/Test/MoveShip.daml
      daml/Test/MintShip.daml
      daml/Test/GatherFuel.daml
      daml/Test/ProvideFuel.daml
      daml/Test/MineAsteria.daml
      daml/Test/QuitShip.daml
      daml/Test/Asteria.daml
      daml/Test/ConsumePellet.daml
      daml/Test/GameFlow.daml
```

`multi-package.yaml`:

```yaml
packages:
  - ./contracts
  - ./tests
```

`contracts/daml.yaml`:

```yaml
sdk-version: <versión vigente, ver dashboard de compatibilidad>
name: asteria-contracts
source: daml
version: 0.1.0
dependencies:
  - daml-prim
  - daml-stdlib
```

`tests/daml.yaml`:

```yaml
sdk-version: <la misma que contracts>
name: asteria-tests
source: daml
version: 0.1.0
dependencies:
  - daml-prim
  - daml-stdlib
  - daml-script
data-dependencies:
  - ../contracts/.daml/dist/asteria-contracts-0.1.0.dar
```

El build se ejecuta desde la raíz con `dpm build --all`. Los tests se ejecutan desde `tests/` con `dpm test`, porque el comando necesita un `daml.yaml` de paquete y la raíz solo tiene `multi-package.yaml`.

## Mapa de archivos Aiken → Daml

| Archivo Aiken | Módulo Daml | Contenido |
| --- | --- | --- |
| `lib/asteria/types.ak` | `Asteria/Types.daml` | `ShipConfig`, constantes y tipos del juego |
| `lib/asteria/utils.ak` | `Asteria/Utils.daml` | `distance` y `requiredFuel` |
| `validators/asteria.ak` | `Asteria/Asteria.daml` | `Game`, `PrizePool`, `GameToken` |
| `validators/spacetime.ak` | `Asteria/Spacetime.daml` | `Ship` y `Shipyard` |
| `validators/pellet.ak` | `Asteria/Pellet.daml` | `Pellet`. La fuel policy desaparece (diferencia 13) |
| `validators/deploy.ak` | sin equivalente | El setup se hace desde los tests |

En Aiken, `spacetime.ak` contiene el validador de la nave y la policy del shipyard, y `pellet.ak` contiene el validador del pellet y la policy de fuel. Esa organización se conserva: `Spacetime.daml` contiene `Ship` y `Shipyard`, y `Pellet.daml` contiene `Pellet`.

## Convenciones

- Los nombres de constantes y de choices son los del original: `MAX_SPEED`, `INITIAL_FUEL`, `Move`, `GatherFuel`, `Provide`, `MintShip` y el resto.
- Cada `assert` va precedido por un comentario `-- Regla original:` con la regla del validador que implementa.
- El orden de los chequeos dentro de cada choice sigue el orden del validador original.
- Los tests usan los mismos escenarios que los archivos de `validators/tests/`.
- Los nombres de choices son únicos por módulo en Daml. Donde el original repite `Consume`, la implementación usa `ConsumeGame` y `ConsumePool`.
- La autorización se propaga entre contratos, pero la visibilidad no. Los contratos que un piloto necesita ejercer (`Game`, `Shipyard`, `Pellet` y `PrizePool`) tienen que incluirlo entre sus observers. Sin eso la transacción se rechaza aunque el choice esté controlado por el piloto.
- No se agregan campos, choices ni templates fuera de `design-canton.md`.

## Etapa 0: Entorno y esqueleto

**Objetivo:** dejar el proyecto compilando y con los tests corriendo en vacío.

**Tareas:**

1. Instalar `dpm` y un JDK compatible. La documentación pide Java 17 o superior; esta máquina tiene Java 26, así que si el compilador falla hay que instalar un JDK 17 o 21.
2. Crear la estructura de carpetas y los tres archivos de configuración de la sección anterior.
3. Fijar la versión del SDK en `dpm install`.
4. Verificar con `dpm build --all` desde `daml/` y `dpm test` desde `tests/`.

**Criterio de aceptación:** `dpm build --all` termina sin errores y `dpm test` no reporta fallos.

**Diferencias del design aplicadas:** ninguna.

## Etapa 1: Tipos y utilidades

**Archivos:** `Asteria/Types.daml`, `Asteria/Utils.daml`, `Test/Utils.daml`.

**Esqueleto de `Types.daml`:**

```haskell
module Asteria.Types where

data ShipConfig = ShipConfig with
  maxSpeed : Int
  maxFuel : Int
  fuelPerStep : Int
  initialFuel : Int
  minAsteriaDistance : Int
```

**Esqueleto de `Utils.daml`:**

```haskell
module Asteria.Utils where

-- Equivalente a utils.ak: distance
distance : Int -> Int -> Int
distance dx dy = abs dx + abs dy

-- Equivalente a utils.ak: required_fuel
requiredFuel : Int -> Int -> Int
requiredFuel dist fuelPerStep = dist * fuelPerStep
```

**Chequeos cubiertos:** matemática de distancia Manhattan y costo de combustible. El original también tiene `is_script_address`, que no tiene equivalente en Daml y no se implementa.

**Tests:** verificar `distance` con deltas positivos, negativos y mixtos, y `requiredFuel` con distintos valores.

**Diferencias aplicadas:** 2 (datum y redeemer pasan a campos y argumentos).

**Criterio de aceptación:** `dpm test` con los tests de utilidades en verde.

## Etapa 2: Game, PrizePool y GameToken

**Archivo:** `Asteria/Asteria.daml`, `Test/Asteria.daml`.

**Esqueleto:**

```haskell
module Asteria.Asteria where

-- Reemplaza el estado y el value del AsteriaUtxo
template Game
  with
    admin : Party
    gameId : Text
    shipCounter : Int
    shipMintFee : Decimal
    observers : [Party]
  where
    signatory admin
    observer observers

    -- Regla original (AddNewShip): el contador sube en 1
    choice RegisterShip : (Int, ContractId Game)
      controller admin
      do
        newCid <- create this with shipCounter = shipCounter + 1
        return (shipCounter + 1, newCid)

    choice ConsumeGame : ()
      controller admin
      do
        return ()

-- Reemplaza la parte de value del AsteriaUtxo
template PrizePool
  with
    admin : Party
    gameId : Text
    pot : Decimal
    maxAsteriaMining : Int
    observers : [Party]
  where
    signatory admin
    observer observers

    -- Regla original (Mine): el pozo se reduce como máximo MAX_ASTERIA_MINING%
    choice Payout : ContractId PrizePool
      with
        winner : Party
      controller admin
      do
        let payout = (pot * intToDecimal maxAsteriaMining) / 100.0
        create GameToken with issuer = admin, owner = winner, gameId, amount = payout
        create this with pot = pot - payout

    choice ConsumePool : ()
      controller admin
      do
        return ()

-- Token de juego de la fase 1
template GameToken
  with
    issuer : Party
    owner : Party
    gameId : Text
    amount : Decimal
  where
    signatory issuer
    observer owner

    choice Transfer : ContractId GameToken
      with
        newOwner : Party
      controller owner
      do
        create this with owner = newOwner
```

**Chequeos y tests:**

- Crear `Game`, `PrizePool` y `GameToken` solo con la firma del admin, y verificar que un tercero no puede crearlos.
- `RegisterShip` incrementa el contador y devuelve el serial.
- `Payout` descuenta el porcentaje correcto y emite el token al ganador.
- `ConsumeGame` y `ConsumePool` archivan los contratos.
- `Transfer` cambia el dueño del token.

**Equivalente en el original:** `validators/asteria.ak` (AddNewShip, Mine, ConsumeAsteria) más el value del `AsteriaUtxo`, y el test `asteria/consume.ak`.

**Diferencias aplicadas:** 3, 4, 7 y 8.

**Criterio de aceptación:** tests de la etapa en verde, incluidos los casos negativos de autorización (`submitMustFail`).

## Etapa 3: Ship y Move

**Archivo:** `Asteria/Spacetime.daml`, `Test/MoveShip.daml`.

**Esqueleto:**

```haskell
module Asteria.Spacetime where

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
        let dist = distance deltaX deltaY
        let cost = requiredFuel dist config.fuelPerStep
        -- Regla original: hay combustible suficiente
        -- Regla original: distancia / tiempo <= MAX_SPEED
        -- Regla original: se actualizan posicion, fuel y last_move_latest_time
        create this with
          posX = posX + deltaX
          posY = posY + deltaY
          fuel = fuel - cost
          lastMoveTime = now
```

**Chequeos y tests:**

- Movimiento válido actualiza posición, combustible y `lastMoveTime`.
- Sin combustible suficiente, falla.
- Velocidad por encima de `MAX_SPEED` según el tiempo transcurrido, falla.
- Un piloto distinto no puede mover la nave.
- El admin no puede archivar la nave por su cuenta.

**Equivalente en el original:** el handler `spend` de `spacetime.ak` para `MoveShip` y el test `spacetime/move_ship.ak`.

**Diferencias aplicadas:** 5, 10, 11 y 13.

**Criterio de aceptación:** tests de la etapa en verde.

## Etapa 4: Shipyard y MintShip

**Archivo:** `Asteria/Spacetime.daml`, `Test/MintShip.daml`.

**Esqueleto:**

```haskell
template Shipyard
  with
    admin : Party
    gameId : Text
    gameCid : ContractId Game
    config : ShipConfig
    observers : [Party]
  where
    signatory admin
    observer observers

    -- Reemplaza la ShipyardPolicy
    choice MintShip : ContractId Ship
      with
        pilot : Party
        posX : Int
        posY : Int
      controller pilot
      do
        now <- getTime
        -- Regla original: distancia a (0,0) >= MIN_ASTERIA_DISTANCE
        assert (distance posX posY >= config.minAsteriaDistance)
        -- Regla original: el nombre de la nave usa el contador
        (serial, gameCid2) <- exercise gameCid RegisterShip
        shipCid <- create Ship with
          admin
          pilot
          gameId
          serial
          posX
          posY
          fuel = config.initialFuel
          lastMoveTime = now
          config
          observers
        -- RegisterShip recrea el Game: se actualiza la referencia del Shipyard
        _ <- create this with gameCid = gameCid2
        return shipCid
```

**Chequeos y tests:**

- Posición inicial con distancia mayor o igual a `MIN_ASTERIA_DISTANCE`.
- El serial sale del contador del `Game` y el contador sube.
- La nave se crea con `INITIAL_FUEL` y `lastMoveTime` igual al tiempo del ledger.
- Un tercero no puede mintear una nave a nombre de otro.

**Equivalente en el original:** la policy `ShipyardPolicy` de `spacetime.ak` y los tests `shipyard/mint_ship.ak` y `asteria/add_new_ship.ak`.

**Diferencias aplicadas:** 3, 4, 6 y 14.

**Criterio de aceptación:** tests de la etapa en verde.

## Etapa 5: Pellet, Provide y GatherFuel

**Archivo:** `Asteria/Pellet.daml`, `Test/GatherFuel.daml`, `Test/ProvideFuel.daml`.

**Esqueleto:**

```haskell
module Asteria.Pellet where

template Pellet
  with
    admin : Party
    gameId : Text
    posX : Int
    posY : Int
    fuel : Int
    prize : Decimal
    observers : [Party]
  where
    signatory admin
    observer observers

    -- Regla original (Provide): la cantidad no supera el combustible del pellet
    -- Regla original (Provide): el datum se preserva salvo cantidades
    choice Provide : ContractId Pellet
      with
        recipient : Party
        amount : Int
        prizeAmount : Decimal
      controller admin
      do
        create this with
          fuel = fuel - amount
          prize = prize - prizeAmount

    choice Consume : ()
      controller admin
      do
        return ()
```

El choice `GatherFuel` se agrega al template `Ship`:

```haskell
    choice GatherFuel : ContractId Ship
      with
        pelletCid : ContractId Pellet
        amount : Int
        prizeAmount : Decimal
      controller pilot
      do
        pellet <- fetch pelletCid
        -- Regla original: misma posicion que el pellet
        -- Regla original: la carga resultante <= MAX_SHIP_FUEL
        pelletCid' <- exercise pelletCid Provide with recipient = pilot, amount, prizeAmount
        create this with fuel = fuel + amount
```

**Chequeos y tests:**

- Juntar combustible baja el pellet y sube la nave.
- Cantidad mayor al combustible del pellet, falla.
- Posición distinta a la del pellet, falla.
- Recarga por encima de `MAX_SHIP_FUEL`, falla.
- El pellet no se puede consumir desde una nave.

**Equivalente en el original:** el handler `spend` de `pellet.ak` para `Provide` y el handler `GatherFuel` de `spacetime.ak`, más los tests `pellet/provide.ak` y `spacetime/gather.ak`. Los tests `fuel/mint_fuel.ak` y `fuel/burn_fuel.ak` no tienen equivalente porque el combustible es un campo (diferencia 13).

**Diferencias aplicadas:** 6 y 13.

**Criterio de aceptación:** tests de la etapa en verde.

## Etapa 6: Mine, Payout y Quit

**Archivo:** `Asteria/Spacetime.daml`, `Test/MineAsteria.daml`, `Test/QuitShip.daml`.

**Esqueleto:**

```haskell
    -- Regla original (MineAsteria): la nave está en (0,0)
    choice Mine : ContractId PrizePool
      with
        poolCid : ContractId PrizePool
      controller pilot
      do
        assert (posX == 0 && posY == 0)
        exercise poolCid Payout with winner = pilot

    -- Regla original (Quit): se archiva la nave
    choice Quit : ()
      controller pilot
      do
        return ()
```

El choice `Payout` del `PrizePool` ya está definido en la etapa 2; en esta etapa se integra con `Mine`.

**Chequeos y tests:**

- Minar desde `(0, 0)` paga el porcentaje configurado y archiva la nave.
- Minar fuera del centro, falla.
- Un piloto no puede minar la nave de otro.
- `Quit` archiva la nave y no deja valor pendiente.
- El admin no puede archivar la nave de un piloto.

**Equivalente en el original:** el handler `MineAsteria` de `spacetime.ak` y el `Mine` de `asteria.ak`, y los tests `spacetime/mine_asteria.ak`, `spacetime/quit.ak`, `shipyard/burn_ship.ak` y `asteria/mine.ak`.

**Diferencias aplicadas:** 8 y 10.

**Criterio de aceptación:** tests de la etapa en verde.

## Etapa 7: Consumos del admin, partida completa y checklist

**Archivo:** `Test/ConsumePellet.daml`, `Test/GameFlow.daml`.

**Tareas:**

1. Integrar los consumos del admin: `ConsumeGame` sobre `Game`, `ConsumePool` sobre `PrizePool` y `Consume` sobre `Pellet`, con la devolución del premio restante al admin.
2. Escribir la partida completa: crear el juego, crear un pellet, mintear una nave, moverla hasta el pellet, juntar combustible, llegar al centro, minar y abandonar.
3. Cubrir los caminos negativos de autorización que falten: crear un contrato del juego sin ser admin, mover una nave ajena, minar desde una posición incorrecta, consumir un pellet sin ser admin.
4. Completar el checklist de paridad y marcar cada fila con el test que la cubre.

**Equivalente en el original:** los tests `asteria/consume.ak` y `pellet/consume.ak`, más el flujo que los tests del original cubren por separado.

**Criterio de aceptación:** `dpm build --all` limpio y `dpm test` con todos los scripts en verde, incluida la partida completa.

## Checklist de paridad con el original

Cada regla del original se verifica en el módulo indicado y se cubre con el test indicado. La columna "Cambio" usa la clasificación de `design-canton.md`: estructural, explícita o autorización.

### Spacetime validator

| Regla original | Implementación | Test | Cambio |
| --- | --- | --- | --- |
| El `ShipState` input es el único script input | `Ship.Move` solo archiva y recrea la nave | MoveShip | Estructural |
| Hay un único `ShipState` output | El cuerpo de `Move` crea una nave | MoveShip | Estructural |
| El `PilotToken` está en un input | `Move` controlado por `pilot` | MoveShip | Autorización |
| Hay combustible suficiente | `assert` en `Move` | MoveShip | Explícita |
| Distancia / rango de validez no supera `MAX_SPEED` | `assert` con `getTime` y `lastMoveTime` | MoveShip | Explícita |
| La posición y el tiempo se actualizan | `create this with` en `Move` | MoveShip | Estructural |
| El combustible gastado se quema | `fuel = fuel - cost` | MoveShip | Estructural |
| En `GatherFuel`, hay dos script inputs | `Ship.GatherFuel` referencia el pellet | GatherFuel | Estructural |
| Posición del pellet igual a la de la nave | `assert` en `GatherFuel` | GatherFuel | Explícita |
| La carga no supera `MAX_SHIP_FUEL` | `assert` en `GatherFuel` | GatherFuel | Explícita |
| No se mintean tokens | No hay minteo; los tokens se crean en los choices definidos | GameFlow | Estructural |
| En `MineAsteria`, hay dos script inputs | `Ship.Mine` referencia el pozo | MineAsteria | Estructural |
| La nave está en `(0, 0)` | `assert` en `Mine` | MineAsteria | Explícita |
| `ShipToken` y combustible se queman | `Mine` es un choice de consumo | MineAsteria | Estructural |
| En `Quit`, el `ShipState` es el único script input | `Quit` solo toca la nave | QuitShip | Estructural |

### Pellet validator

| Regla original | Implementación | Test | Cambio |
| --- | --- | --- | --- |
| El `ShipToken` está en un input | `GatherFuel` controlado por `pilot` | GatherFuel | Autorización |
| El `AdminToken` está en el output | El pellet se recrea con `admin` signatory | ProvideFuel | Estructural |
| La cantidad no supera el combustible | `assert` en `Provide` | ProvideFuel | Explícita |
| El datum se preserva | `create this with` cantidades nuevas | ProvideFuel | Estructural |

### Asteria validator

| Regla original | Implementación | Test | Cambio |
| --- | --- | --- | --- |
| `AddNewShip` suma la tarifa al pozo | `MintShip` (fase 2) | MintShip | Explícita |
| El `AdminToken` sigue en el output | `Game` y `PrizePool` recreados con `admin` signatory | Asteria | Estructural |
| El contador sube en 1 | `Game.RegisterShip` | MintShip | Explícita |
| `Mine` reduce el pozo como máximo `MAX_ASTERIA_MINING`% | Cálculo en `PrizePool.Payout` | MineAsteria | Explícita |
| El `ShipToken` está en un input | `Mine` controlado por `pilot` | MineAsteria | Autorización |
| `ConsumeAsteria` exige el `AdminToken` | `ConsumeGame` controlado por `admin` | Asteria | Autorización |

### Shipyard policy

| Regla original | Implementación | Test | Cambio |
| --- | --- | --- | --- |
| El `AsteriaUtxo` está en un input | `MintShip` actualiza el `Game` | MintShip | Estructural |
| Se mintean `ShipToken`, `PilotToken` y `INITIAL_FUEL` | Nave con `fuel = INITIAL_FUEL` | MintShip | Estructural |
| El nombre usa el contador | `serial` sale de `RegisterShip` | MintShip | Explícita |
| La posición respeta `MIN_ASTERIA_DISTANCE` | `assert` en `MintShip` | MintShip | Explícita |
| `BurnShip` quema un token | `Quit` y `Mine` archivan la nave | QuitShip, MineAsteria | Estructural |

### Fuel policy

| Regla original | Implementación | Test | Cambio |
| --- | --- | --- | --- |
| `MintFuel` exige el `AdminToken` y mintea `FUEL` | `fuel` se inicializa en `MintShip` y sube con `GatherFuel` | MintShip, GatherFuel | Decisión 13 |
| `BurnFuel` quema `FUEL` | `fuel` se descuenta en `Move` | MoveShip | Decisión 13 |

## Fuera de alcance

- Bot off-chain y automatización de partidas.
- Frontend y visualización de la grilla.
- Canton Coin y pago real del premio (fase 2 de `design-canton.md`).
- `ShipToken` y `PilotRight` transferibles.
- Despliegue en DevNet, TestNet o MainNet.

## Referencias

- [Design de Asteria en Canton](./design-canton.md)
- [Asteria: repositorio original](https://github.com/txpipe/asteria)
- [Canton: SDK y herramientas](https://docs.canton.network/sdks-tools/overview)
- [Canton: modelo de autorización](https://docs.canton.network/appdev/modules/m3-authorization)
- [Canton: Daml Script](https://docs.canton.network/sdks-tools/cli-tools/daml-script)