export const defaultEventTimezone = "UTC";

export function isEventTimezone(value: string) {
  if (value !== "UTC" && !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Timestamps remain UTC in storage; only presentation uses the event zone. */
export function eventTime(value: string | null | undefined, timezone: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: isEventTimezone(timezone) ? timezone : defaultEventTimezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function timezoneNotice(event: {
  timezone: string;
  timezone_source: string;
}) {
  return event.timezone_source === "default"
    ? `${event.timezone} · default, awaiting admin confirmation`
    : `${event.timezone} · ${event.timezone_source === "tba" ? "from TBA" : "set by admin"}`;
}
