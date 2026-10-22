# Tarot Plugin — Card Selection Plan

Date: 22 October 2026
Status: MVP implementation in progress
Repository: https://github.com/babyplug/tarot
Goal: A public ChatGPT tarot plugin where people choose illustrated cards themselves, then discuss the completed spread with ChatGPT.

## 1. Product scope

Build an original tarot experience with a standard 78-card deck: 22 Major Arcana and 56 Minor Arcana. Use original or appropriately licensed artwork and descriptions.

Support four spreads:

| Spread | Positions | Main use |
| --- | --- | --- |
| One card | Focus | Daily reflection or a focused question |
| Two cards | Situation; Advice | A quick situation and next step |
| Three cards | Situation; Challenge; Advice | Default general reading |
| Horseshoe, seven cards | Past influence; Present situation; Hidden influence; Challenge; External influence; Advice; Likely direction | A more detailed reading |

Position labels are interpretive conventions, not fixed universal meanings. Offer Past / Present / Future as an additional three-card preset later.

Defaults: three-card spread, reversals off, interface follows the user's language. Prepare English and Thai labels for launch. The question is optional and can remain in the ChatGPT conversation; the card service does not need it to shuffle or select cards.

The plugin supplies the selection experience, card facts, and reading instructions. ChatGPT provides the interpretation in the conversation. No model API call is required in the plugin backend for this design.

## 2. Selection flow

| Step | What the user sees | Required behavior |
| --- | --- | --- |
| Configure | Spread options, position previews, reversals toggle | Explain how many cards will be selected |
| Shuffle | A short shuffle animation and Start selecting button | Server creates one shuffled deck; animation does not determine randomness |
| Pick | Face-down cards, selected-card tray, and progress such as 2 / 7 | Each selection fills the next spread position |
| Reveal | The chosen card flips and shows its name and orientation | Lock that selection; no replacement or accidental second draw |
| Complete | All cards arranged by position and a Read my cards button | Enable interpretation only after every position is filled |
| Discuss | ChatGPT's interpretation alongside the completed spread | Follow-up questions reuse the exact same cards |

Use a responsive grid rather than a dense fan of overlapping cards. Show 12 face-down slots per page on desktop and 6 on mobile, with access to all 78 slots. Pagination must not reshuffle the deck.

Show the target position before each pick: for example, Choose card 3: Hidden influence. After the card is revealed, it cannot be swapped. Allow starting a new reading explicitly; do not offer a hidden reroll.

Offer Draw remaining automatically as an optional alternative. It draws only the number still needed from the same remaining deck.

Before any card has been revealed, the user may reshuffle or change spread settings. After the first reveal, changing settings starts a new reading.

## 3. Randomness and consistency

- Shuffle card IDs on the server using cryptographically secure randomness and an unbiased Fisher–Yates shuffle.
- Assign orientation once per card when creating the reading; use a documented 50% reversed probability when reversals are enabled.
- Keep the slot-to-card mapping fixed for that reading.
- Send only opaque slot references to the picker; do not send all hidden card identities in the browser payload.
- On selection, atomically record the card and next spread position before returning the result.
- Include an idempotency key so a retried request returns the same selection.
- Reject or reconcile stale updates using a reading revision. Two rapid clicks must not fill the same position or consume two cards unintentionally.
- A completed reading is immutable. Starting another reading creates a new identifier.

Randomness implements an unbiased draw; it does not imply predictive accuracy.

## 4. UI states and accessibility

Implement setup, shuffling, selecting, submitting selection, complete, expired, and recoverable error states.

Keep selected cards visible as the user changes pages. Mark selected slots unavailable. Show seven-card spreads in a responsive arrangement with explicit numbered position labels; do not rely on spatial layout alone.

Provide keyboard activation, visible focus indicators, readable card names, orientation text, adequate tap targets, and reduced-motion support. Indicate reversed cards using both rotation and text.

A failed selection request retries with the same idempotency key. A refresh restores the authoritative snapshot while the session remains valid. If a session expires, explain the expiry and offer a new reading.

If images fail, retain card names and position labels. If the host cannot render the widget, provide a text-based automatic draw that uses the same server selection rules.

## 5. MCP tools and ChatGPT handoff

Proposed contracts, to finalize against the SDK during implementation:

