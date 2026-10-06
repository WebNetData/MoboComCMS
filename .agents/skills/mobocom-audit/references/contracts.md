# API / Event Contract Strategy

## Internal modular-monolith boundary
Use:
- strict TypeScript contracts
- dependency rules
- integration tests
- domain events where loose coupling helps

Do not use Pact just to test every internal function call.

## Public/mobile HTTP
Use:
- OpenAPI
- Spectral lint
- Hurl scenarios
- oasdiff breaking-change gate

## Independent consumers
Use Pact when a consumer can evolve/deploy separately, including:
- future mobile apps
- future Messenger service/client boundary
- external first-party web apps
- external integrations where consumer expectations matter
- async message/event contracts when useful

Keep Pact expectations minimal: match what the consumer needs, not every field the provider happens to return.

## Compatibility-sensitive MoboCom surfaces
- Identity/auth/session/device
- Profile
- Notifications
- Media references
- Entitlements/subscriptions
- Orders/status
- Realtime/Messenger contracts
- Extension API

## Event evolution
Prefer additive fields and tolerant consumers.
Version or replace event types when semantics change incompatibly.
Critical side effects use transactional/outbox reliability where warranted.
