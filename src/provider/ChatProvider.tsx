import type { Maybe, UUID } from '@iveri/contracts';
import type { ChatProfile } from '@iveri/contracts/chat';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import type { ChatApiError, ChatClient } from '../client/index.js';
import type { ChatTranslate } from '../i18n/index.js';
import { chatQueryKeys } from '../query/query-keys.js';
import {
    applyRealtimeFrame,
    ChatRealtimeConnection,
    ChatTypingStore,
    recoverAfterConnect,
    type ChatSocketFactory,
} from '../realtime/index.js';

import { ChatContext, type ChatContextValue } from './chat-context.js';
import { ChatPendingStore } from './pending-store.js';

export interface ChatProviderProps {
    client: ChatClient;
    /**
     * `chat-realtime`'s origin, e.g. `http://localhost:3061`. **Optional**: without it the kit polls
     * (an open conversation every 5 s, the inbox every 15 s), and every screen still works.
     */
    realtimeUrl?: Maybe<string>;
    /**
     * Fetch a socket ticket from `chat-api` before every socket connection, and present it instead of the
     * token. **Off by default.** A customer's app turns it on, because its users' tokens are signed with
     * an app secret `chat-realtime` does not hold; Iveri's products present identity tokens and leave it off.
     */
    realtimeTicket?: boolean;
    locale: string;
    timeZone?: string;
    /** The app's own `t`, bound to its locale, which has pulled the `chat-kit` namespace. */
    translate: ChatTranslate;
    /**
     * The signed-in person's id as `chat-api` knows it: what `GET /me` answers as `userId`. Iveri's products
     * pass their identity user id, which is the same thing. **Optional**: left out, the kit reads it from
     * `GET /me`, which is what a customer's app does, since its user's id in Baasi is derived from the
     * app's own user id and the app need not compute it.
     */
    currentUserId?: Maybe<UUID>;
    /** For specs and the gallery: stands in for `socket.io-client`. */
    socketFactory?: ChatSocketFactory;
    children?: ReactNode;
}

/**
 * Everything the kit's hooks and components need, given once at the top of the chat screens.
 *
 * Must sit **inside** the app's `QueryClientProvider`: the kit's state is TanStack Query cache under
 * `chatQueryKeys.all`, in the app's own client, so a sign-out that clears the app's cache clears the
 * conversations too.
 */
export function ChatProvider({
    client,
    realtimeUrl,
    realtimeTicket = false,
    locale,
    timeZone,
    translate,
    currentUserId: givenUserId,
    socketFactory,
    children,
}: Readonly<ChatProviderProps>): React.JSX.Element {
    const queryClient = useQueryClient();
    const [typing] = useState(() => new ChatTypingStore());
    const [pending] = useState(() => new ChatPendingStore());
    const [readMarks] = useState(() => new Map<UUID, number>());
    // Same key as `useChatProfile`, so the inbox and the profile screen share the one request.
    const { data: profile } = useQuery<ChatProfile, ChatApiError>({
        queryKey: chatQueryKeys.profile(),
        queryFn: ({ signal }) => client.getProfile({ signal }),
        staleTime: 60_000,
        enabled: givenUserId === undefined,
    });
    const currentUserId = givenUserId === undefined ? (profile?.userId ?? null) : givenUserId;
    // Constructing a connection opens nothing; the socket opens when a screen first holds it.
    const realtime = useMemo(
        () =>
            typeof realtimeUrl === 'string' && realtimeUrl.length > 0
                ? new ChatRealtimeConnection({
                      url: realtimeUrl,
                      client,
                      useTicket: realtimeTicket,
                      socketFactory,
                      onFrame: (frame): void => {
                          void applyRealtimeFrame(frame, { queryClient, typing });
                      },
                      onReady: (): void => {
                          void recoverAfterConnect(queryClient);
                      },
                  })
                : null,
        [realtimeUrl, realtimeTicket, client, socketFactory, queryClient, typing],
    );

    useEffect(
        () => (): void => {
            realtime?.close();
        },
        [realtime],
    );

    useEffect(
        () => (): void => {
            typing.clear();
        },
        [typing],
    );

    const value = useMemo<ChatContextValue>(
        () => ({ client, locale, timeZone, translate, currentUserId, realtime, typing, pending, readMarks }),
        [client, locale, timeZone, translate, currentUserId, realtime, typing, pending, readMarks],
    );

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
