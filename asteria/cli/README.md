# CLI de Asteria

Cliente de terminal para jugar contra la devnet. Usa el JSON Ledger API con el token HMAC que espera LocalNet.

## Build

```bash
cd asteria/cli
npm install
npm run build
```

## Uso

```bash
export PATH="$PWD/dist:$PATH"   # o node dist/index.js <comando>
asteria status
asteria init
asteria setup
asteria reset
asteria mint 10 10
asteria grid
asteria move -5 -5
asteria gather 20
asteria move -5 -5
asteria mine
asteria tx <updateId>
```

Cada comando que envía una transacción imprime su **update ID** (`tx: ...`). `asteria tx <updateId>` muestra esa transacción en detalle: offset, record time y los eventos (creates y exercises) con template, choice y parties. Nota: el historial de la wallet web solo lista las transacciones de su propio wallet de Canton Coin; las del juego se ven con `tx`.

O en modo interactivo, que mantiene la sesión y redibuja la grilla después de cada acción:

```bash
asteria play        # también: asteria repl
```

Dentro de la sesión: `help` lista los comandos, `exit` sale. Un error en un comando no corta la sesión.

La configuración sale de `asteria/devnet/.env` si existe, o de variables de entorno:

| Variable | Default | Descripción |
| --- | --- | --- |
| `ASTERIA_HOST` | `localhost` | IP o host del servidor |
| `ASTERIA_PROVIDER_PORT` | `3975` | JSON API del admin (app-provider) |
| `ASTERIA_USER_PORT` | `2975` | JSON API del piloto (app-user) |
| `ASTERIA_PROVIDER_URL` | vacío | URL completa del JSON API del admin; pisa host y puerto |
| `ASTERIA_USER_URL` | vacío | URL completa del JSON API del piloto; pisa host y puerto |
| `ASTERIA_PACKAGE_ID` | del `.env` | Package ID del DAR de Asteria |
| `ASTERIA_AUDIENCE` | `https://canton.network.global` | Audiencia del token |
| `ASTERIA_USER` | `ledger-api-user` | Usuario del ledger |
| `ASTERIA_SECRET` | `unsafe` | Secreto HMAC de LocalNet |

En Codespaces, las URLs son `https` y cada puerto tiene su propio host. Ahí se usan las dos variables de URL:

```bash
export ASTERIA_PROVIDER_URL="https://TU-CODESPACE-3975.app.github.dev"
export ASTERIA_USER_URL="https://TU-CODESPACE-2975.app.github.dev"
```

El estado de la partida (package ID, parties) se guarda en `asteria-state.json` en el directorio donde corrés el comando. Los ContractIds se consultan al ledger en cada acción, así que no quedan desactualizados.
