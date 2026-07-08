# Challenge Solution

A brief overview of how the challenge was approached, along three axes:
**architecture**, **software design principles**, and **testing**.

## 1. Architecture

The backbone is a **strict separation between pure logic (decisions) and I/O
(effects)**. Each capability is split into two pieces:

| Pure decision (no I/O)         | Effect / orchestration (I/O)         |
|--------------------------------|--------------------------------------|
| `reportBuilder.ts`             | `ReportGenerationJob.ts`             |
| `finalResultBuilder.ts`        | `finalizeWorkflow.ts`                |
| `workflowStatusSummary.ts`     | `workflowQueryService.ts`            |
| `workflowResults.ts`           | `workflowQueryService.ts`            |
| `dependencyUtils.ts`           | `taskWorker.ts` / `taskRunner.ts`    |

The pure function takes plain data (statuses, arrays, strings) and returns a
decision; the I/O layer loads entities via TypeORM, invokes the decision, and
persists. This keeps business logic testable without a database.

**Explicit HTTP layer** (`src/http/`): `jsonController` + `asyncHandler` turn an
`async` handler into an Express controller that centralizes response sending;
`HttpError`/`NotFoundError` + `errorMiddleware` translate domain errors into HTTP
status codes. Controllers stay **HTTP-only**: they merely map
`req → service → SuccessResult | throw HttpError`. Data access lives in
`WorkflowQueryService` (application layer), not in the routes.

**Centralized finalization** (`finalizeWorkflow`): a single source of truth for a
workflow's terminal state. It is invoked from *every* settle path (success and
failure in `TaskRunner`, plus the worker's cascade-fail), so a workflow is never
left stuck in `in_progress`. The module comment makes the concurrency assumption
explicit (serialized poller; no optimistic lock) instead of hiding it.

## 2. Design principles

- **SRP**: each module has one reason to change. The challenge asked to "modify
  the TaskRunner" for dependencies; instead the readiness *decision* lives in
  `checkDependencyReadiness` (pure) and the TaskRunner only orchestrates.
- **OCP / polymorphism**: jobs implement the `Job` interface (`run(task)`) and
  are resolved by `JobFactory` (`taskType → Job`). Adding a new job
  (`PolygonAreaJob`, `ReportGenerationJob`) does not touch the `TaskRunner`.
- **Deliberate YAGNI**: abstractions the challenge didn't justify were dropped
  (e.g. an Adapter pattern around @turf, or a generic DAG engine). Dependencies
  are modeled with a **single `dependsOn` FK** plus cycle detection via DFS
  (`detectCycle`) in the factory — enough for a dependency tree, without the
  complexity of an arbitrary graph.
- **State as data, not scattered conditionals**: mappings live in lookup tables
  (`STATUS_TO_OUTCOME`, `SETTLED_STATUSES`, status→outcome MAP) rather than
  `if/switch` chains, making each state's handling exhaustive and readable.
- **Typed, fail-safe errors**: invalid GeoJSON marks the task `failed` gracefully
  (task 1); the report validates that preceding tasks are *settled* before
  aggregating (task 2); `resolveWorkflowResults` returns `ready:false` → `400`
  when the workflow isn't complete (task 6). Failures are folded into the
  report/finalResult instead of being lost (tasks 2 and 4).

## 3. Testing

No test runner was preconfigured in the challenge; **Vitest** was added with two
levels:

- **Unit tests over the pure functions** (`*.test.ts`): `reportBuilder`,
  `finalResultBuilder`, `workflowStatusSummary`, `workflowResults`,
  `taskOutcome`, `dependencyUtils`, `PolygonAreaJob`, `DataAnalysisJob`. Being
  pure, they exercise decisions and edge cases (cycles, dangling references,
  unsettled tasks, corrupt JSON) with no mocks and no database.
- **In-memory end-to-end** (`*.e2e.test.ts`): in-memory SQLite with the real
  entities to cover full I/O paths: `taskWorker.e2e`, `finalizeWorkflow.e2e`,
  `ReportGenerationJob.e2e`, `workflowRoutes.e2e`, `workflowQueryService.e2e`.
  They assert the observable contract (HTTP `200/400/404`, `finalResult`
  persistence, failure cascade) exactly as a client would see it.

Style is **AAA + BDD**: nested `describe` blocks with *given/when* and
Arrange/Act/Assert comments. The pure/IO split is what makes this testing cheap:
the hard logic is tested as functions, and the e2e suite only confirms the wiring.
