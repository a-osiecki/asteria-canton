# El ledger de Canton

Canton Network es una blockchain de capa 1 pública. La TestNet se lanzó en junio de 2023 y la MainNet en junio de 2024. Está pensada para que instituciones reguladas (bancos, cámaras de compensación, emisores de activos) compartan infraestructura sin que sus datos queden expuestos al resto de la red. La privacidad es una propiedad del protocolo desde su diseño.

Este documento cubre cómo funciona el ledger: qué se guarda, quién puede verlo, cómo se validan las transacciones y cómo se paga por usarlo.

## El modelo: contratos en lugar de cuentas

El ledger de Canton es una colección de **contratos activos**. Cada contrato se crea con una transacción, existe hasta que otra transacción lo archiva, es inmutable y tiene un identificador único. Cambiar el estado de un contrato significa archivarlo y crear uno nuevo con los datos actualizados. No hay balances que se modifican en el lugar.

Este diseño se llama **eUTXO** (extended UTXO). En Bitcoin, un UTXO es una salida de transacción que se gasta una sola vez; Canton extiende esa idea a contratos con lógica, roles y datos propios. Comparado con el modelo de cuentas de Ethereum:

- Los contratos independientes se procesan en paralelo, porque no comparten un estado global que haya que bloquear.
- La privacidad sale natural: cada contrato define exactamente qué partes intervienen.
- La composabilidad es directa: un contrato puede referenciar y ejercer acciones sobre otro dentro de la misma transacción.
- El doble gasto se previene por estructura: un contrato se archiva una sola vez.

Un detalle de implementación: los **contract keys** (claves para buscar contratos sin conocer su ID) existen en el modelo, pero todavía no están soportados en los despliegues de Canton Network. El equipo pide diseñarlos con cuidado, porque una clave global dentro de un synchronizer puede filtrar la existencia de un contrato.

## Partes y roles

Las **parties** son las identidades dentro del ledger, parecidas a las direcciones en otras redes. Se representan con un nombre y una huella de clave pública:

```
alice::1220f2fe29866fd6a0009ecc8a64ccdc09f1958bd0f801166baaee469d1251b2eb72
```

Existen dos tipos. Una **party local** guarda su clave en el validator, que firma en su nombre. Una **party externa** mantiene la clave afuera y exige una firma explícita, lo que se parece más al comportamiento de una wallet. Crear parties tiene costo y genera estado en los validators, así que conviene planificar cuántas y cómo se hospedan.

Cada contrato declara sus **stakeholders**, y el rol de cada parte determina qué ve y qué puede hacer:

| Rol | ¿Crea? | ¿Ve? | ¿Ejerce acciones? | ¿Archiva? |
| --- | --- | --- | --- | --- |
| **Signatory** | Sí | Siempre | Si es controller | Debe autorizar |
| **Observer** | No | Siempre | Si es controller | No |
| **Controller** | No | La acción y sus consecuencias | Sí, las que controla | Vía acción de consumo |
| **Actor** | Si es signatory | Si es stakeholder | Si es controller | Si es signatory |

Un **signatory** debe autorizar la creación del contrato y siempre lo ve. Un **observer** ve el contrato y sus eventos, pero no puede modificarlo, y es el rol que se usa cuando un regulador o auditor necesita visibilidad. Un **controller** puede ejercer acciones específicas declaradas en el contrato.

## Transacciones como árboles de acciones

Una transacción en Canton es un árbol de acciones. Hay tres tipos de acción: **create** (agrega un contrato), **exercise** (ejecuta una acción sobre un contrato, que puede archivarlo) y **fetch** (lee un contrato sin cambiar el estado). El árbol registra todo lo que pasa dentro de una misma transacción, incluidas las sub-acciones que genera una acción al ejecutarse.

Una acción sobre un contrato puede ser **consuming** o **non-consuming**. La consuming, que es la opción por defecto, archiva el contrato: se usa para transferencias y cambios de estado. La non-consuming deja el contrato activo y sirve para consultas y notificaciones.

La composabilidad es atómica. Si una transacción toca varios contratos, todos los cambios se confirman juntos o no se confirma ninguno. Un intercambio de un activo por otro, por ejemplo, archiva los contratos de ambas partes y crea los nuevos en la misma operación, sin riesgo de que una pata se ejecute y la otra no.

El **ledger time** (el tiempo que ven los contratos) lo asigna el synchronizer y crece de forma monótona dentro de cada synchronizer. La lógica que depende de plazos se evalúa contra ese tiempo, no contra el reloj de la aplicación.

## Privacidad de sub-transacción

Una transacción se descompone en **views**. Cada view contiene solo la parte de la operación que le corresponde a un conjunto de stakeholders, y se cifra por separado. El resultado es que cada parte recibe únicamente su view y no puede reconstruir el resto de la transacción.

Las reglas de visibilidad son concretas:

1. Los signatories ven el contrato y todas las acciones que se ejercen sobre él.
2. Los observers ven el contrato y las acciones de consumo.
3. Los controllers ven las acciones que pueden ejercer y sus consecuencias.

Un ejemplo simple: Alice le paga a Bob y Bob le paga a Charlie en una misma transacción atómica. Alice ve su pago a Bob, Bob ve los dos pagos porque participa en ambos, Charlie ve solo lo que recibe de Bob, y ningún otro participante ve nada.

Esta privacidad se sostiene incluso frente a la infraestructura: los validators que no hospedan a las partes no reciben la transacción, y el synchronizer que la ordena solo maneja mensajes cifrados.

## Arquitectura: validators y synchronizers

Canton separa dos funciones que otras blockchains mezclan: **coordinar** y **almacenar**.

