# MoboCom Toolchain v4

Goal: reduce wasted context while increasing correctness across backend, frontend, architecture, contracts, security and release work.

## Core context tools

### `trs`
Default wrapper for verbose terminal commands and compact repository digests.
Use for build/test/typecheck/lint/git/docker output. Raw output must remain recoverable.

### Probe
AST-aware, relevance-ranked code search without requiring a cloud vector database.
Use when the location is conceptually known but filenames/symbols are not.

### Serena
Semantic symbol/reference/editing MCP.
Use after scope is narrowed and you need definitions, references, callers or symbol-aware edits.

Routing:
`known exact → trs search/rg`
`unknown conceptual → Probe`
`deep symbols/references → Serena`

Do not use all three for the same lookup after the answer is known.

## Architecture/backend
- dependency-cruiser: module dependency direction/cycles.
- existing repository architecture checks: preserve and extend them.
- Hurl: readable HTTP scenarios.
- Testcontainers: real PostgreSQL/Redis/etc integration when mocks are insufficient.
- fast-check: property/invariant testing.
- StrykerJS: mutation testing for critical logic only.

## Contracts
- Spectral: OpenAPI/style/schema lint.
- oasdiff: breaking OpenAPI compatibility.
- Pact: independent consumer/provider and async message contracts.

## Frontend
- Storybook + `@storybook/nextjs-vite`: isolated component/state workshop.
- React Doctor: deterministic React/Next review. Run with telemetry disabled.
- Playwright CLI/Test: user flows, RTL/LTR, responsive behavior and visual baselines.
- Storybook a11y/axe: accessibility.

## Security/maintenance
- Opengrep: source/security/custom MoboCom rules.
- Trivy: vulnerabilities, secrets, misconfiguration/container/supply chain.
- zizmor: GitHub Actions security.
- Knip: unused files/exports/dependencies; verify before deletion.
- ast-grep: structural codemods/refactors.

## Optional scenario tooling
GitHub Spec Kit (`specify`) is installed as an optional helper for major feature specifications. Do not initialize or load its process for small fixes. MoboCom's own skills and repository invariants remain authoritative.
