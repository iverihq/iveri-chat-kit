# @iveri/chat-kit — repo rules

Read `/Users/roma/Desktop/CODING/IVERI/CLAUDE.md` and `iveri-infra/docs/messenger-plan.md` first. The README says how
an app mounts the kit; this file records the decisions behind it.

## The headless half is the product

Every rule lives in the root entry point and is tested once: the optimistic send, the message window, read state,
grouping, the realtime connection, permissions, the heading rule. The web and native components only draw. A rule
written into a component is a rule the other platform does not have.

## Decisions worth not re-litigating

| Decision                                                                      | Why                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messages are one ordered window per conversation, not TanStack infinite pages | Older pages prepend and frames append; infinite pages refetch from the newest down on every invalidation. A refresh re-reads from a little before the newest held message and **replaces** that range, so an edit, a reaction or a delete-for-me (absent from the answer) all land |
| A pending message lives outside the query cache                               | No refetch or garbage collection may lose a message somebody is waiting to retry. It is dropped when a confirmed message with its `clientMessageId` exists, whichever arrives first                                                                                                |
| A retry presents the same `clientMessageId`                                   | A send whose answer was lost already reached the server; the retry gets the first message back instead of a duplicate                                                                                                                                                              |
| `@iveri/contracts` is a peer, `socket.io-client` a dependency                 | Contracts nested under the kit would be a second, stale copy (react-kit's 0.31-vs-0.9 lesson). Every app with live updates needs the socket client anyway                                                                                                                          |
| The web components do not depend on `@iveri/react-kit`                        | A peer on it would tie every product's kit upgrade to this one. The focus ring and the avatar rule are copied character for character, and the tokens are the same names                                                                                                           |
| Relative times are namespace plurals, not `Intl.RelativeTimeFormat`           | A reduced-ICU browser has no Georgian relative-time data and answers in English inside a Georgian sentence. Seen in the gallery                                                                                                                                                    |
| `chat.` prefix on every key                                                   | The namespace is merged with each app's own; the pull refuses a duplicate key, so a shared prefix would eventually collide                                                                                                                                                         |
| The self-typing filter is in `useTypingPeople`, not the frame handler         | Only the hook knows who "me" is now; storing everyone keeps the handler free of React state                                                                                                                                                                                        |

## Contract points to keep in step with chat-api

- `chat.system.*` keys and variables follow `chat-api`'s `src/feature/conversation/util/system-message-keys.ts`
  (`{actor}`, `{name}`, `{title}`, `{role}`). Change both together.
- `afterSeq` is assumed to answer the messages after that `seq`, **oldest first**, up to `limit`; the window keeps
  asking from the last one returned while pages come back full.
- The voice note `waveform` field is sent as a JSON array of up to 64 whole levels (`encodeWaveformField`).

## Tests

`pnpm test` runs two Vitest projects: `dom` (jsdom: client, hooks over a stubbed `fetch`, web components) and
`native` (the native components rendered through `react-native-web`, because React Native's own entry is Flow). The
namespace check in `src/i18n/catalog.spec.ts` runs only where `iveri-infra` is checked out beside this repository or
`IVERI_INFRA_DIR` points at one; CI skips it, and each app's catalogue spec asserts the same against what it pulled.

`scripts/verify-package.mjs` loads every entry point in a separate Node process with the peers it must not need made
unresolvable. A check that cannot fail proves nothing: blocking `react-dom` does make `/web` fail, which was tried.
