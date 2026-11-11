import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { ChatKitMessageKey, ChatTranslationValues } from '../i18n/index.js';
import type { ChatRealtimeStatus } from '../realtime/index.js';

import { useChatContext } from './chat-context.js';

const noSubscription = (): (() => void) => () => undefined;
const offStatus = (): ChatRealtimeStatus => 'off';

/** The connection's status, without holding it open. What the poll intervals read. */
export function useChatRealtimeStatus(): ChatRealtimeStatus {
    const { realtime } = useChatContext();

    return useSyncExternalStore(realtime?.subscribe ?? noSubscription, realtime?.getStatus ?? offStatus, offStatus);
}

/**
 * Holds the realtime connection open while the calling component is mounted, and reports its status.
 *
 * `ChatInbox` and `ChatThread` call it themselves. An app built on the hooks alone calls it once near
 * the top of its chat screens; without it the hooks simply poll at their faster rate.
 */
export function useChatRealtime(): ChatRealtimeStatus {
    const { realtime } = useChatContext();

    useEffect(() => realtime?.acquire(), [realtime]);

    return useChatRealtimeStatus();
}

/** The app's translate, typed to the keys the kit renders, so a misspelt key is a compile error. */
export function useChatText(): (key: ChatKitMessageKey, values?: ChatTranslationValues) => string {
    const { translate } = useChatContext();

    return useCallback((key: ChatKitMessageKey, values?: ChatTranslationValues) => translate(key, values), [translate]);
}
