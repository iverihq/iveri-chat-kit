# @iveri/chat-kit

Baasi conversations for every Iveri product, and for a customer's own app: a headless client with React hooks, and
ready components for React on the web and React Native. Baasi's own site and app are built from it, a product drops
it into its own screens (Taxi's ride, Ezo's Messages), and a company with its own users and sign-in mounts it the same
way (see [In a customer's app](#in-a-customers-app)).

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
        currentUserId={session.userId} // optional: left out, it is read from GET /me
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

The components draw with `chat-*` tokens (`bg-chat-surface`, `text-chat-ink`, `bg-chat-accent`, …), each of which
reads a theme's property first and the fleet's semantic token second, so with no theme they wear the app's palette:
Ezo's courtyard colours apply with no Ezo code here.

`ChatInbox` and `ChatThread` are separate so a desktop page can show both side by side and a phone one at a time
(`onBack` puts a back button in the thread's header).

## In a customer's app

A company that sells its own product and has its own users mounts the kit exactly as above. Nothing in the kit assumes
Iveri's identity service: **the token and its refresh are the app's**, and the kit never reads inside the token.

```tsx
const chatClient = createChatClient({
    baseUrl: 'https://chat.example/api/v1',
    // The token the customer's server signed with its app secret (or minted at POST /server/tokens).
    getAccessToken: () => chatTokenStore.current(),
    // On a 401 the kit asks once for a fresh one, then retries. Fetch it from the customer's own server,
    // single-flight; return false when the user is signed out.
    onUnauthorized: () => chatTokenStore.refreshFromOwnServer(),
});

<ChatProvider client={chatClient} realtimeUrl="https://chat-realtime.example" realtimeTicket locale={locale}>
    …
</ChatProvider>;
```

- **No `translate` is needed.** The kit carries its own words in English, Russian and Georgian and formats them in
  `locale`; see [Strings](#strings) for changing a wording, adding a language, or wording the app's own notices.

- **`realtimeTicket`** (default off) makes the socket present a **ticket** instead of the token. Before every
  connection attempt, the first and each reconnect, the kit calls `chat-api`'s `POST /realtime/ticket` with the current
  token and presents the `ticket` it answers. A customer's app needs it: its users' tokens are signed with an app
  secret only `chat-api` holds, so `chat-realtime` cannot verify them itself. **A ticket that does not arrive is the
  socket being down**: the attempt is abandoned, the poll carries on, and the kit tries again on capped delays for as
  long as a screen holds the connection. Iveri's own products present identity tokens and leave it off.
- **`currentUserId` may be left out.** A customer's user is known to Baasi by an id derived from the app's own user id,
  so the kit reads it from `GET /me` (`userId`) rather than asking the app to compute it. Until that answers, nothing is
  drawn as the reader's own.
- `client.createRealtimeTicket()` is the same exchange, for an app that opens its own socket.

## Theming

A customer's chat should look like the customer's product, not like Iveri's. `ChatProvider` takes a `theme`, one
object for the web and the phone alike, and **only the keys it names change anything**:

```tsx
import { ChatProvider, type ChatTheme } from '@iveri/chat-kit';

const brand: Partial<ChatTheme> = {
    colorAccent: '#c2410c', // buttons, links, the read mark, the selected row, the focus ring
    colorAccentText: '#ffffff', // text on the accent
    colorSurface: '#fffaf5', // panels and the composer; the canvas, hovers and hairlines are mixed from it
    colorText: '#1c1917',
    colorMuted: '#78716c', // times, hints, previews
    colorBubbleOwn: '#ffedd5', // the reader's own messages (defaults to a wash of the accent)
    colorBubbleOther: '#ffffff', // everybody else's (defaults to the surface)
    radius: 18, // a bubble's and a card's corners, in pixels; controls and sheets follow
    fontFamily: "'Source Sans 3', sans-serif",
};

<ChatProvider client={chatClient} locale={locale} theme={brand}>
    …
</ChatProvider>;
```

| Key            | Web                                                                                                              | React Native                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| How it arrives | `--baasi-*` custom properties on a `display: contents` element around `ChatInbox`, `ChatThread` and every dialog | The native palette through context, laid over `ChatNativeProvider`'s |
| A key left out | The app's own Tailwind token, untouched                                                                          | The fleet's palette (or `ChatNativeProvider`'s)                      |
| Derived shades | `color-mix()` in the browser                                                                                     | Mixed as hex; a colour that is not hex stands in for its own shades  |
| `fontFamily`   | A font stack, on everything the kit draws                                                                        | One loaded face, used only where `resolveFontFamily` picks none      |

- **Give colours both platforms accept**: hex or `rgb()`. A `var(--x)` or `oklch()` is fine on the web and an invalid
  colour on a phone.
- **`defaultChatTheme` is today's look**: the fleet's palette, with the fleet's own shades rather than mixed ones, and
  an empty `fontFamily` meaning the app's own. Passing no theme and passing `defaultChatTheme` draw the same in an app
  on the fleet's palette, which is why Iveri's own products pass nothing.
- **A kit component mounted on its own** (a `ChatComposer` outside a `ChatThread`, say) sits in no theme element; wrap
  it in `<ChatThemeScope>` from `@iveri/chat-kit/web`. `chatThemeVariables(theme)` returns the same properties for an
  element of the app's own.
- Status colours (an error, a warning) and the scrim behind a dialog are not themable: they mean the same thing in
  every product.

## Strings

Every string is a key in the **`chat-kit` namespace** (`iveri-infra/scripts/i18n/chat-kit.mjs`), all starting with
`chat.`, and **the package carries the published namespace** in English, Russian and Georgian
(`CHAT_KIT_DEFAULT_CATALOGUE`). How an app reaches the words depends on whether it has a catalogue of its own:

| The app                                                  | It passes                | The words                                                              |
| -------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| A customer's, signed in through Baasi with an app secret | nothing, or `messages`   | The kit's own, in `locale`, with the app's `messages` read first       |
| Iveri's own (chat-web, chat-app, HR, Taxi, Ezo)          | `translate`, its own `t` | Its pulled catalogue, which holds `chat-kit` beside its own namespaces |

A given `translate` is used for every word and `messages` is then not read. Without one, a key is looked up in
`messages` and then in the kit's words, first in `locale` (`ka-GE`), then its language (`ka`), then English, and is
**formatted with the plural rules of the locale that supplied it**: English shown to a Georgian reader is still English.

```tsx
<ChatProvider
    client={chatClient}
    locale="ka"
    messages={{
        // Another wording for one of the kit's keys, in one language; the others keep the kit's.
        en: { 'chat.composer.placeholder': 'Message the shop' },
        // A language the kit does not carry: every key it lacks falls back to English.
        de: { 'chat.composer.send': 'Senden' },
    }}
>
```

### The app's own notices

`POST /server/conversations/:id/notices` takes a **key and variables, never text**, so each reader sees a notice in
their own language. A key the kit does not have (anything outside `chat.*`) is the app's to word, in `messages`, as an
ICU pattern over the variables it posts:

```ts
// The app's server
await baasi.post(`/server/conversations/${conversationId}/notices`, {
    key: 'acme.order.shipped',
    variables: { order: 'A-17' },
    idempotencyKey,
});
```

```tsx
// The app
<ChatProvider
    client={chatClient}
    locale={locale}
    messages={{
        en: { 'acme.order.shipped': 'Order {order} is on its way' },
        ka: { 'acme.order.shipped': 'შეკვეთა {order} გზაშია' },
    }}
>
```

Give the app's keys **its own prefix** (`acme.`), never `chat.`, which belongs to the kit and may gain a key of the same
name. A key nobody worded, in any language, is drawn as the neutral "Something changed in this conversation" (`chat.system.unknown`)
rather than as the key; so is a notice whose variables did not arrive.

### In Iveri's own apps

An app adds `chat-kit` to its own row in `APP_NAMESPACES`, pulls it with its others and passes its `t`. Its
`catalog.spec.ts` should assert the pulled catalogue holds every key in `CHAT_KIT_MESSAGE_KEYS` (the kit renders from
`node_modules`, where the app's own source scan never reaches) and that no value contains a stem in
`CHAT_KIT_FORBIDDEN_WORDS`: Baasi's messages are not end-to-end encrypted, so nothing may call them encrypted, secure
or private. The kit's own spec asserts the same of the words it carries.

## Embedding in a product

The product's **server** opens the conversation through `chat-api`'s embedding API; the client only finds it:

```tsx
const { data: conversation } = useConversationByContext({ product: 'taxi', type: 'ride', id: rideId });
return conversation ? <ChatThread conversationId={conversation.id} showHeader /> : null;
```

A 404 means "not a participant, or not open yet", which a page shows as no chat.

An embedding can narrow the thread to what its product allows and name its back control for where it leads:

```tsx
<ChatThread
    conversationId={conversation.id}
    onBack={() => navigate(`/rides/${rideId}`)}
    backLabel={t('ride.chat.back')}
    attachmentKinds={[ChatAttachmentKind.PHOTO]}
    allowVoice={false}
/>
```

On a phone the same limits come from the capabilities the app passes to `ChatNativeProvider`.

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
presenting the current token on every connection attempt (or, with `realtimeTicket`, a ticket fetched for that
attempt). A frame invalidates exactly what it names; the thread then
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

**Before a release, pull the published namespace into the package** with the local stack running, and commit the
result if it changed. CI cannot reach the localization service, so this is the one step that cannot run there:

```sh
IDENTITY_API_URL=http://localhost:<identity port> node scripts/pull-catalogue.mjs
```

Released by tag: `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`, one tag at a time, never `--follow-tags`.
