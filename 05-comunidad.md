# Comunidad y gobernanza de Canton

Canton no tiene un dueño único. La red la operan instituciones independientes agrupadas como Super Validators, la coordina una fundación sin fines de lucro y las reglas se cambian con un proceso público de propuestas. Este documento explica quién decide qué, cómo se participa y dónde está la comunidad.

## La Canton Foundation

La **Canton Foundation** es una organización sin fines de lucro creada junto con la Linux Foundation. Hasta octubre de 2025 se llamó Global Synchronizer Foundation y hoy se presenta como Canton Foundation. Su mandato es coordinar a los Super Validators, administrar el marco de gobernanza del Global Synchronizer y fomentar el crecimiento del ecosistema.

La Fundación no controla la red de forma unilateral. Corre un Super Validator en representación de sus miembros y vota según la dirección que ellos marcan; su nodo tiene el mismo peso que el de cualquier otro SV y toda decisión necesita el umbral BFT habitual.

El trabajo se organiza en comités de miembros y de board. Los públicos son:

| Comité | Función principal |
| --- | --- |
| **Tech and Operations** | Coordina a los operadores de SV, mantiene las implementaciones de referencia y administra el Development Fund |
| **Tokenomics** | Diseña y ajusta el modelo económico, las fees y los incentivos |
| **Accountability** | Revisa los entregables de los CIP y recomienda acciones ante bajo desempeño |
| **Marketing** | Canaliza consultas y coordina la comunicación del ecosistema |
| **Featured App Metrics** | Define y mide el desempeño de las aplicaciones destacadas |
| **Legal** | Revisa decisiones legales y monitorea cumplimiento normativo, incluido OFAC |
| **Audit and Finance** | Revisa las decisiones financieras y el cumplimiento del presupuesto |
| **Collateral Subcommittee** | Define estándares y marcos operativos para movilidad de colateral |

Entre los miembros fundadores hay nombres conocidos del mercado financiero y de infraestructura: Broadridge, Calastone, Euroclear, Moody's, Tradeweb, SBI Digital Asset Holdings, Taurus, Digital Asset, Obsidian Systems, Kaleido, IntellectEU, Bitwave, Cumberland, MPCH, Equilend, LendOS, Liberty City Ventures, 7Ridge y el Global Blockchain Business Council.

La membresía tiene tres niveles: **Premier** (USD 150.000 por año, con un director en el board), **General** (desde USD 5.000 hasta USD 30.000 según el tamaño de la empresa, con participación en comités) y **Associate** (sin costo, limitada a gobiernos, reguladores, organizaciones sin fines de lucro y universidades, con aprobación del board). Cualquier miembro puede sumarse a un comité.

## Super Validators

Los **Super Validators** (SV) son las organizaciones que operan el Global Synchronizer. Cada SV corre la infraestructura completa: un validator propio, un nodo sequencer, un nodo mediator, un nodo de consenso BFT (CometBFT), la SV App de gobernanza, una instancia de Scan y sus dashboards. No existe un despliegue parcial: un SV que no corre todos los componentes no cumple su rol.

Sus responsabilidades incluyen operar la infraestructura, validar las transferencias de Canton Coin, participar del consenso BFT, votar en la gobernanza, patrocinar el ingreso de validators nuevos y hospedar una instancia pública de Scan para que cualquiera pueda consultar los datos agregados de la red.

La gobernanza on-chain funciona a través del partido **DSO** (Decentralized Synchronizer Operator), un partido descentralizado hospedado en todos los nodos de los SV. Su umbral de confirmación es de aproximadamente dos tercios, y el sistema tolera hasta `f = floor((n-1)/3)` nodos con fallas o maliciosos. Las decisiones se toman votando con el mismo mecanismo: cualquiera de los SV crea una propuesta de voto en la SV Web UI y la acción se ejecuta cuando se junta la cantidad de aceptaciones requerida.

La lista oficial de Super Validators la mantiene la Fundación. En mayo de 2026 se reportaban alrededor de 55 operadores, entre ellos Visa (el primer SV de la industria de pagos), DTCC, Nasdaq, Chainlink y Circle. Los SV reciben recompensas en Canton Coin por operar infraestructura y participar de la gobernanza; la CIP-0105 agregó un esquema voluntario de bloqueo de recompensas para que el peso de voto (SV Weight) refleje un compromiso de largo plazo verificable on-chain.

