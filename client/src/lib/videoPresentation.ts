export function getVideoArtistLabel(artist?: string | null) {
  const trimmed = artist?.trim();
  return trimmed ? trimmed : null;
}
