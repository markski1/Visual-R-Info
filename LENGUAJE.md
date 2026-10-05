# Lenguaje y runtime

Visual R-Info interpreta programas R-Info directamente en el navegador. No traduce el código a otro lenguaje: primero lo analiza, construye una representación propia y luego la ejecuta mediante un runtime determinista.

## Recorrido completo

```text
fuente .ri
  -> lexer
  -> tokens y trivia
  -> parser
  -> AST
  -> análisis semántico
  -> ValidatedProgram
  -> cargador de escenario
  -> ExecutionState
  -> runtime paso a paso
  -> eventos, snapshot y visualizador
```

La función que coordina el análisis es `analyze()` en [`src/lib/language/analysis/analyze.ts`](src/lib/language/analysis/analyze.ts). Devuelve siempre el AST y los diagnósticos encontrados; sólo incluye `program` cuando no hay errores. Ese `ValidatedProgram` es la única entrada aceptada por el runtime.

## Estructura del código

```text
src/lib/
  language/
    lexer/       caracteres -> tokens y trivia
    parser/      tokens -> AST
    ast/         tipos de nodos y rangos de fuente
    semantics/   ámbitos, símbolos y tipos
    analysis/    orquestación del análisis
    diagnostics/ diagnósticos estables por fase
  runtime/
    model/       ciudad, coordenadas, áreas, robots y escenarios
    loader/      bloque principal -> escenario inicial
    state/       ambientes, frames y estado de ejecución
    evaluator/   expresiones y sensores
    executor/    intérprete incremental y eventos
  editor/        CodeMirror, diagnósticos y ayudas del editor
  visualizer/   Canvas de la ciudad
  inspector/    árbol del programa y traza del scheduler
```

`language` no depende de Svelte, DOM ni Canvas. `runtime` sólo depende de `language` y la UI observa snapshots y eventos, pero NO altera la semántica del programa.

## 1. Lexer: caracteres a tokens

El lexer está en [`src/lib/language/lexer/lexer.ts`](src/lib/language/lexer/lexer.ts). Pasa carácter por carácter y se trae:

- **tokens**, como `programa`, `mover`, `:=`, `AreaC`, `42` o `(`.
- **trivia**, como espacios, saltos de línea y comentarios `{ ... }`.
- **diagnósticos**, por ejemplo un símbolo que no pertenece al lenguaje o un comentario sin cerrar.

Los identificadores admiten letras Unicode y `_`. Los offsets, líneas y columnas se guardan en cada token; el offset usa unidades UTF-16 para coincidir con CodeMirror. Los comentarios no llegan al parser, pero conservarlos permite mostrar rangos precisos y deja abierta la puerta a herramientas de formato.

## 2. Parser: tokens a AST

El parser está repartido entre:

- [`program-parser.ts`](src/lib/language/parser/program-parser.ts), para la estructura completa del programa.
- [`expression-parser.ts`](src/lib/language/parser/expression-parser.ts), para expresiones y precedencia de operadores.

El AST no depende de la indentación. Por ejemplo, un programa se modela con secciones de procesos, áreas, robots, variables y bloque principal; un `si` contiene su condición y dos ramas; una expresión binaria contiene operador, lado izquierdo y lado derecho.

Todos los nodos tienen:

- `kind`: el tipo concreto de nodo.
- `id`: un identificador estable derivado del tipo y rango.
- `span`: rango de fuente semia-bierto, usado para diagnósticos, el resaltado de ejecución y el árbol “Cómo entiende el programa”.

Para expresiones se usa precedencia explícita. Así, `n + 2 * 3` se interpreta como `n + (2 * 3)`, y los operadores de igual precedencia se asocian hacia la izquierda. El parser también intenta recuperarse ante errores para informar más de un problema en una sola validación.

## 3. Análisis semántico: AST válido o diagnósticos

El análisis semántico vive en [`src/lib/language/semantics/semantic-analyzer.ts`](src/lib/language/semantics/semantic-analyzer.ts). Revisa reglas que no se pueden chequear por texto:

- nombres declarados y duplicados.
- ámbitos de programa, proceso y robot.
- tipos `numero`, `boolean`, área y tipos de robot.
- asignaciones, operadores y condiciones compatibles.
- aridad y tipos de primitivas, procesos y parámetros `E`, `S` y `ES`.
- referencias correctas en `AsignarArea`, `Iniciar`, mensajería y CMRE.

Primero se registran las declaraciones globales y luego se analizan las instrucciones. Esto permite usar procesos y tipos de robot definidos en otra parte del archivo. Los ámbitos se usan durante el análisis para producir diagnósticos `SEMxxx` en español.

## 4. Programa validado y diagnóstico

`analyze()` ordena los diagnósticos por posición y fase:

```text
lexer -> parser -> semantic -> runtime
```

