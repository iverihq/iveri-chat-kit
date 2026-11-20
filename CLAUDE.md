# @iveri/chat-kit — repo rules

Read `/Users/roma/Desktop/CODING/IVERI/CLAUDE.md` and `iveri-infra/docs/messenger-plan.md` first. The README says how
an app mounts the kit; this file records the decisions behind it.

## The headless half is the product

Every rule lives in the root entry point and is tested once: the optimistic send, the message window, read state,
grouping, the realtime connection, permissions, the heading rule. The web and native components only draw. A rule
written into a component is a rule the other platform does not have.

## Decisions worth not re-litigating

| Decision                                                                                                                    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messages are one ordered window per conversation, not TanStack infinite pages                                               | Older pages prepend and frames append; infinite pages refetch from the newest down on every invalidation. A refresh re-reads from a little before the newest held message and **replaces** that range, so an edit, a reaction or a delete-for-me (absent from the answer) all land                                                                                                                                                                                                                                                 |
| A pending message lives outside the query cache                                                                             | No refetch or garbage collection may lose a message somebody is waiting to retry. It is dropped when a confirmed message with its `clientMessageId` exists, whichever arrives first                                                                                                                                                                                                                                                                                                                                                |
| A retry presents the same `clientMessageId`                                                                                 | A send whose answer was lost already reached the server; the retry gets the first message back instead of a duplicate                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@iveri/contracts` is a peer, `socket.io-client` a dependency                                                               | Contracts nested under the kit would be a second, stale copy (react-kit's 0.31-vs-0.9 lesson). Every app with live updates needs the socket client anyway                                                                                                                                                                                                                                                                                                                                                                          |
| The web components do not depend on `@iveri/react-kit`                                                                      | A peer on it would tie every product's kit upgrade to this one. The focus ring and the avatar rule are copied character for character, and the tokens are the same names                                                                                                                                                                                                                                                                                                                                                           |
| Relative times are namespace plurals, not `Intl.RelativeTimeFormat`                                                         | A reduced-ICU browser has no Georgian relative-time data and answers in English inside a Georgian sentence. Seen in the gallery                                                                                                                                                                                                                                                                                                                                                                                                    |
| `chat.` prefix on every key                                                                                                 | The namespace is merged with each app's own; the pull refuses a duplicate key, so a shared prefix would eventually collide                                                                                                                                                                                                                                                                                                                                                                                                         |
| A socket ticket is fetched for every connection attempt, behind `realtimeTicket` (default off)                              | A ticket expires with the token it was exchanged for, so one kept from an earlier attempt may be stale. A ticket that does not arrive abandons the attempt and retries without a cap while held: sending an empty credential would earn a final `UNAUTHENTICATED` for what is only `chat-api` not answering                                                                                                                                                                                                                        |
| Nothing assumes Iveri identity: the token getter and the refresh are the app's, and `currentUserId` falls back to `GET /me` | A customer's app signs its own tokens and knows its users by its own ids; Baasi's id for them is derived, and the app should not have to compute it                                                                                                                                                                                                                                                                                                                                                                                |
| The kit carries its own words; `translate` is optional                                                                      | A customer's app signs in through Baasi and cannot reach Iveri's localization service, so without words in the package every label read as its key. `scripts/pull-catalogue.mjs` pulls the published `chat-kit` namespace into `src/i18n/default-catalogue.ts` before a release (CI cannot reach the service), dropping fallbacks as `pull-translations.mjs` does. Iveri's apps keep passing their own `t`, which is used untouched                                                                                                |
| **Assumed:** a customer words its own notices in the kit's `messages`, and `chat-api` stays key-only                        | A notice is a key and variables so every reader sees it in their own language; plain text on the server would be one language for everybody and a second shape to validate. `messages` already exists for overriding the kit's words, so it carries the app's keys too. Revisit if a customer has to post a notice no client of theirs will ever word                                                                                                                                                                              |
| Calls are their own entry points, `/web-call` and `/native-call`, with LiveKit's clients optional peers                     | Only an app that calls should install a WebRTC client. The root carries the rules and hooks, and a controller context (`useChatCallController`) the thread reads to draw its call buttons, so a thread outside a call layer draws none. Both layers draw what `useCallSession` decides. `verify-package.mjs` loads every other entry point with `livekit-client` unresolvable. The media hook takes the screen's element refs rather than returning refs, because the React Compiler reads anything returned beside a ref as a ref |
| The self-typing filter is in `useTypingPeople`, not the frame handler                                                       | Only the hook knows who "me" is now; storing everyone keeps the handler free of React state                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `useTyping` returns `start`, `stop`, `leave` and `resume`; a start goes with no body                                        | A stop goes out when the field empties, on send, on unmount or a conversation change, and 2 s after the window or app is left with text still in it (**Assumed** delay). Never two stops without a start between, and a stop resets the throttle so the next keystroke is announced at once. A start has no body because a `chat-api` older than stop frames refuses an unknown `isTyping`; a stop to such a server is a 400 nobody reads                                                                                          |
| The message toolbar sits beside the bubble, measured when it shows                                                          | Over the bubble's top edge it hid a one-word message and was cut off on the first one. Beside it (left of mine, right of theirs, bridged by padding so hover survives the gap), else above it, else below it. The picker and the menu are measured on opening (`popover-fit.ts`) and grow toward the bubble, and only one of them is open at a time                                                                                                                                                                                |

## Contract points to keep in step with chat-api

- `chat.system.*` keys and variables follow `chat-api`'s `src/feature/conversation/util/system-message-keys.ts`
  (`{actor}`, `{name}`, `{title}`, `{role}`). Change both together.
- `afterSeq` is assumed to answer the messages after that `seq`, **oldest first**, up to `limit`; the window keeps
  asking from the last one returned while pages come back full.
- The voice note `waveform` field is sent as a JSON array of up to 64 whole levels (`encodeWaveformField`).

## Tests

`pnpm test` runs two Vitest projects: `dom` (jsdom: client, hooks over a stubbed `fetch`, web components) and
`native` (the native components rendered through `react-native-web`, because React Native's own entry is Flow). The
bundled catalogue is checked in CI against every key the source writes, so a key added without pulling fails there.
The namespace check in `src/i18n/catalog.spec.ts` runs only where `iveri-infra` is checked out beside this repository or
`IVERI_INFRA_DIR` points at one; CI skips it, and each app's catalogue spec asserts the same against what it pulled.

`scripts/verify-package.mjs` loads every entry point in a separate Node process with the peers it must not need made
unresolvable. A check that cannot fail proves nothing: blocking `react-dom` does make `/web` fail, which was tried.

## Headings wrap; previews are cut (2026-11-20)

The thread header's name and status line, a dialog's title and the details panel's heading wrap between words (at most
two lines for the name, which carries the full text in `title`). They were cut with an ellipsis, so a Georgian surname
and "was active 19 min ago" in Georgian ended mid-word, and a Georgian word cut short reads as a different word. A row's
message preview, a file's name over its picture and a person's name in a picker list stay on one line: a preview is a
fragment by nature, and those rows are scanned rather than read.

## A thread never scrolls sideways (2026-11-20)

The message list is `overflow-x-hidden`. A message's toolbar is laid out beside its bubble even while it is invisible,
so beside a wide bubble (a long Georgian line on a phone) it reached past the thread and the thread scrolled sideways,
with a scrollbar under the last message, for as long as that message was on screen. `placeToolbar` already moves the
toolbar above the bubble when there is no room beside it, so clipping the thread loses nothing.

**0.8.2 was not enough inside an Iveri app.** `@iveri/react-kit`'s theme sets `main section > div { overflow-x: auto }` so
a wide table scrolls inside its panel, and each day's group of messages is exactly that shape. The day group therefore
scrolled sideways inside a thread that no longer did. It carries `overflow-x-visible` (0.8.3), which beats the theme's
base layer, so the overflow reaches the thread and is clipped there. The gallery could not show it: it has no `main`.

## Group calls (2026-11-20)

`iveri-infra/docs/baasi-calls-plan.md` phase 2; the rules are chat-api's (its `CLAUDE.md`, "Group calls"), and the kit only
draws them.

- **One layer, two screens.** `ChatCallLayer` and `ChatNativeCallLayer` read the active call and draw the screen its
  `isGroup` needs; the 1:1 screens are unchanged. Each group screen has its own media hook (`useGroupCallMedia`,
  `useNativeGroupCallMedia`), because a room of many plays one `<audio>` per person on the web and hands back a camera
  track per person; the 1:1 hooks would have grown a branch in every handler.
- **A group call is live for me once I am connected**, not once somebody else is, so a caller alone sees "Waiting for
  others to join" rather than "Connecting". `callPhase` reads my own ringing state before the call's status, because a
  group call somebody else answered is under way and still rings for me; `useCallSession` shows such a ring too.
- **Tiles: video first, then whoever spoke last, ties in the room's order** (`orderCallTiles`), at most
  `CHAT_CALL_VIDEO_TILES` = 8 (Roma's number; the room takes up to 32), the rest as "+N more". Ordering by "speaking now"
  alone made tiles jump on every breath; last-spoke keeps a speaker on screen and still order.
- **Leaving closes the screen at once** rather than waiting for the call to end, because a group call goes on without me;
  the media hook is given no join after that, which leaves the room.
- **The banner over a group's thread** (`CallBanner`, web and native) reads `useCurrentCall`, which chat-api answers to any
  member of a group, and joins through the controller's `joinCall`. It is drawn only inside a call layer, like the call
  buttons, and never for the call already on screen.
- **`useIncomingCalls` is off while `currentUserId` is null.** hr-app and chat-app mount the call layer while signed out
  (so signing in does not remount the navigator), and the poll otherwise drew a 401 every four seconds.
- **Not proven in a real room on a phone**: the native grid is checked in `react-native-web` only, and no group call's
  audio or video has been heard (the browser pane blocks the microphone and camera).
