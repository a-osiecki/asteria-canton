# Stack técnico de Canton

Este documento describe las piezas tecnológicas que componen Canton: el lenguaje de contratos, el runtime de los nodos, las APIs, las herramientas de desarrollo y la infraestructura sobre la que se despliega.

## Daml: el lenguaje de contratos

Daml es el lenguaje en el que se escriben los contratos inteligentes de Canton. Es un lenguaje funcional, con tipos fuertes e inferencia de tipos, y su compilador usa un fork del frontend de GHC, el compilador de Haskell. El código fuente se compila a **Daml-LF** (Daml Ledger Format), el formato de bajo nivel que interpretan los participantes, y se empaqueta en archivos **DAR** (Daml Archive) junto con sus dependencias y metadatos.

Un contrato se define como un **template** con campos de datos, signatories, observers y **choices** (acciones que se pueden ejercer sobre él). La autorización y la visibilidad se declaran en el propio contrato, y la plataforma las aplica. El modelo es determinista: no hay llamadas externas ni estado global mutable, lo que facilita que cualquier participante re-ejecute la misma lógica y llegue al mismo resultado.

El **Daml SDK** incluye el compilador, el runner de Daml Script para tests, el Sandbox, el runtime de Canton, los generadores de código y plantillas de proyecto. Se administra con `dpm install`. Los requisitos base para desarrollar son Java 17 o superior y Node.js 18 o superior.

## Runtime y APIs

El **participant node** es el proceso que ejecuta los contratos y guarda los datos de las parties que hospeda. Corre sobre la JVM (está escrito en Scala) y persiste su estado en PostgreSQL; en producción se recomienda una base gestionada con respaldos y alta disponibilidad.

La **Ledger API** es la interfaz principal para las aplicaciones. Tiene dos transportes sobre los mismos servicios:

- **gRPC** con Protobuf, para integraciones de alto rendimiento y generación de clientes tipados.
- **JSON sobre HTTP**, con streaming por WebSocket, para integraciones más simples o desde un navegador.

Los servicios principales son CommandService (envío de comandos), CommandSubmission y CommandCompletion (envío asíncrono y seguimiento), UpdateService (stream de transacciones), StateService (contratos activos), InteractiveSubmissionService (preparación de transacciones para firma externa), PartyManagement y PackageService (paquetes DAR).

La **Admin API** queda separada de la Ledger API y se ocupa de la administración del nodo: claves, topología, gestión de parties y operación general.

**PQS** (Participant Query Store) es un servicio que corre al lado del validator: se suscribe al stream de transacciones y proyecta los datos en PostgreSQL para consultarlos con SQL. Sirve para filtros, agregaciones, joins y búsqueda de texto que la Ledger API no cubre bien. Se distribuye como jar dentro del SDK, como imagen Docker y como chart de Helm, y declara compatibilidad con Canton 3.4 y 3.5, Java 17 y 21, y PostgreSQL 13 a 18.

## Synchronizer y consenso

El synchronizer coordina sin ver el contenido. Sus componentes son el **sequencer**, que ordena los mensajes cifrados y asigna el tiempo; el **mediator**, que junta confirmaciones y declara el resultado; y el **orderer**, que implementa el consenso de ordenamiento.

La Global Synchronizer corre hoy con **CometBFT** (el sucesor de Tendermint) como motor de ordenamiento. Canton también desarrolla un orderer BFT propio, inspirado en los algoritmos ISS (*Insanely Scalable State-Machine Replication*) y Narwhal, que corre dentro del mismo proceso del sequencer. El backend centralizado sobre una base de datos está en estado alfa y se retirará en favor del orderer BFT nativo.

En cuanto a conectividad, los validators se conectan a los sequencers por TLS en el puerto 443 y solo de salida: no necesitan aceptar conexiones entrantes. Los Super Validators mantienen conexiones peer-to-peer entre sus nodos BFT, con TLS punto a punto, en canales dedicados separados de las APIs HTTPS.

## Herramientas de desarrollo

| Herramienta | Para qué sirve |
| --- | --- |
| **dpm** (Daml Package Manager) | Punto de entrada de línea de comandos: `dpm new`, `dpm build`, `dpm test`, `dpm sandbox`, `dpm studio`, `dpm codegen-js`, `dpm codegen-java`, `dpm pqs`. Reemplaza al antiguo CLI `daml`. |
| **Daml Studio** | Extensión de VS Code con verificación de tipos en vivo, errores en línea, navegación a definiciones y ejecución de scripts con vista de resultados. Se abre con `dpm studio`. |
| **Daml Script** | Lenguaje de testing escrito en Daml. Los tests se ejecutan con `dpm test` sobre un ledger limpio. |
| **Sandbox** | Nodo Canton de un solo participante, en memoria, para iterar rápido sin Docker. |
| **LocalNet** | Entorno Docker Compose con tres validators (Super Validator, app provider, app user), synchronizer local, wallets, PQS, JSON API, autenticación con Keycloak y observabilidad con Grafana, Prometheus y Loki. |
| **Canton Console** | REPL en Scala para administrar nodos: consultar contratos activos, inspeccionar transacciones, subir DARs, gestionar parties y diagnosticar problemas. |
| **Daml Shell** | Herramienta interactiva de línea de comandos para inspeccionar y depurar el ledger. |
| **Daml Profiler** | Perfilado de contratos Daml. |
| **darsyncer** | Imagen Docker para subir y sincronizar archivos DAR a un participante. |

