# Blocks and profile privacy on the remaining community reads

## Audit

Blocking a member tells the blocker: "you will no longer see each other's posts and messages". The audit followed that promise and the profile privacy setting through every community read. Feeds, single posts, follow lists, the people directory, forum messages and mention notifications already honor both. Two reads did not.

1. **Comments.** A post's comment list (`getPost`) and the two-comment preview in feeds (`toViews`) showed every visible comment. A member who had blocked someone, or been blocked by them, still read that person's comments under any third member's post.
2. **Profile posts API.** `GET /api/people/:username/posts` (`profilePosts`) returned the owner's public posts to anyone. The profile page checks `canViewProfile` before calling it; the API did not. A guest could list the public-visibility posts of a private profile, and a member the owner had blocked could list the owner's posts.

Both were reproduced on `main` with the connected script (`COMMUNITY_BLOCK_BASELINE=origin/main`).

## Behavior

- A block hides the two members' comments from each other, in the post page and in the feed preview, the same way their posts are hidden. The preview still shows up to two comments the viewer may see. Everyone else, guests included, sees all comments. The stored comment count is not changed, so it can be higher than the number a blocking member sees.
- `profilePosts` applies the profile page's own gate: when the viewer may not view the profile (private, members-only for a guest, followers-only for a non-follower, or the owner blocked the viewer) it returns an empty list. The owner and staff are unaffected. A public profile is unchanged.

No schema change, no response shape change.

## Owner

`community` owns both reads; the block graph and the profile gate stay in `identity` (`blockedIds`, `canViewProfile`) and are reused.

## Acceptance

Real PostgreSQL: comments both directions of a block in post and preview, third parties and guests, unblocking, the count; profile posts for guest, member, owner and staff on a private profile, a public profile, a viewer the owner blocked, followers-only before and after following, an unknown owner. The same through the real HTTP routes on a dev server. Existing community tests, TypeScript, architecture, source and security checks, production build.

## Not in this slice

The profile "activity" tab lists the owner's posts to a viewer who blocked the owner (the page gate covers the other direction); whether a blocker should still see the profile of someone they blocked is a product choice and is left as it is. Reviews and forum threads are public content and are not filtered by blocks.
