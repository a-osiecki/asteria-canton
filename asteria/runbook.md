# Runbook de Asteria en Canton

Ayuda memoria del PoC: qué corre, dónde vive cada cosa, cómo se levanta de cero y qué aprendimos. Para el diseño del port y el checklist de paridad ver [`design-canton.md`](./design-canton.md) y [`plan-implementacion.md`](./plan-implementacion.md).

## 1. Qué es y estado actual

Asteria es un juego de grilla sobre ledger: naves que se mueven gastando combustible, pellets que lo recargan y un pozo que se mina al llegar al centro. El original es de TxPipe sobre Cardano (eUTxO); este PoC implementa las mismas mecánicas en Daml/Canton.

Funcionando hoy:

- Contratos Daml en `asteria/daml/` con 33 tests verdes (`dpm test`).
- Devnet LocalNet dockerizada (`asteria/devnet/`): `canton` y `postgres` sanos, `splice` healthy.
- DAR subido a los dos participantes y partida jugable.
- Wallets de los validators con Canton Coin (faucet + transferencia entre `app-provider` y `app-user`).
- Explorer web de las transacciones del juego.
- CLI en TypeScript con modo interactivo (`play`), update IDs por comando y visor `tx`.

Commits clave:

| Commit | Qué hizo |
| --- | --- |
| `344d7f5` | Party hint en formato `<company>-<role>-<number>` (destrabó splice) |
| `eaf1c10` | `wallet.sh`: saldo, faucet y transferencias de CC |
| `150da6b` | Modo interactivo del CLI (`play`) |
| `1473039` | `reset` del CLI (archiva la partida) |
| `3ea3594` | nginx solo enruta las UIs de wallet; puertos 2001/3001/4001 |
| `5c5fb4f` | UIs de wallet por https en Codespaces |
| `b8b8df1` | Update ID en cada comando + `asteria tx <id>` |
| `abc8560` | Body anidado de `submit-and-wait-for-transaction` |
| `9a229e9` | Explorer web de Asteria |
| `bb12062` | Explorer con inputs consumidos y outputs creados |
| `4255d67` | `start.sh`: bootstrap en un comando |

## 2. Arranque y persistencia

### Comandos

```bash
scripts/start.sh          # destructivo: reset + core + DAR + UIs + wallets + partida nueva
scripts/start.sh --keep   # no resetea: levanta y verifica lo existente
scripts/down.sh           # detiene, conserva volumenes
scripts/reset.sh          # detiene y borra volumenes
```

`start.sh` destructivo hace: `reset.sh`, `up.sh`, espera health de `splice` (hasta 10 min), `bootstrap-dar.sh`, `up-ui.sh`, `wallet.sh tap all`, `wallet.sh preapproval app-user`, `init` + `setup` del CLI, e imprime URLs.

### Qué persiste al apagar el Codespace

| Cosa | Persiste | Nota |
| --- | --- | --- |
| Workspace (repo, `dist/`, `asteria-state.json`) | Sí | disco del Codespace |
| Imágenes Docker | Sí | no se re-descargan |
| Volumen de Postgres (ledger, wallets, partida) | Sí | `reset.sh` lo borra |
| Contenedores corriendo | No | `postgres` y las wallet UIs no tienen `restart: always`; `canton`, `splice` y `nginx` sí |
| Port forwarding | Se re-descubre | la visibilidad configurada se recuerda |

Riesgo único: GitHub borra los Codespaces parados por inactividad (30 días por defecto).

## 3. Arquitectura

### Contenedores

| Servicio | Imagen | Rol | Puertos publicados |
| --- | --- | --- | --- |
| `postgres` | postgres:14 | Base multi-database (participants, validator apps, scan, sv) | 5432 |
| `canton` | canton:0.6.11 | 3 participants + sequencer + mediator (un JVM) | 2901/2902/2975, 3901/3902/3975, 4901/4902/4975 |
| `splice` | splice-app:0.6.11 | Un JVM con 4 apps: validator app-user, validator app-provider, scan, sv | 2903, 3903, 4903 |
| `nginx` | nginx:1.27.0 | Reverse proxy de UIs y APIs, y sirve el explorer | 2001, 3001, 4001, 2002 |
| `wallet-web-ui-app-user` | wallet-web-ui:0.6.11 | Wallet web del validator app-user | interno |
| `wallet-web-ui-app-provider` | wallet-web-ui:0.6.11 | Wallet web del validator app-provider | interno |
| `wallet-web-ui-sv` | wallet-web-ui:0.6.11 | Wallet web del SV (lo arranca nginx como dependencia) | interno |