### Cómo entra un validator nuevo

El proceso de onboarding está publicado y es el mismo para TestNet y MainNet:

1. Se solicita el ingreso mediante el formulario de validators de la Fundación.
2. El Tokenomics Committee revisa y aprueba la solicitud.
3. Un Super Validator patrocinador aporta la IP de egreso a la allowlist. Se permite una IP por red y debe ser distinta entre DevNet, TestNet y MainNet.
4. Cuando la mayoría de los SV adopta la allowlist actualizada (entre dos y siete días), el sponsor entrega un secret de onboarding que vence a las 48 horas.
5. Se despliega el validator con ese secret.

Existen dos caminos para operar: correr la infraestructura propia o contratar un proveedor de nodo como servicio. La lista de proveedores NaaS incluye, entre otros, a Blockdaemon, Copper, Figment, Kiln, P2P.org, Everstake, DSRV, Validation Cloud, Zodia, IntellectEU y Kaleido.

## El proceso CIP

Los cambios a las reglas de la red se hacen por **Canton Improvement Proposals (CIP)**, el equivalente a las EIP de Ethereum. El proceso formal está definido en CIP-0000 y todo vive en el repositorio público `github.com/canton-foundation/cips`.

Hay cinco tipos de propuesta: **Standards Track** (especificaciones técnicas que afectan la interoperabilidad, requieren implementación de referencia para llegar a Final), **Governance** (derechos y pesos de voto de los SV), **Tokenomics** (fees, recompensas, precio del traffic), **Process** (cambios al propio proceso) e **Informational** (guías sin efecto vinculante).

El ciclo de vida es el siguiente:

1. **Draft.** El autor desarrolla la propuesta y la discute en la lista `cip-discuss`. Todavía no tiene número oficial.
2. **Proposed.** Necesita un Super Validator que la patrocine y otro que la avale (si el autor ya es un SV, alcanza con un endorser). El sponsor la envía a la lista `cip-vote` y un editor asigna el número.
3. **Approved.** Se vota durante 10 días y hace falta una mayoría de dos tercios de los SV con derechos de voto.
4. **Active o Final.** Las propuestas que no requieren implementación on-chain entran en vigencia al aprobarse. Las que sí la requieren llegan a Final cuando dos tercios de los SV implementaron el cambio en la red.

Cualquier persona puede escribir un CIP, pero para que se vote necesita sponsor y endorser. Los períodos mínimos de discusión antes de la votación son de tres meses para Standards Track, un mes para Governance y Tokenomics, un mes para Process y dos semanas para Informational.

Algunos CIP relevantes para entender la red:

- **CIP-0042**: calibra el precio del traffic para que una transferencia estándar de Canton Coin cueste aproximadamente un dólar.
- **CIP-0056**: define el token standard de la red con seis interfaces para metadata, holdings, transferencias y entrega contra pago.
- **CIP-0057**: incorpora a Quantstamp como SV y establece las auditorías anuales de Canton Coin.
- **CIP-0078**: elimina las fees de transferencia de Canton Coin.
- **CIP-0103**: define el estándar de dApp para desacoplar la conexión de red y el manejo de claves de la lógica de la aplicación.
- **CIP-0105**: crea el esquema de bloqueo de recompensas de los Super Validators.
- **CIP-0082 y CIP-0100**: crean el fondo de desarrollo y definen su proceso de asignación.

La implementación de cada CIP se puede verificar on-chain a través de las APIs de Scan.

## Canales de la comunidad

