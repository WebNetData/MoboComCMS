# Recommendation providers

Owner: `recommendations`. No table, no setting. A refactor of the private suggestions onto a contract, and one new signal.

## Rules
- The engine keeps: explicit consent before any history is read, the separate consent for listening, the bounds (at most six live seeds examined, two that contribute), what the member already has or rated, the publication recheck, and the admin pause.
- A provider answers "what goes with this item?" for one kind of item: `suggest(seed, { now, take })` → candidates with a score and the reason shown. Each kind has one provider; `useRecommendationProvider` replaces it and returns the way back.
- What a provider returns is cleaned: only real item references with a finite score, within the take. A provider that throws gives nothing for its seed and is logged; the other seeds still answer.
- Signal weights are in one place (`SEED_WEIGHT`): followed, saved and highly rated count 3, listened 2, viewed 0.
- New signal `rated`: the member's approved reviews of four stars or more, newest first. Anything the member has rated, at any score, is not suggested back. Read only after the main consent.

## Acceptance
`scripts/recommendation-providers.connected.cjs` and `scripts/recommendations-listening.connected.cjs` in `npm run test:pg`. Twelve deliberate breaks fail the first.

## Not included
A provider that asks an outside service, watching or purchase history as signals (each needs its own consent), a measure of quality.
