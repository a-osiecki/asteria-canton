# Experiencia de desarrollo en Canton

Canton se programa en Daml y se integra a través de la Ledger API. Este documento describe cómo es el trabajo diario de un desarrollador: las herramientas, el ciclo de pruebas, la integración con backends y las dificultades que aparecen en la práctica.

## El flujo de trabajo

Todo empieza instalando `dpm`, el Daml Package Manager. Con `dpm new` se genera un proyecto a partir de una plantilla, y el archivo `daml.yaml` fija la versión del SDK y las dependencias. A partir de ahí el ciclo es corto:

1. Escribir los contratos en archivos `.daml` con Daml Studio.
2. Compilar con `dpm build`, que produce un archivo DAR.
3. Testear con `dpm test`, que ejecuta los scripts de Daml Script.
4. Iterar contra el Sandbox (`dpm sandbox`) para lógica de contratos.
5. Probar flujos multi-party en LocalNet, que simula una red completa en una sola máquina.
6. Desplegar en DevNet para integración, luego TestNet y por último MainNet.

**Daml Studio** es la extensión de VS Code y la principal herramienta de escritura. Verifica tipos mientras se escribe, marca errores y advertencias en línea, permite ir a la definición de cualquier identificador y ofrece fragmentos de código para templates y choices. En los archivos con scripts aparece un botón de "Script results" que ejecuta el test y muestra los resultados en un panel lateral, con dos vistas: una tabla de contratos activos y archivados con la visibilidad de cada party, y un árbol de transacciones que sirve para depurar problemas de autorización. Si el proyecto usa una versión del SDK que no está instalada, el editor ofrece instalarla.

## Tests con Daml Script

Los tests se escriben en Daml y se ejecutan con `dpm test`. Cada script arranca sobre un ledger vacío, lo que hace los resultados reproducibles. Las funciones principales son `allocateParty` para crear parties, `submit` para enviar comandos en nombre de una party, `submitMustFail` para verificar que una operación no autorizada sea rechazada, y consultas al ledger para comprobar el estado resultante. También se puede manipular el tiempo del ledger para probar lógica de plazos.

La convención es mantener los tests en un paquete separado que depende del paquete de contratos, para que el código que se despliega no arrastre las dependencias de testing. Al terminar, `dpm test` imprime un resumen con la cantidad de contratos activos, la cantidad de transacciones y la cobertura de tests.

## Entornos locales

El **Sandbox** levanta un participant node en memoria, sin Docker, y es la vía rápida para probar lógica de contratos y para integrar un backend contra la Ledger API. **LocalNet** es un entorno Docker Compose pensado para flujos completos: corre tres validators (Super Validator, app provider y app user), un synchronizer local con sequencer y mediator, servicios de wallet con Canton Coin de prueba, instancias de PQS, endpoints de JSON API y, de forma opcional, autenticación con Keycloak y observabilidad con Grafana, Prometheus y Loki.

LocalNet se administra desde el repositorio cn-quickstart con `make setup`, `make build`, `make start` y `make stop`, y ofrece tres perfiles: minimal, standard y full. Los puertos siguen una convención por validator (prefijo 2xxx para el app user, 3xxx para el app provider, 4xxx para el Super Validator). La configuración incluye soporte para correr varios synchronizers en paralelo y para fijar una versión de protocolo distinta a la estable.

## Integración con el backend

El puente entre la aplicación y el ledger es la **Ledger API**. Desde un backend se envían comandos, se lee el stream de transacciones, se consulta el conjunto de contratos activos y se sigue el estado de los comandos enviados. Para Java y TypeScript existen bindings generados con `dpm codegen-java` y `dpm codegen-js`, que dan tipos seguros a partir de los contratos compilados.

Para consultas complejas está **PQS**: un proceso que proyecta el historial del ledger en PostgreSQL y permite usar SQL para filtros, agregaciones, joins y reporting. Es la vía recomendada cuando la consulta no es puntual, porque no carga el participant. PQS respeta las mismas reglas de privacidad que el validator al que se conecta: solo ve lo que ven las parties hospedadas allí.

El proyecto **cn-quickstart** muestra una arquitectura completa: contratos Daml, backend Java con Spring Boot que habla con la Ledger API y con PQS, frontend React y LocalNet. El frontend no toca el ledger directamente, todo pasa por el backend. La alternativa es un patrón CQRS donde el frontend firma y envía transacciones directo con los bindings de TypeScript; la documentación compara ambos caminos.

