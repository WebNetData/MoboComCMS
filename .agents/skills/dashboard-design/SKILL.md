---
name: dashboard-design
description: "Design a MoboCom data dashboard and choose chart, filter and table behavior when selected by Premium Design."
---

<!-- mobocom-external-skill:start -->
Use this companion when selected by [MoboCom Premium Design](../../../.agents/skills/mobocom-premium-design/SKILL.md). Follow [engineering skill rules](../../../docs/agent/ENGINEERING_SKILLS.md) and approved MoboCom ownership, tokens, layouts and tooling. This project edition is scoped to the guidance below.
<!-- mobocom-external-skill:end -->

# Dashboard Design for MoboCom

Start with the decision the dashboard supports and the authorized dataset. Define metric, unit, aggregation, date range, comparison period and missing-data behavior. Derive the hierarchy from that decision. Use a line for time series, bars with a zero baseline for magnitude comparisons, and a table or text alternative when values need precise comparison or accessible reading. Show unavailable comparisons and zero denominators explicitly. Never fabricate a trend.

Use existing owners for filters, permissions and server-derived statistics. A date or scope change must update every affected panel coherently. Keep loading, no data, filtered empty, stale, error and permission states distinct. Export only if requested and authorized by the data owner. Verify known fixtures, filter feedback, responsive labels and visible keyboard access with Playwright.

This project adaptation uses the MoboCom data and component stack. Upstream package version 2.1.0 declares MIT. The upstream repository did not supply a separate license file, so this edition summarizes the reviewed guidance without vendoring its original content. The package's global postinstall, chart presets and example dependencies were excluded.

Reviewed upstream: [Judiedesigns/dashboard-design-skill/skills/dashboard-design](https://github.com/Judiedesigns/dashboard-design-skill/tree/6a557f03aa52306a7a17439a6004124e9df99764/skills/dashboard-design) at `6a557f03aa52306a7a17439a6004124e9df99764`.
