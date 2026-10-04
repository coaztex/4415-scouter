export function eventDates(start: string | null, end: string | null) {
  const format = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  if (!start) return end ? `Ends ${format(end)}` : "Dates to be announced";
  return end && end !== start
    ? `${format(start)} – ${format(end)}`
    : format(start);
}
export function eventLocation(event: {
  city: string | null;
  state: string | null;
  country: string | null;
}) {
  return [event.city, event.state, event.country].filter(Boolean).join(", ");
}

export function shortEventLabel(event: {
  name: string;
  short_name?: string | null;
}) {
  const name = (event.short_name?.trim() || event.name)
    .replace(/\s+presented by\b.*$/i, "")
    .trim();
  if (name.length <= 38) return name;
  const cut = name.slice(0, 38).replace(/\s+\S*$/, "");
  return `${cut || name.slice(0, 38)}…`;
}
