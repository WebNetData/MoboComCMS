# Professional Scenario / Spec Workflow

Use only for non-trivial work.

Create a compact feature spec under `docs/specs/<feature>/SPEC.md` containing:
- outcome
- existing implementation evidence
- canonical owner module
- actors/authorization
- happy path
- edge/failure/empty/loading paths
- module-disabled behavior
- data invariants
- Admin settings
- API/events/extensions
- identity implications
- privacy/security
- RTL/LTR/mobile/desktop behavior if UI exists
- migration/backward compatibility
- acceptance tests and commands

Then implement in vertical slices:
domain/data → application → authorization/settings → API/UI → tests → gates.

Do not produce a giant speculative document for a small change.

GitHub Spec Kit may be used for major new subsystems if intentionally initialized, but it must not override MoboCom architecture or repository truth.
