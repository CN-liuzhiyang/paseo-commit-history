const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Past a week the elapsed count stops meaning anything; the date itself is more use. */
const ABSOLUTE_AFTER_MS = 7 * DAY_MS;

/**
 * A dense-list timestamp with the prose removed: "now", "5m", "2h", "3d", "Jan 15".
 *
 * Deliberately never sub-minute. A seconds label is only correct for the second it
 * was rendered, so everything under a minute is "now", which is both true and stable.
 */
export function formatCompactTimeAgo(date: Date, now: Date): string {
  const elapsedMs = now.getTime() - date.getTime();

  if (elapsedMs < MINUTE_MS) {
    return "now";
  }
  if (elapsedMs < HOUR_MS) {
    return `${Math.floor(elapsedMs / MINUTE_MS)}m`;
  }
  if (elapsedMs < DAY_MS) {
    return `${Math.floor(elapsedMs / HOUR_MS)}h`;
  }
  if (elapsedMs < ABSOLUTE_AFTER_MS) {
    return `${Math.floor(elapsedMs / DAY_MS)}d`;
  }

  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${month} ${date.getDate()}`;
}