Las UIs de ANS, SV web, Scan web y Swagger están en el compose vendorizado pero no se levantan; los vhosts de nginx que las referenciaban se recortaron para que nginx no muera por upstreams inexistentes.

### Flujo

```
navegador ──▶ proxy de Codespaces ──▶ nginx
                                       ├── 2001 ─▶ wallet-web-ui-app-user
                                       ├── 3001 ─▶ wallet-web-ui-app-provider
                                       ├── 4001 ─▶ wallet-web-ui-sv / estático
                                       └── 2002 ─▶ explorer (estático) + /v2 ─▶ canton

CLI (node) ──▶ JSON API 2975/3975 ──▶ canton ──▶ postgres (volumen)
```

### Configuración

- `devnet/.env`: `PARTY_HINT`, `IMAGE_TAG`, `PACKAGE_ID`, `DAR_RELATIVE`, puertos UI (`2001/3001/4001/2002`), `SPLICE_APP_UI_HTTP_URL=false`.
- `devnet/localnet/`: módulo LocalNet vendorizado (compose, env, confs de canton/splice/nginx, `resource-constraints.yaml` con límites de memoria y heap).
- `devnet/localnet/compose.yaml`: se mantienen los perfiles `app-provider`, `app-user` y `sv`; `up.sh` solo levanta `postgres canton splice`.

### Identidades

- Party hint del devnet: `asteria-localparty-1`. Los validators derivan `app_user_asteria-localparty-1` y `app_provider_asteria-localparty-1`.
- Parties del CLI (las crea `init` por JSON API): `asteria-admin` (app-provider) y `asteria-pilot` (app-user).
- Los namespaces (`::1220...`) cambian con cada `reset`; no hardcodear IDs.

## 4. Fuente de verdad del estado

El CLI **no** lee SQL: el grid sale del ledger. `gridCommand` consulta `POST /v2/state/active-contracts` en el JSON API con filtro de template `Ship`/`Pellet` y arma la grilla con el `createArgument` de cada contrato.

- `asteria-state.json` solo guarda el package ID y los IDs de las parties; no hay estado de partida.
- Postgres es el almacenamiento interno del participant. No es la interfaz del juego.
- El "tip" es un **offset** (`GET /v2/state/ledger-end`), no hay altura de bloque; cada participante reporta el suyo.
- El estado completo de una nave está en su contrato activo (posición, fuel, serial, `lastMoveTime`, config). Con la ACS se restituye el tablero sin persistir nada aparte.
- El historial sale de `/v2/updates`; sobre ese stream se construyen los índices (Scan en Splice, PQS en Canton). Son índices derivados, no fuente de verdad.
- Privacidad: solo ves los contratos donde tu party es stakeholder. `asteria-pilot` es observer de `Game`, `PrizePool`, `Shipyard` y `Pellet`, y signatory de `Ship`, por eso ve todo el tablero.
- En este devnet todo vive en un participant + su volumen: `reset -v` borra y no hay de dónde recuperar. En una red real, una party puede releer sus contratos desde el synchronizer u otros participants.

## 5. Páginas web

| Puerto | Página | Qué muestra |
| --- | --- | --- |
| 2001 | Wallet `app-user` | Saldo e historial de CC del validator app-user |
| 3001 | Wallet `app-provider` | Saldo e historial de CC del validator app-provider |
| 2002 | Asteria Explorer | Transacciones del juego con detalle tipo UTxO |

### Wallets

- El `config.js` lo genera el entrypoint de la imagen al arrancar; con `SPLICE_APP_UI_HTTP_URL=false` la URL del validator API va por https (necesario en Codespaces) y con `true` por http (servidor con HTTP plano).
- Auth: `hs-256-unsafe`, secreto `unsafe`, audiencia `https://canton.network.global`. La wallet lista transferencias de CC, taps, y como `unknown` (con `template_id` + `choice`) la actividad Daml de su party que no reconoce.
- Las transacciones del juego **no** aparecen si las juega otra party: la wallet solo ve lo suyo.

### Explorer

