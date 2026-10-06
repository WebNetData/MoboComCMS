# Modules, Plugins, Themes & Solution Packs Reference

Load this reference for extensibility work.

## 1. Vocabulary

**Module**: a substantial product/domain capability with lifecycle, data and routes.

**Plugin/Extension**: code that extends platform/module behavior through public extension contracts.

**Provider Adapter**: an implementation of an external-service port (payment, AI, email, hosting, storage...).

**Theme**: presentation package. Business logic does not belong in a theme.

**Solution Pack**: deploy/configuration preset combining modules, extensions, themes and settings for a business use-case.

## 2. Module activation invariants

Enabling/disabling must be atomic from Admin's perspective.

Before state change:
- resolve dependency graph;
- verify compatibility;
- ensure no required dependency will disappear;
- validate settings;
- determine route/job/search/event changes.

On disable:
- preserve schema/data;
- stop runtime registrations;
- keep references renderable with graceful unavailable states;
- do not leave navigation/routes throwing exceptions.

## 3. Plugin contract stability

Expose a small public extension API.

Never document private implementation paths as plugin API.

When breaking extension contracts:
- bump Extension API major version;
- provide deprecation window/migration guide where practical.

## 4. Plugin scopes

### Platform-wide
May register integrations spanning multiple modules, but still through public registries/contracts.

### Module-targeted
Declares target module capability/version and fails activation gracefully if dependency is absent.

## 5. Suggested plugin registration points

Only add when used:
- settings
- permissions
- admin nav/page
- public route
- API route
- jobs
- event handler
- webhook handler/producer
- UI slot contribution
- search provider
- notification definition/provider
- provider adapter
- entity action

## 6. Migrations

Each extension that owns DB schema must have deterministic migrations.

Platform update must know migration status before enabling the extension.

Do not remove plugin-owned tables/data on disable.

Uninstall and purge are separate.

## 7. Theme capabilities

Theme may provide:
- tokens
- typography
- icons/assets
- layouts
- documented domain presentation overrides
- theme settings

Prefer inheritance/composition over copying an entire site theme per module.

## 8. Theme assignment

Admin UX should allow:
- site default theme
- module-specific theme override
- preview
- compatibility warning
- revert to default

Activation should not edit content records.

## 9. Protected MoboCom appearance

First-party themes/layouts for Home, Magazine, Music, Games, Movies and Series must preserve approved current appearance while internals become more systematic.

## 10. Solution Packs

Installing a Solution Pack should be an explainable plan:
- enable these modules
- install/recommend these extensions
- assign these themes
- apply these default settings
- optionally import starter content

Do not silently overwrite existing site configuration/content.

Support preview/dry-run for destructive or broad changes.
