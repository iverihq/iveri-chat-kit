import type { Maybe, UUID } from '@iveri/contracts';
import { createContext, useContext } from 'react';

import type { ChatClient } from '../client/index.js';
import type { ChatTranslate } from '../i18n/index.js';
import type { ChatRealtimeConnection, ChatTypingStore } from '../realtime/index.js';

import type { ChatPendingStore } from './pending-store.js';

export interface ChatContextValue {
    client: ChatClient;
    /** The locale every date, number and plural is formatted in. The app's, never the browser's. */
    locale: string;
    /** The reader's time zone; the device's when absent. */
    timeZone?: string;
    translate: ChatTranslate;
    /** The signed-in person's identity user id, which typing frames are compared against. */
    currentUserId: Maybe<UUID>;
    /** Null when no gateway is configured: the kit runs on its poll alone. */
    realtime: Maybe<ChatRealtimeConnection>;
    typing: ChatTypingStore;
    pending: ChatPendingStore;
    /** The highest `seq` this tab has already told `chat-api` it read, per conversation. */
    readMarks: Map<UUID, number>;
}

/**
 * Deliberately `null` rather than a working default: a hook outside the provider would otherwise
 * render keys and fetch nothing, which looks like a server problem and is a wiring problem.
 */
export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
    const context = useContext(ChatContext);
    if (context === null) throw new Error('A chat-kit hook was used outside a ChatProvider.');

    return context;
}