- Página estática servida por nginx en `devnet/explorer/index.html`; consulta `/v2/updates/get-updates-page` del participant de app-user a través del mismo nginx.
- Genera el JWT en el navegador con WebCrypto y el secreto `unsafe` (funciona en https o localhost).
- Pide `TRANSACTION_SHAPE_LEDGER_EFFECTS` con `verbose: true` y filtra por la party elegida (`asteria-pilot` por defecto).
- Cada update se muestra con offset, record time y update ID; y cada transacción como cajas: **consumidos** (rojo, `ExercisedEvent` consuming), **creados** (verde, `CreatedEvent` con su `createArgument`), y acciones no consumidoras (azul). Los desplegables muestran `choiceArgument`, `exerciseResult`, signatories y observers.
- Se refresca cada 5 segundos.
- Acepta `?party=<hint>` en la URL (por ejemplo `?party=asteria-pilot-2`) para abrir la vista de un jugador; al cambiar el selector, la URL se actualiza.

## 6. CLI

En `asteria/cli/`. Build: `npm ci && npm run build`; ejecución: `node dist/index.js <comando>`.

| Comando | Qué hace |
| --- | --- |
| `status` | ledger-end y packages de cada participante |
| `init` | crea/reutiliza `asteria-admin` y `asteria-pilot` y les da derechos |
| `setup` | crea `Game`, `PrizePool`, `Shipyard` y un pellet en (5,5) |
| `reset` | archiva nave/s, pozo, juego, pellet y shipyard (para rehacer `setup`) |
| `mint [x] [y]` | mintea una nave (default 10,10) |
| `move <dx> <dy>` | mueve la nave |
| `gather <n>` | junta combustible del pellet en la posición de la nave |
| `mine` | mina el pozo si la nave está en (0,0) |
| `quit` | archiva la nave |
| `grid` | dibuja la grilla desde la ACS |
| `tx <updateId>` | muestra offset, record time y eventos del update |
| `play` / `repl` | modo interactivo; acepta el prefijo `asteria`, `help` y `exit` |

Detalles que importan:

- Estado en `asteria-state.json` del directorio donde corrés el comando.
- Template IDs con referencia por **nombre de paquete**: `#asteria-contracts:Asteria.Spacetime:Ship`.
- En el JSON API, `Int` y `Decimal` van como **string**.
- Cada comando que envía transacción imprime `tx: <updateId>`; `tx` lo busca con `POST /v2/updates/update-by-id` (primero como pilot, con fallback a admin).

### Multiparty

`init` crea el admin y N pilotos (default 2): `asteria-pilot-1..N`. Cada comando actúa sobre uno con `--as <n|hint>` y el estado guarda la lista en `asteria-state.json` (`pilots`).

```bash
asteria init 3
asteria setup
asteria mint 10 10 --as 1
asteria mint 12 12 --as 2
asteria move -5 -5 --as 1
asteria mine --as 2
```

- `setup` deja a todos los pilotos como observers de `Game`, `PrizePool`, `Shipyard` y `Pellet`, y `MintShip` copia la lista `shipObservers` del `Shipyard` a cada `Ship`: por defecto el tablero es público para los jugadores, como en el original.
- `setup --private-ships` deja `shipObservers = []`: cada nave la ven solo su piloto y el admin, y cada explorer muestra únicamente la nave propia más los contratos compartidos. Es el modo para demostrar privacidad real (diferencia 15 del design).
- Una party que no sea observer ve cero contratos y su explorer queda vacío: ahí se ve el corte de privacidad de Canton.
- Cada jugador puede tener su explorer con `http://localhost:2002/?party=asteria-pilot-2` (el selector también permite cambiarla y la URL se actualiza).
- `grid --as N` muestra el tablero desde la perspectiva de ese piloto (misma vista si es observer) y lista quién es dueño de cada nave.

## 7. Wallets y Canton Coin

```bash
scripts/wallet.sh status                 # party, onboarding y saldo
scripts/wallet.sh tap all                # faucet: 20.000 CC por wallet (el monto pedido se ignora)
scripts/wallet.sh preapproval app-user   # el receptor aprueba transferencias entrantes
scripts/wallet.sh send app-provider app-user 10.0
scripts/wallet.sh balance
```

- El envío usa `transfer-preapproval/send` contra la preapproval del receptor; `deduplication_id` único por 24 h.
- Los saldos se expresan como `effective_unlocked_qty` en decimal con 10 dígitos.
- La wallet API es la del validator (`/api/validator/v0/wallet`), separada de las parties del CLI.

## 8. Canton ↔ eUTxO

