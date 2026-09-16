# Auditorías de seguridad en Canton

Canton es infraestructura financiera, y eso se refleja en cómo se audita. Hay auditorías obligatorias para el token nativo, un plan financiado para revisar el core del protocolo, comités de gobernanza que controlan el gasto y un ecosistema de auditores que se especializó en Daml. Este documento reúne los hechos conocidos y las cifras publicadas.

## Auditoría obligatoria de Canton Coin

La **CIP-0057**, aprobada el 3 de abril de 2025, incorporó a Quantstamp como Super Validator de peso 1 y estableció una obligación de auditoría: revisar los contratos Daml que gobiernan la tokenomics de Canton Coin y el código Scala con el que interactúan, una vez por año o después de cada upgrade mayor, durante tres años. En total son cuatro auditorías, y la primera debía entregarse dentro de los tres meses posteriores a la aprobación. El objetivo declarado es verificar que el código represente la lógica y las funciones del whitepaper de Canton Coin.

La **auditoría 2026** de Quantstamp, pedida por el Tokenomics working group de la Fundación para cumplir con CIP-0057, no encontró problemas mayores. Identificó dos debilidades de severidad baja en validación y lógica, relacionadas con la liquidación de allocations, el proceso de retiro y el arranque de rondas. El alcance del código Daml fue línea por línea; la parte en Scala se revisó con límite de tiempo y el propio informe aclara que ese análisis es complementario, no exhaustivo. La suite de tests Daml se consideró parte de la revisión: pasa y cubre tanto caminos felices como casos de error.

El informe también deja asentados riesgos de diseño y de economía que conviene conocer:

- Los upgrades de Daml son soft forks: todos los nodos deben actualizar antes de que el cambio tome efecto, y un DAR nuevo puede modificar el comportamiento de contratos ya desplegados.
- La consolidación de monedas recae en el usuario. Una moneda de bajo valor puede expirar aproximadamente al año sin aviso on-chain.
- Los precios publicados por feeds pueden ser creados por cualquier party y deben validarse antes de usarse.
- El `fundManager` del fondo de desarrollo tiene capacidad unilateral sobre una suma importante de CC, aunque su clave se gestione con multisig.

Las versiones anteriores y el alcance detallado están publicados en el repositorio de CIPs y en el sitio de Quantstamp.

## Plan de auditorías del core

La propuesta **Security reviews of core network components**, presentada al Development Fund por Digital Asset y aprobada el 11 de junio de 2026, financia la revisión del core del protocolo con un esquema de auditoría interna, documentación para auditores externos, auditoría independiente y remediación. El presupuesto es de **6.420.000 CC** para Digital Asset más un fondo de hasta **3.850.000 CC** para los auditores externos, que se seleccionan por pedido de cotización (RFQ). Las entregas se concentran entre fines de 2026 y el primer trimestre de 2027, y el esquema puede repetirse si aparecen hallazgos que exijan más trabajo.

Los once componentes del plan, con su contexto y el monto asignado, son:

| # | Componente | Situación | Monto |
| --- | --- | --- | --- |
| 1 | ISS/BFT Orderer | La auditoría interna ya se financió en otro grant; falta documentación para auditores y remediación | 270.000 CC |
| 2 | Logical Synchronizer Migration | Cambio mayor al protocolo de transacciones; auditoría interna ya realizada | 220.000 CC |
| 3 | Crypto API | Las auditorías previas no aplican por las session signing keys y los nuevos esquemas criptográficos | 430.000 CC |
| 4 | Sequencer Public API | Única API pública a nivel de protocolo; apunta a eliminar las whitelists de la red | 1.080.000 CC |
| 5 | Topology Protocol | Cambios recientes de escalabilidad (caching, lazy-loading) y soporte multi-synchronizer | 1.130.000 CC |
| 6 | Ledger y JSON API | Revisadas en 2025; ahora hay que cubrir interactive submission, interfaces paginadas y self-administration | 480.000 CC |
| 7 | Daml Engine | Última auditoría externa en 2023, como parte de una evaluación más amplia del lenguaje | 810.000 CC |
| 8 | Smart Contract Upgrading | Incluye extensiones del lenguaje, verificación de upgrades y selección de paquetes según topología | 700.000 CC |
| 9 | Validator K8s estándar | Revisión y endurecimiento del tooling de despliegue en Kubernetes que usa la mayoría de los validators | 220.000 CC |
| 10 | Super Validator K8s estándar | Igual que el anterior, sobre el despliegue que usan los Super Validators | 430.000 CC |
| 11 | Scan | Segunda API pública de la red; prepara la eliminación del whitelisting de IP | 650.000 CC |

Alrededor de este plan hay dos propuestas relacionadas en discusión: un decompilador open source de Daml-LF para que validators y auditores puedan inspeccionar el contenido de un DAR sin el código fuente, y un esquema de partnership continuo de seguridad en lugar de auditorías puntuales.

## Gobernanza de la seguridad

La Fundación administra estos procesos a través de sus comités. El **Tech and Operations Committee** gestiona el Development Fund y aprueba las propuestas de auditoría; el **Audit and Finance Committee** revisa las decisiones financieras y el cumplimiento del presupuesto; el **Accountability Committee** revisa los entregables de los CIP; y el **Legal Committee** monitorea el cumplimiento normativo, incluido OFAC. El fondo se financia con el 5% de las emisiones futuras de Canton Coin (CIP-0082), sigue el proceso definido en CIP-0100 y se paga por hitos, con reporte público y auditoría anual independiente.