El **participant node** (también llamado validator) es el nodo de cada entidad. Hospeda parties, guarda los contratos de esas parties, ejecuta el código Daml cuando una transacción las afecta, valida lo que le corresponde y expone la Ledger API para las aplicaciones. Solo almacena los contratos donde sus parties son stakeholders, no una copia de todo el estado de la red.

El **synchronizer** coordina el ordenamiento y la confirmación sin ver el contenido. Tiene dos componentes. El **sequencer** recibe los mensajes cifrados, les asigna un orden y un timestamp, y entrega cada view al validator que corresponde. El **mediator** junta las confirmaciones o rechazos de los validators y declara el veredicto final de la transacción. Ninguno de los dos descifra las views ni guarda el estado de la red.

La red admite varias topologías. Un synchronizer único sirve para despliegues privados o de prueba; varios synchronizers permiten separar flujos por regulación o consorcio; y el **Global Synchronizer** es la instancia pública que conecta a toda la red Canton, operada por Super Validators.

## Consenso en dos capas

Canton valida y ordena por separado, y eso le permite combinar privacidad con integridad.

La capa de **consenso de contratos** sigue el principio de *proof of stakeholder*: solo validan las partes afectadas. Cada validator re-ejecuta el código Daml de su view, comprueba que las firmas y autorizaciones sean correctas y verifica que los contratos consumidos sigan activos. No necesita ver el resto de la transacción para validar su parte.

La capa de **consenso de ordenamiento** establece un orden único para todos los eventos. En el Global Synchronizer usa un protocolo bizantino tolerante a fallas (BFT, por *Byzantine Fault Tolerant*): el sistema funciona aunque hasta un tercio de los nodos falle o mienta. La tolerancia se expresa como `f = floor((n-1)/3)`, con `n` nodos totales. La implementación actual corre sobre CometBFT, y hay un orderer propio inspirado en los algoritmos ISS y Narwhal en desarrollo; el backend centralizado a base de datos está en estado alfa y se va a retirar.

Las ventajas de esta separación son tres. La privacidad no exige sacrificar integridad, porque el ordenamiento evita el doble gasto y la validación queda en las partes. Cada synchronizer puede elegir su modelo de confianza (un operador único o un conjunto BFT) sin cambiar la capa de contratos. Y el sistema escala en horizontal, porque cada validator procesa el volumen de sus propias parties y no el de toda la red.

## Ciclo de vida de una transacción

1. **Envío.** La aplicación manda un comando a su participant a través de la Ledger API: crear un contrato o ejercer una acción.
2. **Interpretación.** El participant ejecuta el código Daml en local, arma el árbol de la transacción y lo descompone en views cifradas.
3. **Ordenamiento y distribución.** El sequencer asigna orden y timestamp, y entrega a cada participant solo las views que le tocan.
4. **Validación y confirmación.** Cada participant descifra su view, re-ejecuta la lógica, verifica autorizaciones y estado de los contratos, y manda su confirmación o rechazo al mediator.
5. **Commit.** El mediator agrupa las respuestas y declara el resultado. Cada participant aplica los cambios a su copia local del ledger y la aplicación recibe la notificación.

## Interoperabilidad entre synchronizers

Un contrato vive en un synchronizer. El **reassignment protocol** permite moverlo de uno a otro, y el mismo mecanismo habilita operaciones atómicas entre dominios distintos, por ejemplo una entrega contra pago donde el activo está en un synchronizer y el dinero en otro. Esto permite que distintas subredes, separadas por jurisdicción o por consorcio, se comuniquen sin depender de un ledger global único.

## Canton Coin y las fees

**Canton Coin (CC)** es el token nativo de la red. Se usa para pagar el *traffic* (las fees por usar la red), para recompensar a quienes operan infraestructura y para participar en la gobernanza.

El traffic depende del tamaño de la transacción, la complejidad computacional y la demanda de la red. El modelo económico es de tipo *burn-mint*: los usuarios queman CC para comprar traffic, y los validators, Super Validators y proveedores de aplicaciones mintean CC nuevos por aportar infraestructura, uso y disponibilidad.

Los parámetros los fijan los Super Validators por gobernanza. La tasa de conversión CC a USD on-chain es la mediana de las tasas que propone cada Super Validator, y el precio del traffic se calibra para que una transferencia estándar de CC cueste aproximadamente un dólar (CIP-0042). La CIP-0078 eliminó las fees de transferencia de CC; quedan las de traffic y una fee de expiración que aplica a monedas de valor muy bajo para evitar que se acumulen.

## Fuentes

- [What is Canton Network?](https://docs.canton.network/overview/understand/what-is-canton)
- [Canton Network in 5 Minutes](https://docs.canton.network/overview/understand/five-minute-overview)
- [The Ledger Model](https://docs.canton.network/overview/learn/ledger-model)
- [Ledger Model (Detailed)](https://docs.canton.network/overview/reference/ledger-model-detailed)
- [Architecture Overview](https://docs.canton.network/overview/learn/architecture)
- [Privacy Model Explained](https://docs.canton.network/overview/learn/privacy-model)
- [Two-Layer Consensus](https://docs.canton.network/overview/learn/two-layer-consensus)
- [How Transactions Work](https://docs.canton.network/overview/learn/how-transactions-work)
- [Ordering Consensus](https://docs.canton.network/overview/reference/ordering-consensus)
- [The Global Synchronizer](https://docs.canton.network/overview/understand/global-synchronizer)
- [Canton Coin: A Canton-Network-native payment application (PDF)](https://www.canton.network/hubfs/Canton%20Network%20Files/Documents/Canton%20Coin_%20A%20Canton-Network-native%20payment%20application.pdf)
- [CIP-0042](https://github.com/canton-foundation/cips)
- [CIP-0078](https://github.com/canton-foundation/cips/blob/main/cip-0078/cip-0078.md)
