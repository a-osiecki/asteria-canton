# Devnet local de Asteria

LocalNet de Splice dockerizada, con solo los servicios core (postgres, canton y splice), para hostear en un servidor o en GitHub Codespaces, y jugar a Asteria desde el CLI.

## GitHub Codespaces (opcion sin tarjeta)

1. Crear un Codespace desde este repositorio. En "Machine type" elegir **4-core, 16 GB** (el `devcontainer.json` ya lo pide por defecto).
2. Esperar a que termine el setup: instala Docker-in-Docker y las dependencias del CLI.
3. En la terminal del Codespace:

   ```bash
   cd ~/asteria/devnet
   scripts/up.sh            # primera vez: descarga imagenes, 10 a 20 minutos
   scripts/status.sh
   scripts/bootstrap-dar.sh
   ```

4. Jugar desde la terminal del Codespace:

   ```bash
   cd ~/asteria/cli
   node dist/index.js init
   node dist/index.js setup
   node dist/index.js mint 10 10
   node dist/index.js grid
   ```

5. Para usar el CLI desde tu maquina: en la pestana **Ports**, copiar la URL publica de los puertos 2975 y 3975 (terminan en `.app.github.dev`) y exportarlas:

   ```bash
   export ASTERIA_PROVIDER_URL="https://TU-CODESPACE-3975.app.github.dev"
   export ASTERIA_USER_URL="https://TU-CODESPACE-2975.app.github.dev"
   ```

   El `devcontainer.json` ya marca esos dos puertos como publicos.

**Cuota:** el free tier incluye 120 core-hours por mes, o sea unas 30 horas de maquina 4-core. Apagar el Codespace cuando no se usa. Las imagenes y los volumenes quedan en disco y el arranque siguiente es rapido; si los contenedores no se levantan solos al reanudar, correr `scripts/up.sh` otra vez.

## Requisitos del host propio

- 16 GB de RAM (la doc de LocalNet pide 8 GB minimo; 16 va comodo)
- 2 a 4 vCPU
- 80 GB de disco
- Docker Engine y Docker Compose v2.27 o superior
- Puertos abiertos en el firewall: 22 (SSH), 2975 (app-user) y 3975 (app-provider)

## Puesta en marcha en Oracle Cloud

1. Crear la cuenta free tier y una instancia:
   - Imagen: Ubuntu 24.04
   - Shape: `VM.Standard.A1.Flex` (Ampere ARM), 2 a 4 OCPU y 24 GB de RAM
   - Boot volume: 100 GB
   - IP publica asignada
   - Clave SSH: generar una dedicada con `ssh-keygen -t ed25519 -f ~/.ssh/asteria_devnet` y pegar la publica
2. En la security list de la VCN, agregar reglas de ingreso TCP para 22, 2975 y 3975.
3. Conectarse e instalar Docker:

   ```bash
   ssh -i ~/.ssh/asteria_devnet ubuntu@IP
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker ubuntu
   exit
   ```

   Volver a entrar y verificar `docker compose version` (tiene que ser 2.27 o mayor).