Que el propio core se audite con dinero del fondo, y no solo con presupuesto del desarrollador principal, es un dato relevante: las propuestas se presentan como pull requests públicas en `github.com/canton-foundation/canton-dev-fund`, con comité, champion y votación.

## El ecosistema de auditores

Daml no se audita como Solidity. OpenZeppelin lo explicó en marzo de 2026: el modelo eUTXO con views cifradas y sin mempool público elimina clases enteras de vulnerabilidades de Ethereum, como la reentrancy y el MEV, pero abre un riesgo propio. Las cuatro familias de bugs que describen como más significativas son:

1. **Violaciones de conservación**: el total de entradas no coincide con el total de salidas en algún camino de transferencia.
2. **Fallas aritméticas por parámetros de gobernanza**: una división sin guarda contra un denominador mal configurado detiene un workflow completo.
3. **Errores de supuestos temporales**: el tiempo del ledger tiene imprecisión y el orden entre synchronizers puede rechazar o desordenar operaciones.
4. **Orden no determinista en el borde de la aplicación**: consultas sin orden explícito que producen fallas intermitentes en producción.

Para cubrirlas, OpenZeppelin liberó tres herramientas abiertas: `daml-lint`, un analizador estático en Rust con seis detectores; `daml-props`, un framework de property-based testing escrito en Daml; y `daml-verify`, que usa el prover Z3 para demostrar invariantes sobre todos los inputs posibles. Según su experiencia, ninguna técnica alcanza sola y la combinación de las tres es la que da confianza.

Los auditores que trabajan hoy sobre Canton incluyen a:

- **Quantstamp**: auditor obligatorio de Canton Coin por CIP-0057, especializado en contratos inteligentes y aplicaciones descentralizadas.
- **Hacken**: proveedor de auditoría del ecosistema Canton. Varios de sus miembros obtuvieron certificaciones Daml Contract Developer y Daml Philosophy, y publicaron un análisis de patrones de diseño seguros en Daml.
- **Halborn**: auditó Tradecraft, un protocolo de liquidez y market maker sobre Canton. Revisó autorización, estado de pools, lógica de fees y ventanas de liquidación como un sistema interconectado, y reverificó cada corrección antes de cerrar el trabajo.
- **QuillAudits**: anunció soporte formal para auditorías de Daml y Canton en julio de 2026, con foco en autorización y workflows de negocio.
- **softstack**: auditó el protocolo Minted mUSD en febrero de 2026. El informe lista 29 hallazgos entre la numeración 6.2.1 y 6.2.29, la mayoría corregidos, y aplicó revisión manual, ejecución simbólica, linters de Daml y análisis de cobertura.

## Qué se revisa en una auditoría de contratos Daml

Los informes públicos coinciden en los mismos puntos críticos: autorización (signatories y controllers), reglas de visibilidad y divulgación de datos, uso de contract keys, semántica de archivo de contratos, aritmética monetaria y conservación de sumas, manejo de plazos y tiempo, y cobertura de tests. En la parte de proceso se piden tests negativos con `submitMustFail`, verificación de las correcciones y, cuando el presupuesto lo permite, ejecución simbólica y verificación formal.

Un riesgo particular de la plataforma es el upgrade de contratos. Los cambios en Daml se despliegan como soft forks y un DAR actualizado puede cambiar implícitamente el comportamiento de contratos ya desplegados. Por eso el plan del core incluye un milestone específico para Smart Contract Upgrading y otro para la Topology, que es quien resuelve qué versión de paquete se usa en cada transacción.

## Recomendaciones para equipos que construyen en Canton

- Auditar los contratos propios antes de MainNet. Las auditorías del core no evalúan la lógica de negocio de terceros.
- Revisar primero conservación y aritmética: sumas de tokens, división, decimales y precisión.
- Revisar después el tiempo: deadlines, ventanas de liquidación y comportamiento entre synchronizers.
- Incluir tests negativos y medir cobertura con las herramientas del SDK.
- Reverificar cada corrección antes de dar una auditoría por cerrada.
- Seguir el Development Fund: publica RFPs de seguridad y acepta propuestas con un champion del comité.

## Fuentes

- [CIP-0057: Add Quantstamp as a Weight 1 Super Validator](https://github.com/canton-foundation/cips/blob/main/cip-0057/cip-0057.md)
- [Canton Coin 2026 Audit, Quantstamp](https://certificate.quantstamp.com/full/canton-coin-2026-audit/7719ab33-0012-4bb6-bf6c-ce3c0335a93d/index.html)
- [Security reviews of core network components, Development Fund](https://github.com/canton-foundation/canton-dev-fund/issues/410)
- [Daml Engine milestone, Development Fund](https://github.com/canton-foundation/canton-dev-fund/issues/505)
- [Smart Contract Security for Institutional Finance on Canton, OpenZeppelin](https://www.openzeppelin.com/news/smart-contract-security-for-institutional-finance-on-canton-an-entirely-different-problem)
- [Hacken, auditing provider for Canton Network](https://hacken.io/network/canton/)
- [Case Study: Tradecraft on Canton, Halborn](https://www.halborn.com/case-studies/post/case-study-securing-a-first-of-its-kind-liquidity-layer-on-the-canton-network-for-tradecraft)
- [QuillAudits: Canton Network security audits](https://www.quillaudits.com/blog/web3-security/canton-network-security-audits)
- [Minted mUSD Canton audit, softstack](https://github.com/softstack/Smart-Contract-Security-Audits/blob/master/Minted/MINTED_AUDIT_SUMMARY.md)
- [Canton Development Fund](https://github.com/canton-foundation/canton-dev-fund)
- [Grants Program, Canton Foundation](https://canton.foundation/grants-program/)
