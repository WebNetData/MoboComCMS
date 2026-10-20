# Search speed measurement

`scripts/search-measure.cjs` times the public search API (`/api/search`) of a running site. It is a measuring tool, not a test, and its numbers describe the machine and data it ran on.

## Safety

- Run it only against a **local or staging copy** of the database. It refuses to start without `--scratch-database`, and it refuses any `--base` address that is not local.
- The synthetic mode briefly adds published posts, and any visitor of that site could see them. It removes them afterwards (unless `--keep`) and restores the search index stamp.
- Both modes subtract the analytics search counts that their own requests added.
- The public search allows 60 requests a minute per address. The tool waits about 1.1 s between requests and waits out a 429 instead of getting around the limit.

## Usage

Run it where `DATABASE_URL` points at the same database as the app at `--base`. For the local stack, that means inside the app container:

```sh
docker cp scripts/search-measure.cjs mobocom-app:/tmp/search-measure.cjs
docker exec mobocom-app sh -c 'cd /app && NODE_PATH=/app/node_modules node /tmp/search-measure.cjs --scratch-database --docs=20000 --runs=5'
```

- `--docs=N` (default 20000, at most 500000): synthetic documents to add. Every document contains one marker word; every 2nd, 10th and 100th document, and exactly one document, contain further markers. The questions therefore match a known number of documents.
- `--runs=N` (default 5): timed requests per question, after one warm-up.
- `--real=N`: adds nothing. It replays the N searches that were asked most often in the last 30 days, taken from the analytics counts. On a copy restored from a production backup, this shows the real query distribution against the real index.
- `--container=NAME`: reports the container's memory before and after (needs the docker CLI where the tool runs).

## Local results before the cap, 2026-10-20

Setup: Windows 11 with Docker Desktop, the local preview app in development mode (`next dev --turbopack`), and PostgreSQL 17 in a container. Times are in milliseconds, measured at the client, and include Next.js. The text is synthetic. A production build adds less overhead per request, but most of the time goes to reading and ranking matches, which the build mode does not change.

| Question (matches) | 20,000 docs, median | 100,000 docs, median |
|---|---|---|
| one match | 29 | 62 |
| 1% | 37 (200) | 128 (1,000) |
| 10% | 293 (2,000) | 519 (10,000) |
| 50% | 424 (10,000) | 2,347 (50,000) |
| every document | 793 (20,000) | 4,451 (100,000) |
| every document, page 50 or past it (cursor) | 798 / 850 | 4,484 / 4,462 |
| a common Persian word (70% of documents) | 580 | 3,198 |
| autocomplete | 34 | 47 |

### What this shows

- **Time grew with the number of matching documents, not with the size of the index.** A search read every match in batches of 500 (`SearchDocument` in id order, `LIKE '%word%'`), checks each batch against the owners' public cards, and ranks all of them. That costs about 45 µs per match here. A word that appears in most documents therefore costs seconds once an index reaches about 100,000 documents.
- **A rare word gets slower as the index grows.** No index serves `LIKE '%word%'`, so finding the first 500 matches is a full table scan: 7.6 ms on 20,000 rows and 37 ms on 100,000.
- **Autocomplete stays fast.** It reads a fixed sample of 400 candidates.

## The owner's choice: a cap of 5,000 matches (2026-10-20)

Of the three options (a cap, a `pg_trgm` trigram index, PostgreSQL full-text ranking) the owner chose the cap (`docs/agent/PLATFORM_DECISIONS.md` 6Y). `searchSite` now reads `SearchDocument` newest published first (keyset on `publishedAt`, `id`, index `SearchDocument_publishedAt_id_idx`) and stops once the list asked for has `MAX_SCANNED_MATCHES` = 5,000 matches. It ranks those and answers `capped: true`; the search page shows counts as "N+" with one line of explanation. Words with fewer matches are read to the end; autocomplete is unchanged. The index rows are created per type during a rebuild, so reading in id order would have favoured one content type; reading by date does not.

Same setup, 100,000 documents, median, after the cap and the index:

| Question (matches) | before | after |
|---|---|---|
| one match | 62 | 41 |
| 1% | 128 (1,000) | 145 (1,000) |
| 10% | 519 (10,000) | 382 (5,000+) |
| 50% | 2,347 (50,000) | 251 (5,000+) |
| every document | 4,451 (100,000) | 243 (5,000+) |
| every document, past page 50 (cursor) | 4,462 | 229 |
| a common Persian word (70%) | 3,198 | 259 (5,000+) |
| autocomplete | 47 | 41 |

Without the new index each batch had to sort all matches by date (10%: 706 ms); with it the slowest question is about 0.4 s. Run-to-run variation is tens of milliseconds. The tool accepts capped answers and prints their totals as "N+".

**Still owed:** run `--real` on a copy restored from a production backup. The real query distribution decides whether 5,000 is the right cap and whether rare words need the trigram index later.
