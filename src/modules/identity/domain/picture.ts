/**
 * The picture shown for a person wherever their name stands (a comment, a review, the author card): the one they
 * put on their public profile, else the one that came with their Telegram sign-in, else none — the caller then
 * draws the coloured initial.
 */
export function pictureOf(user: { telegramPhoto?: string | null; userProfile?: { avatar?: string | null } | null } | null | undefined): string {
  return user?.userProfile?.avatar || user?.telegramPhoto || ''
}
