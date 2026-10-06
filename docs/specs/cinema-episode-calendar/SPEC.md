# Episode calendar for series

## Audited evidence / scope
The capability map lists a release calendar among the open cinema gaps. `CinemaEpisode.airDate` already exists, is entered in the series editor and is shown per episode on the title page; the download-link rule already treats an episode whose air date is in the future as not yet available. Nothing listed episodes across series by date. Games have their own release calendar; films have no release date field, so this slice is about series episodes only.

## Slice
Outcome: `/cinema/calendar` shows episodes of published series by air time in two ranges: upcoming (not aired yet, soonest first) and recently aired (latest first), 30 per page, grouped by calendar day in site time (Asia/Tehran) with the weekday, the date and the distance in days. Each row carries the series poster and name, the episode code (S02E07), the episode title and a mark when the episode or its series is for members, and leads to the series page. Opened without a choice while nothing is scheduled, the page shows the recent range instead of an empty one.

Owner: the cinema public read model (`src/modules/media/server/queries.ts`, `episodeCalendar`) with pure rules in `src/modules/cinema/domain/calendar.ts`. No new table. One additive index on `CinemaEpisode(airDate)` (migration `20261129120000_cinema_episode_air_date_index`), because the calendar reads episodes by date across all series.

Rules: only series that are published and whose publication time has passed; films, drafts and scheduled titles are left out; an episode without an air date is in neither range; the boundary between the ranges is the present moment, the same rule the link gate uses. The page is public, follows the cinema module switch and uses the existing cinema shell and tokens. It is linked from the section's quick menu.

Acceptance: unit tests in `scripts/media-admin.test.cjs` (range and page parsing, Tehran day, grouping, distance in calendar days, code, wiring and the index in both schemas); `scripts/cinema-calendar.connected.cjs` in `npm run test:pg` (order of both ranges, exclusions, member marks, the moving boundary, paging without loss or repetition); browser check at desktop and phone width, both ranges, second page and the empty state.

## Not included
Reminders for followed series, a personal calendar, a film release calendar (needs a release date on titles), iCal export and a calendar block on the cinema home page.

## Added: film releases (2026-10-07)
`CinemaTitle.releaseDate` (migration `20261207120000_cinema_release_date`, additive, with an index on kind, status and release day), set on the title form. `/cinema/calendar?kind=films`: published films whose publication time has passed and that have a release day; upcoming soonest first, released latest first; series, drafts, scheduled and undated films are left out. Acceptance: `scripts/cinema-calendar.connected.cjs`, six deliberate breaks. Still not included: a reminder for a followed film, a personal calendar, iCal.
