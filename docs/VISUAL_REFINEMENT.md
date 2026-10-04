# Visual refinement

Semantic light and dark colors live in `src/app/globals.css`. The default follows the device theme. The header control cycles System → Light → Dark and stores only that choice in localStorage. A tiny early script applies a saved choice before hydration. The palette covers surfaces, text, muted text, borders, focus, action colors, red/blue alliances, and complete/in-progress/missing/review scouting states. Filled action text uses separate on-color tokens so a dark theme never puts white text on a light accent.

Pit and Teams show labeled, symbolic scouting chips: ✓ Completed, ◐ In progress, ! Not scouted, and ! Needs review. Schedule team pills use the same semantic state palette independently of their alliance section. Status remains text-readable without color. The avatar keeps a neutral white artboard so transparent team logos remain legible in either theme.

The event home and shared cards use less empty space; pit and Teams emphasize status and team identity; My Match Scouting keeps the next assignment foremost and displays times in the event timezone. Schedule, Match Details, and Match Prep retain official state and evidence while shortening routine navigation labels. Stats summary tiles are denser. Picklist keeps role/sample and reliability concerns visible while putting the long score-policy explanation behind a disclosure.

The app has no chart component at present. Loading bars use theme tokens. Primary buttons, tabs, navigation, and active activity controls use on-color tokens; focus outlines remain visible. Long nicknames wrap inside cards. The main touch controls remain at least 44–48px tall; the match capture FUEL controls remain larger.