4. En las imagenes de Oracle, permitir los puertos tambien en el firewall del sistema operativo:

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 2975 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3975 -j ACCEPT
   sudo netfilter-persistent save
   ```

## Copiar y arrancar

Desde esta maquina:

```bash
rsync -av --delete ./asteria/devnet/ ubuntu@IP:~/asteria-devnet/
ssh -i ~/.ssh/asteria_devnet ubuntu@IP 'cd ~/asteria-devnet && scripts/up.sh'
```

La primera vez descarga las imagenes y tarda entre 10 y 20 minutos. El estado se consulta con:

```bash
ssh -i ~/.ssh/asteria_devnet ubuntu@IP 'cd ~/asteria-devnet && scripts/status.sh'
```

`status.sh` muestra por participante la version de la API, el ledger-end offset, la cantidad de packages y si el DAR de Asteria esta presente. El ledger-end es el equivalente al tip de Cardano: no hay altura de bloque, hay offset.

## Subir el DAR

Con el DAR ya compilado (`cd asteria/daml/contracts && dpm build`), copiarlo al host y subirlo:

```bash
rsync -av ./asteria/daml/contracts/.daml/dist/asteria-contracts-0.1.0.dar ubuntu@IP:~/asteria-devnet/
ssh -i ~/.ssh/asteria_devnet ubuntu@IP 'cd ~/asteria-devnet && scripts/bootstrap-dar.sh ./asteria-contracts-0.1.0.dar'
```

Si se recompila el DAR con la misma version, Canton rechaza el vetting con `KNOWN_PACKAGE_VERSION`. Para el PoC lo mas simple es `scripts/reset.sh` y volver a arrancar.

## Wallets y Canton Coin

Los validator apps de splice crean sus propias parties (distintas de las del CLI) y cada una tiene wallet. `scripts/wallet.sh` las maneja; los JWT se generan solos:

- `app-user`: validator admin API en el puerto 2903.
- `app-provider`: puerto 3903.

```bash
scripts/wallet.sh status                     # party, onboarding y saldo de ambas
scripts/wallet.sh tap                        # faucet de LocalNet: 20.000 CC por wallet
scripts/wallet.sh preapproval app-user       # el receptor aprueba transferencias entrantes
scripts/wallet.sh send app-provider app-user 10.0
```

El envío usa `transfer-preapproval`, así que el receptor tiene que haber creado la preapproval antes. El `send` resuelve solo la party del receptor a partir de su `user-status`.

## UIs de wallet

El módulo vendorizado incluye las web UIs de Splice. Para ver el historial de transacciones de cada wallet (el faucet y las transferencias de CC), alcanza con nginx y las dos wallets:

```bash
scripts/up-ui.sh        # levanta nginx + wallet-web-ui de app-user y app-provider
scripts/up-ui.sh down   # las detiene
```

- Wallet app-user: http://localhost:2001
- Wallet app-provider: http://localhost:3001

En Codespaces abrí esos puertos desde la pestaña Ports. La UI muestra el wallet del validator (`app-user` o `app-provider`), que es distinto de las parties del CLI. Las UIs de scan, SV, ANS y Swagger quedan afuera: suman RAM y no hacen falta para el PoC, así que los vhosts de nginx que las referenciaban se recortaron.

`SPLICE_APP_UI_HTTP_URL` en `.env` decide si la UI llama al validator API por https (`false`) o http (`true`). En Codespaces va `false`; en un servidor con HTTP plano, `true`.

## Explorer del juego

`scripts/up-ui.sh` levanta también, vía nginx, un explorer mínimo de las transacciones de Asteria:

- http://localhost:2002 (en Codespaces, el puerto 2002)

Muestra las últimas 50 transacciones de las parties `asteria-*` (se puede cambiar la party en el selector) con el detalle de cada evento: template, choice, acting parties, y el `createArgument` (el equivalente al datum de un UTxO), el `choiceArgument` y el `exerciseResult`. Se refresca cada 5 segundos.

El token HS256 lo genera el navegador con el secreto `unsafe` de LocalNet, así que el explorer funciona en https o localhost (donde `crypto.subtle` está disponible); en un servidor HTTP plano remoto no.

## Detener y limpiar

```bash
scripts/down.sh    # detiene, conserva volumenes
scripts/reset.sh   # detiene y borra volumenes
```

Apagar la VM cuando no se usa evita el consumo de credito. Las imagenes quedan en disco y el arranque siguiente es mucho mas rapido.

## Seguridad

LocalNet autentica con un JWT HS256 firmado con el secreto `unsafe`. Cualquiera que conozca el secreto puede actuar como los usuarios y subir paquetes. Para un PoC descartable y sin valor real es aceptable; por eso se exponen solo los dos puertos del JSON API y nada mas. Postgres (5432) y los puertos de administracion (2902, 2903, 3902, 3903, 4902, 4903) quedan cerrados en el firewall.

## Que corre adentro

| Servicio | Contenido | Puertos publicados |
| --- | --- | --- |
| `postgres` | Base multi-database | 5432 (no expuesto) |
| `canton` | Tres participants y el synchronizer en un JVM | JSON API 2975, 3975, 4975 |
| `splice` | Validator apps, SV app y Scan | Admin 2903, 3903, 4903 (no expuestos) |

Las UIs de wallet, ANS, SV y Scan no se levantan por defecto: `scripts/up-ui.sh` levanta las de wallet, que muestran el historial de transacciones de cada validator.

## Archivos

```
devnet/
  .env                    # red, party hint, version de imagenes, puertos y package ID
  localnet/               # modulo LocalNet vendorizado de cn-quickstart
  scripts/
    up.sh                 # levanta postgres, canton y splice
    down.sh               # detiene
    reset.sh              # detiene y borra volumenes
    status.sh             # version, ledger-end, packages y DAR por participante
    bootstrap-dar.sh      # sube el DAR a los dos participantes
    wallet.sh             # saldo, faucet y transferencias de Canton Coin
    up-ui.sh              # levanta las UIs de wallet y el explorer
    jwt.sh                # imprime un token HS256 valido
    _common.sh            # utilidades compartidas
```