Si lexer, parser o análisis semántico producen un error, no se crea un `ValidatedProgram` ejecutable. La UI puede seguir mostrando el AST y los errores, pero no puede ejecutar código incompleto o ambiguo.

Los diagnósticos tienen código, fase, severidad, mensaje y rango de fuente. Los errores del runtime siguen el mismo modelo, con códigos `RUNxxx` y el rango de la instrucción responsable cuando corresponde.

## 5. Escenario y estado inicial

Antes de ejecutar, [`src/lib/runtime/loader/program-loader.ts`](src/lib/runtime/loader/program-loader.ts) transforma las áreas, declaraciones de robots y el bloque principal en un escenario:

- valida los límites de áreas.
- aplica `AsignarArea` e `Iniciar`.
- determina la posición inicial de cada robot.
- combina los objetos del escenario visual con el programa.

Luego [`src/lib/runtime/state/execution-state.ts`](src/lib/runtime/state/execution-state.ts) crea un `ExecutionState` independiente. La ciudad es dispersa: sólo guarda esquinas con flores o papeles. Cada robot recibe su propia posición, bolsa, variables y pila de frames. las variables globales y de procesos usan ambientes encadenados.

Validar un programa ya construye este estado inicial. Por eso la ciudad y los robots se ven antes de ejecutar el primer paso.

## 6. Runtime: una instrucción visible por paso

[`src/lib/runtime/executor/runtime.ts`](src/lib/runtime/executor/runtime.ts) contiene `RInfoRuntime`. Su API principal es:

```ts
const created = createRuntime(program, scenarioSettings);
const runtime = created.value;

const events = runtime.step();
const snapshot = runtime.getSnapshot();
```

El runtime usa frames explícitos para bloques, `mientras`, `repetir` y procesos. No representa los bucles con recursión JavaScript; esto permite pausar, resetear, inspeccionar y avanzar de a una unidad didáctica.

Cada `step()` selecciona un robot listo, emite `instruction-started`, ejecuta una instrucción y devuelve los cambios visibles. Hay un límite de pasos para detener ciclos que no terminan con `RUN020`.

El evaluador de expresiones está en [`src/lib/runtime/evaluator/expression-evaluator.ts`](src/lib/runtime/evaluator/expression-evaluator.ts). Resuelve variables, sensores, operaciones enteras, comparaciones y cortocircuito lógico. Las operaciones inválidas devuelven resultados de error explícitos; no se usan excepciones como flujo normal.

## CMRE y scheduler

El runtime implementa CMRE (_Concurrent Multi Robot Environment_) mediante un scheduler determinista de turnos. Con varios robots, cada llamada a `step()` entrega un turno al siguiente robot activo. También maneja:

- mensajes con `enviarMensaje` y `recibirMensaje`.
- espera de un mensaje o de una esquina bloqueada.
- `bloquearEsquina` y `liberarEsquina`.
- detección de espera global cuando todos los robots quedan bloqueados.

La sección **Concurrencia y scheduler** del inspector se construye a partir de esos eventos. Muestra qué robot recibió cada turno, la línea ejecutada y su resultado; sólo aparece cuando hay dos o más robots.

## Eventos y UI

Los eventos están definidos en [`src/lib/runtime/executor/events.ts`](src/lib/runtime/executor/events.ts). Entre otros, incluyen:

- `instruction-started`.
- `robot-moved` y `robot-turned`.
- objetos tomados o depositados.
- salida de `Informar`.
- mensajes, bloqueos y desbloqueos.
- `runtime-error` y `program-finished`.

La ruta principal consume estos eventos para actualizar el resaltado de línea, la traza del robot, el inspector, la salida y el canvas. El snapshot es una copia desacoplada del estado, por lo que la presentación no modifica el intérprete.

## Límites de compatibilidad

El objetivo es reproducir R-Info de escritorio, pero algunas reglas históricas todavía requieren fixtures reproducibles o documentación institucional: rango exacto de `numero`, overflow, división negativa, detalles de `repetir`, orden de evaluación y formato `.lmre`.

Cuando una regla no está comprobada, se evita presentarla como compatibilidad garantizada. La implementación actual prioriza diagnósticos claros, ejecución determinista y pruebas unitarias sobre suposiciones.

## Pruebas y contribuciones

Las pruebas unitarias viven junto a cada módulo y los programas de ejemplo se encuentran en [`tests/fixtures`](tests/fixtures). Al cambiar una construcción del lenguaje, actualizá de forma coordinada:

1. tokens y lexer.
2. parser y AST.
3. análisis semántico y diagnósticos.
4. runtime y eventos.
5. editor, visualizador o inspector si corresponde.
6. pruebas y fixtures.

Para verificar el proyecto completo:

```sh
pnpm validate
```