| eUTxO (Cardano) | Canton/Daml |
| --- | --- |
| Output UTxO = datum + value + script | `CreatedEvent` = `createArgument` (datum) + template + signatories/observers |
| Input UTxO gastado con redeemer | `ExercisedEvent` consuming sobre el contrato (`choiceArgument`) |
| Referencia `(txHash, índice)` | `ContractId` (hash con prefijo `00`) |
| Set global de UTxOs | ACS, privada por party |
| Value nativo en el UTxO | El contrato no lleva value; `pot`/`amount` son campos del datum |
| Redeemer | `choiceArgument` |
| Sin equivalente | `exerciseResult` (valor de retorno del choice) |
| Doble gasto por mempool + validadores | Lo corta el sequencer: el segundo ejercicio de un contrato archivado se rechaza |
| Todo público | Solo stakeholders (signatory/observer) ven el contrato |
| Lista plana de inputs/outputs | Árbol de eventos (ejercicios anidados, ej. `GatherFuel` → `Provide`) |

Identificadores: `ContractId` empieza con `00` y sigue el hash en hex; `updateId` y el namespace de las parties usan multihash (`12` = SHA-256, `20` = 32 bytes).

## 9. Endpoints

Auth de LocalNet: JWT HS256 con secreto `unsafe`, audiencia `https://canton.network.global`; el `sub` es el usuario (`ledger-api-user` para el CLI, `app-user`/`app-provider`/`sv` para las wallets).

### Participant JSON API (`/v2`, puertos 2975 app-user / 3975 app-provider)

| Endpoint | Para qué |
| --- | --- |
| `GET /v2/version` | versión y features del participant |
| `GET /v2/state/ledger-end` | último offset (el "tip") |
| `POST /v2/state/active-contracts` | ACS: contratos activos visibles para la party (grid del CLI) |
| `POST /v2/commands/submit-and-wait` | submit legacy (respuesta plana) |
| `POST /v2/commands/submit-and-wait-for-transaction` | submit y devuelve la transacción; body `{commands: {commands, commandId, actAs, readAs, userId}}` (CLI) |
| `POST /v2/updates/get-updates-page` | página de updates con `descendingOrder` y `maxPageSize` (explorer) |
| `POST /v2/updates` | stream de updates (histórico + live) |
| `POST /v2/updates/update-by-id` | update por ID (comando `tx`) |
| `GET /v2/packages` | package IDs vetados en el participant (`status`, `init`) |
| `POST /v2/packages` | subir un DAR (`application/octet-stream`) |
| `GET /v2/parties`, `POST /v2/parties` | listar y asignar parties (`init`) |
| `GET /v2/users/{user}`, `GET/POST /v2/users/{user}/rights` | usuario y derechos (`init`) |
| `GET /docs/openapi` | spec OpenAPI del participant |

### Validator Admin API (`/api/validator`, puertos 2903 app-user / 3903 app-provider / 4903 sv)

| Endpoint | Para qué |
| --- | --- |
| `GET /api/validator/readyz` | health (lo usa el healthcheck de splice) |
| `GET /api/validator/v0/wallet/user-status` | party, onboarding y si la wallet está instalada |
| `GET /api/validator/v0/wallet/balance` | saldo de CC |
| `POST /api/validator/v0/wallet/tap` | faucet (`{"amount": "100.0"}`; LocalNet da 20.000) |
| `POST /api/validator/v0/wallet/transfer-preapproval` | crea la preapproval del receptor |
| `POST /api/validator/v0/wallet/transfer-preapproval/send` | envía CC a una preapproval |
| `POST /api/validator/v0/wallet/transactions` | historial (`{"page_size": 10}`) |

Internos: `scan` escucha en 5012 (`/api/scan/...`) y `sv` en 5014 (`/api/sv/...`), dentro del contenedor `splice`.

### Curls para pegarle al JSON API

Preparación (una vez por terminal). `PORT=2975` es app-user; `3975` app-provider:

```bash
TOKEN=$(asteria/devnet/scripts/jwt.sh)
HOST=localhost
PORT=2975

PILOT=$(curl -s -H "Authorization: Bearer $TOKEN" http://$HOST:$PORT/v2/parties \
  | grep -oE '"party":"asteria-pilot[^"]*"' | head -1 | cut -d'"' -f4)
OFFSET=$(curl -s -H "Authorization: Bearer $TOKEN" http://$HOST:$PORT/v2/state/ledger-end \
  | grep -oE '[0-9]+' | head -1)
```

Lecturas:

