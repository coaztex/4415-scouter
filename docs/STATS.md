# Event Stats

`/events/[eventKey]/stats` reads the same validated final 2026 version-2 scouting records and cached provider metrics as the Teams module. Queries are batched by event; normal Stats views never call TBA or Statbotics. RLS determines the records visible to the current role. Scouts see their readable records; strategy/admin see event-wide observations.

The 2026 game module owns the event and team aggregate, metric selectors, activity durations, role frequencies, auto outcomes, defense, reliability, and recent issue trend. Stats presentation joins those outputs to cached TBA and Statbotics values without blending evidence sources. One canonical final record per event/match/team enters analytics. Invalid or legacy payloads are excluded from current-season rankings.

Sections are Overview, Scoring, Support / Passing, Auto, Defense, Reliability, and External / EPA / OPR. URL parameters retain section, ranking metric, direction, minimum metric sample, confidence opt-in, and selected comparison team. Scouting rankings default to at least two metric samples. Rows show the relevant metric denominator and total scouted matches. Unknown values are `—` and sort last in either direction; observed zero remains zero. External rankings are unaffected by the scouting sample filter.

Default FUEL aggregates exclude `very_uncertain` estimates and DNS/DNF matches. The explicit control can include very-uncertain estimates from completed matches; DNS/DNF output remains visible on the underlying match record but does not enter default offensive rankings. Missing observations never become artificial zeroes. Availability is measured separately by the full-match rate. FUEL standard deviation is the population standard deviation of observed TELEOP estimates and is not a confidence interval. AUTO execution rates require at least two known observations for a ranking value.

Shuttling / passing duration is time in a state, not FUEL volume. Defense effectiveness is a subjective scout rating. Pit-reported autonomous routines are displayed separately from match-observed AUTO success. Recent notable-issue change compares the rate in the latest three observed matches with the previous three, and only appears after six observations.

The cross-source team inspection shows human FUEL estimates, TBA component estimates, and Statbotics EPA separately. The neutral **Worth reviewing** marker follows the Teams module threshold when human mean total FUEL and TBA total FUEL COPR are both present. It links to the team profile and underlying match records. No combined score or automatic correction is generated.

No chart dependency was added; the tables and compact summaries answer the current questions more directly. Tests cover numerical summaries, confidence handling, activity durations, roles, auto, defense, reliability, sample thresholds, and zero versus missing behavior.