## Comparación con Ethereum

| Tarea | Ethereum | Canton |
| --- | --- | --- |
| Contratos | Solidity | Daml |
| Build | Hardhat, Foundry | `dpm build` |
| IDE | Remix, VS Code | VS Code con Daml Studio |
| Tests | Mocha, Foundry | Daml Script |
| Red local | Hardhat node, Anvil | Sandbox, LocalNet |
| API | JSON-RPC | Ledger API (gRPC y JSON) |
| Indexado | The Graph | PQS |
| Identidad | Dirección (EOA) | Party |
| Fees | Gas | Traffic |
| Estado | Contratos mutables | Contratos inmutables |

Vale aclarar qué desaparece con este modelo: no hay mempool público, reentrancy ni MEV, porque las transacciones no se ejecutan contra un estado compartido y visible. Los riesgos se mueven a otro lado: conservación de valor, autorizaciones, manejo del tiempo y diseño de visibilidad.

## Dificultades reales

Lo primero que exige tiempo es el modelo de autorización y privacidad. En Daml se piensa en términos de signatories, observers y controllers, y en vistas por transacción; quien viene de un modelo de estado global compartido suele necesitar un cambio de mentalidad antes de escribir contratos útiles.

El versionado exige disciplina. Cada release del SDK se ata a una versión del protocolo Canton, los DAR deben compilarse contra una versión compatible con la red de destino y las actualizaciones de red son frecuentes. Mantenerse al día es parte del trabajo.

El tooling es joven y se mueve rápido. DPM reemplazó al CLI anterior, la documentación se reescribió y varias herramientas cambiaron de nombre o de alcance en poco tiempo. Los bindings fuera de Java y TypeScript son comunitarios, sin soporte oficial.

El precedente de seguridad también es reciente: durante años no hubo herramientas de análisis adversarial específicas para Daml, y en 2026 OpenZeppelin publicó las primeras (`daml-lint`, `daml-props`, `daml-verify`). Hay menos desarrolladores y menos respuestas en foros que en el ecosistema EVM, aunque la comunidad concentra la ayuda en el foro, Slack y Discord.

Dos limitaciones concretas del modelo: los contract keys todavía no están soportados en los despliegues de Canton Network, y elegir entre la Ledger API y PQS para leer datos requiere entender bien el caso de uso.

## Recursos para desarrolladores

La documentación oficial está en `docs.canton.network`, con guías por módulos (m1 a m7), quickstarts y referencia de APIs. El catálogo de herramientas mantenido por la Fundación está en `dev-hub.canton.foundation`. Para preguntas está el foro `forum.canton.network`, los canales de Slack (`#gsf-global-synchronizer-appdev`, `#validator-operations`) y el Discord de la Fundación. Hay office hours periódicas, hackathons con premios y el Protocol Development Fund para financiar herramientas y trabajo de infraestructura.

## Fuentes

- [SDKs and Tools](https://docs.canton.network/sdks-tools/overview)
- [Daml SDK](https://docs.canton.network/sdks-tools/sdks/daml-sdk)
- [Daml Script](https://docs.canton.network/sdks-tools/cli-tools/daml-script)
- [Daml Studio](https://docs.canton.network/sdks-tools/development-tools/daml-studio)
- [Sandbox](https://docs.canton.network/sdks-tools/development-tools/sandbox)
- [LocalNet](https://docs.canton.network/sdks-tools/development-tools/localnet)
- [PQS](https://docs.canton.network/sdks-tools/development-tools/pqs)
- [cn-quickstart](https://docs.canton.network/sdks-tools/reference-projects/cn-quickstart)
- [The Canton Development Stack](https://docs.canton.network/appdev/modules/m1-development-stack)
- [Support Channels](https://docs.canton.network/shared/support-channels)
- [Canton Foundation Developer Tooling Catalogue](https://forum.canton.network/t/canton-foundation-developer-tooling-catalogue/8745)
- [Smart Contract Security for Institutional Finance on Canton (OpenZeppelin)](https://www.openzeppelin.com/news/smart-contract-security-for-institutional-finance-on-canton-an-entirely-different-problem)