```bash
# Version del participant
curl -s -H "Authorization: Bearer $TOKEN" http://$HOST:$PORT/v2/version | head -c 300

# Ultimo offset (el "tip")
curl -s -H "Authorization: Bearer $TOKEN" http://$HOST:$PORT/v2/state/ledger-end

# Parties
curl -s -H "Authorization: Bearer $TOKEN" http://$HOST:$PORT/v2/parties

# Packages (para ver si el DAR esta)
curl -s -H "Authorization: Bearer $TOKEN" http://$HOST:$PORT/v2/packages | head -c 400

# Derechos del usuario
curl -s -H "Authorization: Bearer $TOKEN" http://$HOST:$PORT/v2/users/ledger-api-user/rights

# Contratos activos (ACS) de asteria-pilot, todos los templates
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -X POST http://$HOST:$PORT/v2/state/active-contracts \
  -d "{\"eventFormat\":{\"filtersByParty\":{\"$PILOT\":{\"cumulative\":[{\"identifierFilter\":{\"WildcardFilter\":{\"value\":{}}}}]}},\"verbose\":true},\"activeAtOffset\":$OFFSET}" \
  | head -c 2000

# ACS solo de Ship
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -X POST http://$HOST:$PORT/v2/state/active-contracts \
  -d "{\"eventFormat\":{\"filtersByParty\":{\"$PILOT\":{\"cumulative\":[{\"identifierFilter\":{\"TemplateFilter\":{\"value\":{\"templateId\":\"#asteria-contracts:Asteria.Spacetime:Ship\"}}}}]}}},\"verbose\":true},\"activeAtOffset\":$OFFSET}"

# Pagina de updates (lo que usa el explorer), ultimos 5
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -X POST http://$HOST:$PORT/v2/updates/get-updates-page \
  -d "{\"updateFormat\":{\"includeTransactions\":{\"transactionShape\":\"TRANSACTION_SHAPE_LEDGER_EFFECTS\",\"eventFormat\":{\"filtersByParty\":{\"$PILOT\":{\"cumulative\":[{\"identifierFilter\":{\"WildcardFilter\":{\"value\":{}}}}]}},\"verbose\":true}}},\"maxPageSize\":5,\"descendingOrder\":true}" \
  | head -c 3000

# Un update por ID (lo que usa asteria tx)
UPDATE=1220...
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -X POST http://$HOST:$PORT/v2/updates/update-by-id \
  -d "{\"updateId\":\"$UPDATE\",\"updateFormat\":{\"includeTransactions\":{\"transactionShape\":\"TRANSACTION_SHAPE_LEDGER_EFFECTS\",\"eventFormat\":{\"filtersByParty\":{\"$PILOT\":{\"cumulative\":[{\"identifierFilter\":{\"WildcardFilter\":{\"value\":{}}}}]}},\"verbose\":true}}}}"

# Stream de updates (primeros 3)
curl -sN -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -X POST "http://$HOST:$PORT/v2/updates?limit=3" \
  -d "{\"beginExclusive\":0,\"updateFormat\":{\"includeTransactions\":{\"transactionShape\":\"TRANSACTION_SHAPE_LEDGER_EFFECTS\",\"eventFormat\":{\"filtersByParty\":{\"$PILOT\":{\"cumulative\":[{\"identifierFilter\":{\"WildcardFilter\":{\"value\":{}}}}]}},\"verbose\":true}}}}"

# Spec OpenAPI que sirve el participant
curl -s http://$HOST:$PORT/docs/openapi | head -5
```

Para escrituras, el body de `submit-and-wait-for-transaction` va anidado: `{"commands": {"commands": [...], "commandId": "...", "actAs": ["..."], "readAs": ["..."], "userId": "ledger-api-user"}}`.

## 10. Troubleshooting