| Tool | Purpose | Result |
| --- | --- | --- |
| start_tarot_reading | Open the configuration and picker UI | Supported spreads and initial UI |
| configure_reading | Create or reset an undrawn session | Reading ID, revision, settings, opaque slots |
| select_card | Choose one slot for the next position | Updated snapshot with the selected card |
| draw_remaining_cards | Complete the spread automatically | Updated snapshot from the same deck |
| get_reading | Recover an active reading | Authoritative current snapshot |
| complete_reading | Validate completion and return interpretation context | Ordered cards, position labels, orientations, and reference meanings |

Selection tools should be callable from the UI without inviting ChatGPT to choose slots on behalf of someone who selected manual mode. Confirm tool visibility and bridge support against the current SDK.

Read my cards completes the reading, exposes the final structured result to the conversation, and requests interpretation through the supported MCP Apps bridge. Test that this actually triggers a model response; updating local UI state alone is insufficient.

Only return revealed cards in model-visible results. The final payload includes stable card IDs, display names, zero-based positions, orientation, spread labels, keywords, and reference meanings.

The reading instructions ask ChatGPT to interpret every position in the user's language, connect the cards to the question already in the chat, and preserve the original spread for follow-up discussion.

## 6. State, privacy, and deployment

Keep authoritative selection state in a short-lived shared TTL store so separate server instances and restarts do not lose active readings. An in-memory adapter is sufficient for local development only.

Proposed retention: expire after two hours of inactivity, with a 24-hour maximum lifetime. After expiry, already-returned cards remain usable as context in the user's conversation; the server does not promise recovery.

No user accounts or long-term reading history in the MVP. Do not store the user's question or raw chat transcript. Scope reading access using an unguessable session capability and test isolation between sessions. Treat widget metadata as presentation transport, not an authorization boundary.

Serve optimized, versioned card images and use a stable production HTTPS MCP endpoint for public release. Rate-limit session creation and draw requests. Log operational errors without recording questions or full readings.

## 7. Implementation approach

Proposed default stack: TypeScript MCP service, React card widget, static JSON card catalog, and a shared TTL storage adapter. Keep the domain logic independent of the UI and MCP transport.

Suggested repository areas:

- server/: MCP tools, validation, session access, and transport
- web/: configuration, face-down picker, reveal animation, completed spread
- domain/: shuffle, selection transitions, card/spread types
- data/: 78-card catalog, reference meanings, and localized labels
- assets/: licensed artwork and license records
- tests/: domain tests and browser interaction scenarios
- docs/: setup, deployment, privacy/terms drafts, and submission materials

Use a feature branch and a pull request for each implementation milestone. Select the repository and inspect its existing conventions before scaffolding or choosing package versions.

## 8. Delivery milestones

| Milestone | Deliverable | Acceptance |
| --- | --- | --- |
| 1. Selection core | Catalog, spread definitions, shuffle, session transitions | Unique cards; fixed deck; correct orientations; safe retries |
| 2. Interactive widget | Setup, pagination, picking, reveals, completed spread | All four spreads work by mouse, touch, and keyboard |
| 3. ChatGPT integration | MCP UI and final interpretation handoff | Manual draw leads to a coherent reading using exactly the selected cards |
| 4. Public-release preparation | Production deployment, listing assets, review package | Stable endpoint; identity/domain verification; required pages and review materials |

Critical checks include repeated clicks, concurrent updates, retry after timeout, page changes, refresh/resume, expiry, invalid slot references, no duplicate cards, and isolation between two readings.

Use a seeded random source in domain tests to verify exact state transitions. Use the cryptographically secure implementation in production. Avoid flaky statistical tests as the primary correctness check.

## 9. Deferred work

Saved reading history, user accounts, custom spread builders, alternate decks, reading exports, payments, and standalone AI chat.

## 10. GitHub delivery workflow

Repository: https://github.com/babyplug/tarot
Branch: feat/card-selection-mvp

Deliver the initial plan and implementation in one pull request. Later changes also use feature branches and pull requests. Read AGENTS.md first when resuming work.

## Official documentation checked

- MCP Apps UI and state ownership: https://developers.openai.com/plugins/build/chatgpt-ui
- Public plugin submission: https://developers.openai.com/plugins/deploy/submission
- Plugin guidelines: https://developers.openai.com/plugins/plugin-guidelines

Platform requirements and package versions should be checked again during implementation and before public submission.

