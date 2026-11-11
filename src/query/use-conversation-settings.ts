import type { IsoDateTime, Maybe, Nullable, UUID } from '@iveri/contracts';
import type { ChatConversationSummary } from '@iveri/contracts/chat';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ChatApiError } from '../client/index.js';
import { useChatContext } from '../provider/index.js';

import { updateConversationEverywhere } from './cache.js';
import { chatQueryKeys, NO_ID } from './query-keys.js';

export type ChatMuteDuration = '8h' | 'week' | 'always';

/** "Until I unmute" is a date far in the future, which is how the contract spells it. */
export const MUTED_FOREVER: IsoDateTime = '9999-12-31T23:59:59.000Z';

/** When a mute chosen now ends. */
export function muteUntil(duration: ChatMuteDuration, now: Date = new Date()): IsoDateTime {
    if (duration === 'always') return MUTED_FOREVER;
    const hours = duration === '8h' ? 8 : 7 * 24;

    return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

/** Whether a conversation is muted at this moment. A mute that ran out is no mute. */
export function isMuted(mutedUntil: Nullable<IsoDateTime>, now: Date = new Date()): boolean {
    return mutedUntil !== null && new Date(mutedUntil).getTime() > now.getTime();
}

type SettingsAction =
    | { type: 'mute'; mutedUntil: Nullable<IsoDateTime> }
    | { type: 'pin'; isPinned: boolean }
    | { type: 'archive'; isArchived: boolean }
    | { type: 'accept' }
    | { type: 'leave' }
    | { type: 'delete' };

export interface ChatConversationSettings {
    mute: (duration: Nullable<ChatMuteDuration>) => Promise<void>;
    pin: (isPinned: boolean) => Promise<void>;
    archive: (isArchived: boolean) => Promise<void>;
    /** Turns my request into an ordinary conversation. Accepting is what lets me reply. */
    accept: () => Promise<void>;
    leave: () => Promise<void>;
    /** Clears and hides it for me only. It comes back if a new message arrives. */
    deleteForMe: () => Promise<void>;
    isPending: boolean;
    error: Nullable<ChatApiError>;
}

/**
 * My own settings for one conversation. Pin, mute and archive move the row at once; the server's
 * answer (`PIN_LIMIT` past five pins) or the refetch after it settles where it really is.
 */
export function useConversationSettings(conversationId: Maybe<UUID>): ChatConversationSettings {
    const { client } = useChatContext();
    const queryClient = useQueryClient();
    const id = conversationId ?? NO_ID;

    const mutation = useMutation<Nullable<ChatConversationSummary>, ChatApiError, SettingsAction>({
        mutationFn: async (action) => {
            switch (action.type) {
                case 'mute':
                    return client.updateMySettings(id, { mutedUntil: action.mutedUntil });
                case 'pin':
                    return client.updateMySettings(id, { isPinned: action.isPinned });
                case 'archive':
                    return client.updateMySettings(id, { isArchived: action.isArchived });
                case 'accept':
                    return client.accept(id);
                case 'leave':
                    await client.leave(id);

                    return null;
                case 'delete':
                    await client.deleteConversation(id);

                    return null;
            }
        },
        onMutate: (action) => {
            if (action.type === 'mute') {
                updateConversationEverywhere(queryClient, id, (summary) => ({
                    ...summary,
                    mutedUntil: action.mutedUntil,
                }));
            } else if (action.type === 'pin') {
                updateConversationEverywhere(queryClient, id, (summary) => ({ ...summary, isPinned: action.isPinned }));
            } else if (action.type === 'archive') {
                updateConversationEverywhere(queryClient, id, (summary) => ({
                    ...summary,
                    isArchived: action.isArchived,
                }));
            }
        },
        onSuccess: (summary) => {
            if (summary !== null) updateConversationEverywhere(queryClient, id, () => summary);
        },
        onSettled: async (_data, _error, action) => {
            await queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() });
            if (action.type === 'delete') {
                queryClient.removeQueries({ queryKey: chatQueryKeys.messages(id) });
            } else {
                await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(id) });
            }
        },
    });

    const run = async (action: SettingsAction): Promise<void> => {
        if (id === NO_ID) return;
        await mutation.mutateAsync(action);
    };

    return {
        mute: (duration) => run({ type: 'mute', mutedUntil: duration === null ? null : muteUntil(duration) }),
        pin: (isPinned) => run({ type: 'pin', isPinned }),
        archive: (isArchived) => run({ type: 'archive', isArchived }),
        accept: () => run({ type: 'accept' }),
        leave: () => run({ type: 'leave' }),
        deleteForMe: () => run({ type: 'delete' }),
        isPending: mutation.isPending,
        error: mutation.error,
    };
}