| Canal | Uso |
| --- | --- |
| [forum.canton.network](https://forum.canton.network/) | Discusiones técnicas de formato largo y base de conocimiento buscable |
| Slack | Coordinación en tiempo real: `#gsf-global-synchronizer-appdev`, `#validator-operations`, `#validator-operations-onboarding`, `#gsf-outreach` |
| [discord.gg/canton](https://discord.gg/canton) | Comunidad general, discusiones de tooling y soporte |
| [lists.sync.global](https://lists.sync.global/) | Listas de correo: anuncios, CIP, tokenomics, operaciones de validators, grants |
| GitHub | Código y propuestas: `canton-network/splice`, `digital-asset/cn-quickstart`, `digital-asset/daml`, `canton-foundation/cips`, `canton-foundation/canton-dev-fund`, `canton-foundation/configs` |
| [dev-hub.canton.foundation](https://dev-hub.canton.foundation/) | Catálogo abierto de herramientas, SDKs, APIs e infraestructura, mantenido por la Fundación y abierto a contribuciones |
| Office hours | Sesiones periódicas de onboarding y preguntas técnicas |
| Redes | LinkedIn, X (@CantonFdn), Telegram (`t.me/CantonNetwork1`) |

## Financiamiento y programas

El **Protocol Development Fund** financia trabajo que beneficia a todo el ecosistema: investigación y desarrollo del core, herramientas para desarrolladores, seguridad y auditorías, implementaciones de referencia, infraestructura crítica y liquidez inicial para DeFi. Se financia con el 5% de las emisiones futuras de Canton Coin (CIP-0082), sin premine ni tesorería previa, y sigue el proceso de CIP-0100.

La mecánica: las propuestas se presentan como pull requests en `github.com/canton-foundation/canton-dev-fund`; el Tech and Operations Committee las evalúa y el Voting Group las aprueba; el presupuesto es trimestral, los pagos se hacen en CC contra hitos cumplidos y hay reporte público con auditoría anual independiente. Cualquier persona u organización puede presentar una propuesta, pero si no es miembro de la Fundación necesita un **champion** dentro del comité que la acompañe.

Los **hackathons** son la otra puerta de entrada. HackCanton organizó su segunda temporada con premios de USD 10.000 en efectivo, USD 25.200 en créditos de infraestructura y 100.000 CC, y la tercera temporada arrancó el 10 de septiembre de 2026 con cinco semanas de trabajo online, mentorías y una final en vivo. En paralelo, el hackathon "Build on Canton" de ENCODE Club, iniciado el 15 de junio de 2026, propone tres tracks: DeFi privada y mercados de capitales, TradeFi y activos tokenizados, y pagos, neobanking y comercio con agentes.

## El ecosistema

Alrededor de la red hay un ecosistema de aplicaciones y servicios organizado por categorías: exploradores de bloques, bridges y oráculos, custodios y wallets, soluciones de desarrollo Daml, datos y analítica, DeFi, node-as-a-service y tokenización de activos del mundo real. La Fundación mantiene un proceso de revisión para destacar aplicaciones (**Featured Apps**) con métricas públicas de actividad.

Entre los casos de uso visibles están la plataforma Calypso de Nasdaq para movilidad de colateral, el comercio de créditos de carbono con contratos Daml, los flujos de pagos con privacidad de Visa y las iniciativas de liquidación de DTCC. La categoría de tokenización agrupa a emisores y plataformas que usan el modelo de privacidad y liquidación atómica de Canton.

## Fuentes

- [About the Foundation](https://canton.foundation/about-the-foundation/)
- [Join the Foundation](https://canton.foundation/join-the-foundation/)
- [Grants Program](https://canton.foundation/grants-program/)
- [Validators](https://canton.foundation/validators/)
- [SV Network Status](https://canton.foundation/sv-network-status/)
- [The Global Synchronizer](https://docs.canton.network/overview/understand/global-synchronizer)
- [SV Governance Reference](https://docs.canton.network/overview/reference/sv-governance-reference)
- [Super Validator Components](https://docs.canton.network/overview/reference/super-validator-components)
- [CF Policies](https://docs.canton.network/overview/reference/gsf-policies)
- [CIP Reference](https://docs.canton.network/overview/reference/what-are-cips)
- [Support Channels](https://docs.canton.network/shared/support-channels)
- [Canton Development Fund](https://github.com/canton-foundation/canton-dev-fund)
- [HackCanton Season 3](https://forum.canton.network/t/hackcanton-season-3-build-something-real-on-canton/9065)
- [Build on Canton Hackathon](https://forum.canton.network/t/build-on-canton-hackathon/8635)
- [Canton Foundation Developer Tooling Catalogue](https://forum.canton.network/t/canton-foundation-developer-tooling-catalogue/8745)
- [Visa Teams With Canton Network](https://www.canton.network/news/visa-teams-with-canton-network-to-preserve-blockchain-privacy)
- [What Are Canton Network Super Validators? (CantonNews)](https://cantonnews.org/insights/what-are-canton-network-super-validators)
- [Nasdaq en el ecosistema Canton](https://www.canton.network/ecosystem/nasdaq)
