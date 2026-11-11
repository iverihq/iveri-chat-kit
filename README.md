# @iveri/chat-kit

Baasi conversations for every Iveri product: a headless client with React hooks, and ready components for React
on the web and React Native. Baasi's own site and app are built from it, and a product drops it into its own
screens (Taxi's ride, Ezo's Messages).

```text
@iveri/chat-kit          the HTTP client, ChatProvider, TanStack Query hooks, the realtime connection, pure helpers
@iveri/chat-kit/web      ChatInbox, ChatThread, ChatComposer, GroupInfo, PersonPicker, ReportDialog, … (Tailwind 4)
@iveri/chat-kit/native   ChatInboxScreen, ChatThreadScreen, ChatComposer, MessageBubble (React Native core only)
@iveri/chat-kit/web.css  makes the app's Tailwind scan the web components
```

ESM only. Peers: `react` 19, `@tanstack/react-query` 5, `@iveri/contracts` ≥ 0.70 (one copy, the app's), and the
optional `react-dom` (for `/web`) and `react-native` (for `/native`). The root never imports either, which the build
proves by loading each entry point in Node with the other made unresolvable. `socket.io-client` is a plain dependency:
every app with live updates needs it, and a missing peer would only fail when a socket opened.

## Mounting it

```tsx
import { ChatProvider, createChatClient } from '@iveri/chat-kit';

const chatClient = createChatClient({
    baseUrl: import.meta.env.VITE_CHAT_API_URL, // chat-api including /api/v1
    getAccessToken: () => tokenStore.access(),
    onUnauthorized: refreshSession, // the app's single-flight refresh; return false when the session is gone
});

<QueryClientProvider client={queryClient}>
    <ChatProvider
        client={chatClient}
        realtimeUrl={import.meta.env.VITE_CHAT_REALTIME_URL} // optional: without it the kit polls
        locale={locale}
        translate={t} // the app's own t, which has pulled the chat-kit namespace
        currentUserId={session.userId}
    >
        …
    </ChatProvider>
</QueryClientProvider>;
```

On the web, import the stylesheet after the app's theme:

```css
@import 'tailwindcss';
@import '@iveri/react-kit/theme.css';
@import '@iveri/chat-kit/web.css';
```

The components use only the fleet's semantic tokens (`bg-surface`, `text-ink`, `bg-accent`, …), so they wear the
app's palette: Ezo's courtyard colours apply with no Ezo code here.

`ChatInbox` and `ChatThread` are separate so a desktop page can show both side by side and a phone one at a time
(`onBack` puts a back button in the thread's header).

## Strings

Every string is a key in the **`chat-kit` namespace** (`iveri-infra/scripts/i18n/chat-kit.mjs`), all starting with
`chat.`. An app adds `chat-kit` to its own row in `APP_NAMESPACES` and pulls it with its others. Its `catalog.spec.ts`
should assert the pulled catalogue holds every key in `CHAT_KIT_MESSAGE_KEYS` (the kit renders from `node_modules`,
where the app's own source scan never reaches) and that no value contains a stem in `CHAT_KIT_FORBIDDEN_WORDS`:
Baasi's messages are not end-to-end encrypted, so nothing may call them encrypted, secure or private.

## Embedding in a product

The product's **server** opens the conversation through `chat-api`'s embedding API; the client only finds it:

```tsx
const { data: conversation } = useConversationByContext({ product: 'taxi', type: 'ride', id: rideId });
return conversation ? <ChatThread conversationId={conversation.id} showHeader /> : null;
```

A 404 means "not a participant, or not open yet", which a page shows as no chat.

**Labels and titles a product sends:** a participant's `label` and a context conversation's `title`/`subtitle` that
start with `chat.` are keys in the `chat-kit` namespace and are translated for the reader (`chat.label.driver`,
`chat.title.taxi-ride`, `chat.title.social-direct`); anything else is the product's own text and is shown exactly as
written. `productText()` is that rule.

**Headings:** a context conversation between two people leads with the other person's name, their label beside it,
and the translated product title beneath ("Giorgi B. · Driver", then "Taxi ride"). An inbox summary has no
participants, so there `chat-api` fills `other` with the other person and the same rule applies; without `other` the
translated title leads. `conversationHeading()` is that rule, used by both component sets.

## Realtime and the poll

`useChatRealtime()` (called by `ChatInbox` and `ChatThread`) holds one socket per provider to `<realtimeUrl>/chat`,
presenting the current token on every connection attempt. A frame invalidates exactly what it names; the thread then
fetches what is after the newest `seq` it holds and re-reads its tail (edits and reactions do not move the `seq`). When
the gateway closes the socket with `TOKEN_EXPIRED` the session is refreshed through `onUnauthorized` and the socket
reconnects; `UNAUTHENTICATED` and `FORBIDDEN` stop it. The poll stays: an open conversation every 5 s and the inbox
every 15 s without a socket, every 30 s with one.

## On a phone

The native components take device capabilities from the app through `ChatNativeProvider`: `pickImage`, `pickFile`,
`recordVoice`, `playAudio`, `openUrl`, `copyText`. The kit depends on no Expo module; a capability left out removes its
control. On the **web build** of the native components a browser cannot upload React Native's `{ uri, name, type }`, so
`pickImage`, `pickFile` and `recordVoice` should also return the `File` as `file` (Expo's pickers give it as
`asset.file`); without it the kit reads the `blob:` or `data:` address itself. There a tap on a message opens its actions,
where a phone uses a long press. `resolveFontFamily` carries the app's `AppText` rule, because React Native has no per-glyph fallback and
Georgian needs Noto.

## Developing

```sh
pnpm build        # tsc, then scripts/verify-package.mjs
pnpm test         # Vitest: jsdom for the client, hooks and web components; react-native-web for the native ones
pnpm preview      # the gallery on :5191, reading the strings from ../iveri-infra (or IVERI_INFRA_DIR)
```

Released by tag: `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`, one tag at a time, never `--follow-tags`.
