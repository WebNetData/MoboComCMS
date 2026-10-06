# New-episode alerts for followed series

## Audited evidence / scope
The series page already offers "خبرم کن (قسمت جدید)": the shared follow switch (`ItemFavorite.notify`) with that wording. Music, games, software, studios and product prices each have a job that tells followers about a release through the inbox kind `FOLLOWED_UPDATE`. Series had none, so the switch promised something nothing delivered.

## Slice
Outcome: a member who follows a series with alerts on gets one inbox event when an episode of it airs ("قسمت تازهٔ <سریال>", season, number and episode title, link to the series). The inbox event fans out to SMS, email and push through the existing notification channels and the member's existing per-kind preferences.

Owner: `src/modules/cinema/server/episode-notifications.ts`, following the games release pattern (a cursor row per release, a bounded page of followers per run, the cursor moving only after the inbox write).

Data: new table `CinemaEpisodeAirNotification` (series, season, episode, due time, follower cursor, completion), migration `20261130120000_cinema_episode_air_notifications`. The episode is named by series, season and number because saving a series rebuilds its episode rows and their ids do not last. No backfill: existing episodes get no row.

Rules:
- Registered in the transaction of the series save. An episode is announced when its air date is still ahead or passed less than a day ago; older episodes of an imported or re-saved series are not.
- A changed date moves an announcement that has not gone out. One that has gone out is never repeated, whatever is edited afterwards. An episode that was removed or lost its date loses its pending announcement.
- Sent when the air time has passed and the series is published. Recipients: followers with alerts on who followed before the episode aired.
- The inbox dedupe key (series, season, episode, member) makes a repeat harmless.
- A row that no longer matches its episode does not block the queue: postponed episodes wait for their new date, missing ones are dropped.

Acceptance: `scripts/episode-air-alerts.connected.cjs` in `npm run test:pg` (registration rules, recipients, once only, re-saves, date changes, removals, a run stopped between two members, 55 followers over two runs, unpublished series, rows out of step with their episode); each of five deliberate faults in the code makes it fail. `scripts/job-step-isolation.test.cjs` covers the new step. On the running site: an editor added an episode airing 75 seconds later through the admin API, a following member had no event before it aired and exactly one after, still one a scheduler round later.

## Not included
Alerts ahead of the airing ("tomorrow"), a digest of several episodes, alerts for films, and following from the calendar page.
