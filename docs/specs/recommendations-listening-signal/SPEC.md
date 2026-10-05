# Listening history as a private recommendation signal

## Audit and owner

`recommendations` already builds the private "For you" shelf in the member's library from favorites, recent views and followed creators, after explicit consent (`User.recommendationOptIn`), with an administrator pause. `music` already keeps a private listening history (`MusicListenHistory`: play count, progress, completion) that the member can see and clear. The two were not connected: what a member actually listens to had no effect on what is suggested. The capability map lists this as "deeper listening signals".

`recommendations` stays the owner of the shelf, `music` of the history. No new tracking.

## Consent

The existing consent text names favorites and recent views. Listening history is a different kind of data, so members who accepted that text have not agreed to it. It therefore has its own switch, `User.recommendationListeningOptIn`, off for everyone, shown under the existing one in account settings with a plain description. It has an effect only while the general switch is on.

Without this consent the listening history is not read at all by the recommendation code. Turning it off, or clearing the listening history, removes the effect on the next request, including for a result being computed at that moment.

## Behavior

A track is a signal when the member finished it or played it at least twice, and last played it within 180 days. A single start is not a signal. Up to twelve such tracks, most played first, join the content seeds between favorites and views: stronger than a page view, weaker than a deliberate favorite. Each seed goes through the existing cross-artist genre discovery for tracks, with the existing bounds on sources and results.

Tracks the member already played (the latest 300) are not suggested back. Unpublished tracks are never suggested, as before.

The shelf names the source: "because you listened to «…»".

## Data, API and compatibility

Additive migration `20261126120000_recommendation_listening_consent`: one boolean column, default false. `GET/PATCH /api/profile` gain `recommendationListeningOptIn` (boolean; anything else is refused). Clients that do not send it change nothing. With the administrator pause on, nothing is read, as before.

## Acceptance

Real PostgreSQL: no consent, listening switch alone, general consent alone with zero reads of the history, both on, finished versus single start versus repeated, time window, heard and unpublished tracks left out, another member's history, favorite outranking listening, withdrawal, clearing. Browser, RTL, dark and light, desktop and mobile: both switches saved through the profile API, the shelf before and after, no overflow. TypeScript, architecture, source, schema, security and i18n checks, production build.

## Not in this slice

Measured recommendation quality; listening signals for albums and artists; skip detection.
