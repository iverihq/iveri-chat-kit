import type { Maybe, UUID } from '@iveri/contracts';
import type { ChatInboxFolder } from '@iveri/contracts/chat';

import type { ChatContextRef } from '../client/index.js';

const ROOT = 'iveri-chat';

/**
 * The nil UUID, standing in for "no conversation yet" so a hook can be called unconditionally (the rules
 * of hooks) while its query stays disabled. Never sent: every query using it is `enabled: false`.
 */
export const NO_ID = '00000000-0000-0000-0000-000000000000' as UUID;

/**
 * Every query key the kit uses, under one root so an app can clear the kit's whole cache on sign-out
 * with `queryClient.removeQueries({ queryKey: chatQueryKeys.all })` and touch nothing of its own.
 */
export const chatQueryKeys = {
    all: [ROOT] as const,
    profile: () => [ROOT, 'profile'] as const,
    inboxes: () => [ROOT, 'inbox'] as const,
    inbox: (folder: ChatInboxFolder, product: Maybe<string>) => [ROOT, 'inbox', folder, product ?? null] as const,
    conversations: () => [ROOT, 'conversation'] as const,
    conversation: (conversationId: UUID) => [ROOT, 'conversation', conversationId] as const,
    conversationByContext: (context: ChatContextRef) =>
        [ROOT, 'conversation-by-context', context.product, context.type, context.id] as const,
    messages: (conversationId: UUID) => [ROOT, 'messages', conversationId] as const,
    people: (query: string) => [ROOT, 'people', query] as const,
    person: (userId: UUID) => [ROOT, 'person', userId] as const,
    contacts: () => [ROOT, 'contacts'] as const,
    blocks: () => [ROOT, 'blocks'] as const,
    invitation: (code: string) => [ROOT, 'invitation', code] as const,
    messageSearch: (query: string) => [ROOT, 'message-search', query] as const,
};