## SDKs y bindings

Además del SDK de Daml, hay dos SDKs en TypeScript para el lado de las wallets y las aplicaciones:

- **Wallet SDK**: librería que usan los proveedores de wallets, incluidas las casas de cambio, para integrarse con Canton.
- **dApp SDK**: contraparte del lado del navegador. Conecta el frontend de una aplicación con un Wallet Gateway siguiendo la interfaz de proveedor definida en CIP-0103.

Para integrar backends existen generadores de código oficiales: `dpm codegen-js` produce bindings de TypeScript o JavaScript, y `dpm codegen-java` produce clases Java para usar con el cliente gRPC. Hay bindings mantenidos por la comunidad para Python, Rust, Go y C#, sin soporte oficial.

## Splice, token standard y proyecto de referencia

**Splice** es el proyecto de código abierto, alojado como Hyperledger Lab, que implementa la infraestructura del Global Synchronizer: Canton Coin, la Validator App, la wallet, la gobernanza y el explorador Scan. El repositorio oficial es `canton-network/splice`.

Dentro de Splice se define el **token standard** de Canton, la CIP-0056. Son seis interfaces estándar para metadata de tokens, holdings, transferencias entre pares y liquidación de entrega contra pago. Canton Coin implementa todas. La idea de fondo es similar a ERC-20, adaptada al modelo UTXO y a la privacidad de Canton, y es el estándar que conviene implementar si se emite un token en la red.

**cn-quickstart** es la aplicación de referencia full-stack: contratos Daml, backend Java con Spring Boot, frontend React y LocalNet. Implementa un flujo de licencias de software con pagos en Canton Coin y sirve como punto de partida para proyectos propios.

## Infraestructura y despliegue

Canton tiene cuatro entornos: LocalNet (desarrollo local), DevNet (integración, requiere credenciales VPN y sponsorship de un Super Validator), TestNet (staging con proceso de aprobación) y MainNet (producción). El camino entre DevNet y MainNet incluye sponsorship, revisión operativa y un proceso de onboarding donde un Super Validator aporta la allowlist de IP y un secret que expira a las 48 horas.

Los nodos se despliegan típicamente en contenedores; la red publica un despliegue estándar de Kubernetes tanto para validators como para Super Validators, y el plan de auditorías del Development Fund incluye revisar ese tooling de despliegue.

El versionado es estricto: cada release del SDK de Daml se ata a una versión del protocolo Canton, y los DAR se compilan contra una versión compatible con la red de destino. El archivo `daml.yaml` del proyecto fija la versión del SDK. Como la red se actualiza con frecuencia (semanal o mensualmente), conviene revisar el dashboard oficial de compatibilidad de versiones antes de desplegar.

## Fuentes

- [SDKs and Tools](https://docs.canton.network/sdks-tools/overview)
- [Daml SDK](https://docs.canton.network/sdks-tools/sdks/daml-sdk)
- [The Canton Development Stack](https://docs.canton.network/appdev/modules/m1-development-stack)
- [Daml Compiler](https://docs.canton.network/sdks-tools/development-tools/daml-compiler)
- [Daml Studio](https://docs.canton.network/sdks-tools/development-tools/daml-studio)
- [LocalNet](https://docs.canton.network/sdks-tools/development-tools/localnet)
- [PQS](https://docs.canton.network/sdks-tools/development-tools/pqs)
- [Ledger API](https://docs.canton.network/sdks-tools/api-reference/ledger-api)
- [Validator Architecture](https://docs.canton.network/overview/learn/validator-architecture)
- [Super Validator Components](https://docs.canton.network/overview/reference/super-validator-components)
- [BFT Orderer Architecture](https://docs.canton.network/global-synchronizer/extension-synchronizers/bft-orderer)
- [Wallet SDK](https://docs.canton.network/sdks-tools/sdks/wallet-sdk/overview)
- [dApp SDK](https://docs.canton.network/sdks-tools/sdks/dapp-sdk/overview)
- [CIP-0056 Token Standard](https://docs.canton.network/overview/reference/cip-0056)
- [cn-quickstart](https://docs.canton.network/sdks-tools/reference-projects/cn-quickstart)
- [Smart Contract Security for Institutional Finance on Canton (OpenZeppelin)](https://www.openzeppelin.com/news/smart-contract-security-for-institutional-finance-on-canton-an-entirely-different-problem)
