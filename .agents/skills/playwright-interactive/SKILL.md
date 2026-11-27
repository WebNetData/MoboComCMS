---
name: playwright-interactive
description: "Use a persistent browser session for local MoboCom UI exploration when selected by Premium Design."
---

<!-- mobocom-external-skill:start -->
Use this companion when selected by [MoboCom Premium Design](../../../.agents/skills/mobocom-premium-design/SKILL.md). Follow [engineering skill rules](../../../docs/agent/ENGINEERING_SKILLS.md) and approved MoboCom ownership, tokens, layouts and tooling. This project edition is scoped to the guidance below.
<!-- mobocom-external-skill:end -->

# Playwright Interactive for MoboCom

Use an available isolated Playwright MCP session or a supported persistent Playwright REPL when needed. Reuse its browser and tab across related checks. Load the exact safe fixture route, inspect the current rendered controls, exercise the action, and capture evidence of the resulting state. Check the intended viewport, theme, focus and screenshots. Use Playwright Test/CLI for repeatable product regressions. Close any browser contexts and runtime processes created for the task when done.

Use the existing permissions and installed tooling. This text adaptation does not ask for relaxed sandbox settings, global configuration changes, browser installs, additional packages or Electron support. If interactive tooling is unavailable, run the scoped Playwright tests and report any verification gaps.

Reviewed upstream: [openai/skills/skills/.curated/playwright-interactive](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/playwright-interactive) at `49f948faa9258a0c61caceaf225e179651397431`.
