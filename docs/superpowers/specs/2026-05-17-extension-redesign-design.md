# Chrome extension redesign

## Goal

Redesign the Chrome extension popup so it feels like a compact thèque capture surface aligned with the web app. The redesign keeps every current behavior intact while making two additions visible: a contextual path into thèque and an optional category hint for the item being saved.

## Current functionality to preserve

- The popup stores and uses the existing `bmly_...` capture token from `chrome.storage.local`.
- The logged-in connection flow remains: the popup opens `/settings/extension-connect` with the extension id, and the web app sends the capture token back to the extension.
- The popup shows connection status, including the connected email when available.
- The user can save the active normal web tab.
- Restricted browser/extension URLs still show an error instead of attempting capture.
- The note field remains optional and keeps the existing 2000 character limit.
- Save feedback still distinguishes success, duplicate/already-saved, expired/revoked token, API errors, and network errors.
- Settings/reconnect information remains available, but it should stay visually secondary.

## Chosen direction

Use the "Capture Card" layout from the visual brainstorm. The popup should read as a small card-based form:

1. Header with the thèque wordmark and a secondary contextual action.
2. A compact current-tab or connection card.
3. Optional category hint.
4. Optional note.
5. One primary save button.
6. Secondary settings/reconnect details.

This direction is the strongest fit because it mirrors the web app's card-plus-form rhythm, gives the new category field enough presence to be useful, and keeps saving as the dominant action.

## Product copy and brand rules

- Use `thèque` everywhere in user-facing extension UI copy.
- Do not use unaccented or capitalized variants in extension labels, buttons, statuses, or settings copy.
- Keep the lowercase serif wordmark style from the web app.
- Keep the warm palette used by the web app: `#faf8f5` background, `#fffefb` surfaces, stone foregrounds, and amber primary action.

## Category hint behavior

The category field is a hint, not a hard manual override.

- Default value: `Auto`.
- Visible choices use shelf-style labels: `Books`, `Watch`, `Eat`, `Shop`, `Travel`, `Read`, `Cook`.
- The hint should be sent with capture when the user selects anything other than `Auto`.
- Enrichment and classification may still replace or refine the final item category.
- The implementation should make the "hint" semantics clear in API naming and UI copy so it is not mistaken for a manual item edit.

The shelf labels map to item categories as follows:

- `Books` -> `books`
- `Watch` -> `movies_and_tv`
- `Eat` -> `restaurants`
- `Shop` -> `products`
- `Travel` -> `travel`
- `Read` -> `articles`
- `Cook` -> `recipes`

`gifts` stays out of the first extension UI because the user chose shelf-style labels. If needed later, Shop can be split into Products and Gifts or handled by enrichment.

## Open thèque Behavior

The popup should include a contextual `Open thèque` action.

- When connected, it opens the web app library.
- When disconnected, it guides the user to connect the extension instead of opening a generic app page.
- It remains secondary to the save button when the user is connected.
- It should not remove or hide the existing `Connect to thèque` path.

## Visual structure

The popup should keep a narrow extension-friendly width while feeling closer to the web app:

- Header: wordmark, short helper text, and the secondary open/connect action.
- Status/current tab card: shows connected state or the current tab domain/title if available.
- Category hint: compact select or select-like control with `Auto` as the default.
- Note: same optional note field, with friendlier copy such as "Add a note for future you".
- Primary action: `Save to thèque`.
- Settings: collapsed secondary area for reconnect and connection details.

The popup should avoid becoming a mini dashboard. Collections, tags, and full item editing stay in the web app.

## Error handling and states

- Disconnected: show a clear connection state, make connect/open-to-connect available, and prevent save with the existing connection error.
- Connected: show connected email when available.
- Saving: disable the save button and show a saving state.
- Success: confirm the item was saved to thèque.
- Duplicate: keep the current "already in your library" outcome.
- Restricted URL: keep the current restricted URL error.
- Token expired/revoked: keep the reconnect prompt.
- Network/API failure: keep a concise error message.

## Technical implications

- The extension popup markup and styles need to be redesigned, but the MV3 background connection flow remains the same.
- The capture API currently accepts `url`, `note`, `tag_names`, `collection_ids`, and `source`. Implementation will need an explicit request field for category hints.
- The API should validate category hints against the existing `ItemCategory` values.
- The backend should treat the hint as classification input, not as a final manual edit. If the item already exists, the first implementation can return the existing item unchanged unless the implementation plan explicitly chooses an update behavior.
- Tests should cover category-hint validation and preservation of existing capture behavior.

## Out of scope

- Removing token-based capture auth.
- Adding collections or tags to the extension popup.
- Replacing enrichment/classification with manual category assignment.
- Building a full item detail editor inside the extension.
- Changing the web app's main navigation or shelf definitions beyond any mapping needed for the hint.

## Approval checkpoint

This spec captures the approved brainstorm direction: use the Capture Card layout, preserve current functionality, use `thèque` everywhere, add category as a hint with shelf-style labels, and make `Open thèque` contextual.