| Síntoma | Causa | Fix |
| --- | --- | --- |
| `splice` reinicia cada ~85 s con `exit 1`; logs con `Initialization failed` | Party hint inválido (debe ser `<company>-<role>-<number>`, ej. `asteria-localparty-1`) | Corregir `PARTY_HINT` y recrear |
| `DbLockedConnection`, `RejectedExecutionException`, `ForkJoinPool` durante el arranque | Ruido del shutdown por otra falla, no la causa | Buscar el `Initialization failed` real (`docker logs --until`) |
| nginx en restart loop con `host not found in upstream ans-web-ui...` | El conf referencia UIs que no se levantan | Vhosts recortados a las UIs de wallet |
| La wallet web queda en blanco o no llama al API | `config.js` con `http://` en una página https (mixed content) | `SPLICE_APP_UI_HTTP_URL=false` y recrear las UIs |
| HTTP 401 o cartel de MetaMask al abrir la UI | Puerto privado del proxy / extensión del navegador | Visibilidad pública del puerto; probar en incógnito |
| `HTTP 400 Missing required field at 'commands.commands'` | Body plano en `submit-and-wait-for-transaction` | Anidar `JsCommands` (`abc8560`) |
| `INVALID_FIELD expected a package name` | Template ID por hash | Usar `#asteria-contracts:Modulo:Entidad` |
| Errores raros al leer contratos | `Int`/`Decimal` vienen como string | Normalizar con `Number()` |
| No se ve la línea de error en los logs | `--log-immediate-flush=false` | `docker logs --until <StartedAt>` y `docker events` |
| `KNOWN_PACKAGE_VERSION` al re-subir el DAR | Misma versión recompilada | `reset.sh` y volver a subir |
| Puerto 2000 ocupado en el Codespace | Otro proceso | Las UIs usan 2001/3001/4001/2002 |
| `DAML_FAILURE ... AssertionFailed` en `move`/`gather` | Regla del juego (poco combustible, posición incorrecta) | Leer el `exercise_trace`; no es un bug |

### Espacio en disco

Ver qué ocupa y limpiar sin tocar la partida:

```bash
df -h /
docker system df -v | head -40
sudo du -xh --max-depth=1 / 2>/dev/null | sort -h | tail -12
du -xh --max-depth=2 /workspaces 2>/dev/null | sort -h | tail -12

scripts/down.sh                   # corta el restart loop
docker container prune -f         # contenedores muertos
docker builder prune -f           # cache de builds
npm cache clean --force
rm -rf ~/.vscode-remote/data/logs/*
sudo journalctl --vacuum-size=50M 2>/dev/null
sudo apt-get clean
```

Los caches de Daml del repo suelen ser de los más grandes (el DAR está en `contracts/.daml/dist/`, eso no se borra):

```bash
du -sh asteria/daml/*/.daml asteria/cli/node_modules
```

Los logs de contenedor viven en `/var/lib/docker/containers/*/*-json.log`. Con los JVM en DEBUG y en restart loop, 10 horas pueden llenar los 32 GB del Codespace; `resource-constraints.yaml` limita cada contenedor a 50 MB x 3 archivos y splice loguea en INFO. `scripts/down.sh` borra los contenedores y con ellos sus logs.

Si hace falta más, se pueden borrar las imágenes (se re-descargan en el próximo `up.sh`, 10-20 min):

```bash
scripts/down.sh
docker system prune -a -f
```

Última opción, borra el ledger y la partida: `scripts/reset.sh` (equivale a `docker system prune --volumes` para este proyecto). Los caches de `.daml/` y `~/.dpm` también ocupan; el DAR está commiteado, así que se pueden borrar y recuperar con git.

## 11. Cheat sheet

```bash
# Devnet
scripts/start.sh | scripts/start.sh --keep
scripts/status.sh | scripts/diagnose.sh | scripts/down.sh | scripts/reset.sh
scripts/bootstrap-dar.sh [ruta.dar]
scripts/wallet.sh status | tap | balance | preapproval <wallet> | send <from> <to> <amount>
scripts/jwt.sh [sub] [aud]

# CLI
cd asteria/cli && npm run build
node dist/index.js play
node dist/index.js tx <updateId>

# Daml
export PATH="$HOME/.dpm/bin:$PATH"
cd asteria/daml && dpm build --all
cd asteria/daml/tests && dpm test

# Curls utiles
JU=$(scripts/jwt.sh app-user)
curl -s -H "Authorization: Bearer $JU" http://localhost:2903/api/validator/v0/wallet/balance
curl -s -H "Authorization: Bearer $JU" -X POST -H 'Content-Type: application/json' \
  -d '{"page_size":10}' http://localhost:2903/api/validator/v0/wallet/transactions
```

## 12. Pendientes

- Fase 2 del design: pozo en Canton Coin real (`MintShip` verifica el pago, `Payout` transfiere con token estándar).
- Observers públicos en los contratos del juego para que otras parties lean el estado.
- `asteria init --wallet`: jugar con las parties de los validators para que la actividad aparezca como `unknown` en la wallet web.
- Wallets por piloto: hoy la wallet de CC es la del validator (`app-user`/`app-provider`), no de cada piloto.
- Swagger UI contra los JSON APIs.
- Índice derivado (PQS o Scan) para explorar histórico sin tocar el participant.
- Tests del CLI y de `wallet.sh`.
