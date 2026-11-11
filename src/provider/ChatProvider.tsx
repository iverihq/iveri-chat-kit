import type { Maybe, UUID } from '@iveri/contracts';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import type { ChatClient } from '../client/index.js';
import type { ChatTranslate } from '../i18n/index.js';
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
    locale: string;
    timeZone?: string;
    /** The app's own `t`, bound to its locale, which has pulled the `chat-kit` namespace. */
    translate: ChatTranslate;
    /** The signed-in person's identity user id. */
    currentUserId: Maybe<UUID>;
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
    locale,
    timeZone,
    translate,
    currentUserId,
    socketFactory,
    children,
}: Readonly<ChatProviderProps>): React.JSX.Element {
    const queryClient = useQueryClient();
    const [typing] = useState(() => new ChatTypingStore());
    const [pending] = useState(() => new ChatPendingStore());
    const [readMarks] = useState(() => new Map<UUID, number>());
    // Constructing a connection opens nothing; the socket opens when a screen first holds it.
    const realtime = useMemo(
        () =>
            typeof realtimeUrl === 'string' && realtimeUrl.length > 0
                ? new ChatRealtimeConnection({
                      url: realtimeUrl,
                      client,
                      socketFactory,
                      onFrame: (frame): void => {
                          void applyRealtimeFrame(frame, { queryClient, typing });
                      },
                      onReady: (): void => {
                          void recoverAfterConnect(queryClient);
                      },
                  })
                : null,
        [realtimeUrl, client, socketFactory, queryClient, typing],
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
