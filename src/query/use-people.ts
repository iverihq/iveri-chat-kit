import type { Maybe, UUID } from '@iveri/contracts';
import type {
    AcceptChatInvitationResponse,
    ChatBlock,
    ChatContact,
    ChatInvitationPreview,
    ChatMessageSearchHit,
    ChatPersonCard,
    CreateChatReportRequest,
} from '@iveri/contracts/chat';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import type { ChatApiError } from '../client/index.js';
import { useChatContext } from '../provider/index.js';

import { chatQueryKeys, NO_ID } from './query-keys.js';
import { useDebouncedValue } from './use-debounced-value.js';

/** The fewest characters a search is sent with: the server refuses fewer, so the client never asks. */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 250;

export interface ChatSearchState<T> {
    results: T[];
    /** The trimmed query the results are for, once it has stopped changing. */
    query: string;
    /** Whether the current input is long enough to have been sent. */
    isActive: boolean;
    isFetching: boolean;
    isError: boolean;
}

function useDebouncedSearch(input: string): { query: string; isActive: boolean } {
    const query = useDebouncedValue(input.trim(), SEARCH_DEBOUNCE_MS);

    return { query, isActive: query.length >= SEARCH_MIN_LENGTH };
}

/**
 * People in Baasi by handle prefix, then by name. Debounced, at least two characters, network only. Never
 * anybody either side has blocked: the server leaves them out, so the client has nothing to filter.
 */
export function usePeopleSearch(input: string): ChatSearchState<ChatPersonCard> {
    const { client } = useChatContext();
    const { query, isActive } = useDebouncedSearch(input);
    const result = useQuery<ChatPersonCard[], ChatApiError>({
        queryKey: chatQueryKeys.people(query),
        queryFn: ({ signal }) => client.searchPeople(query, { signal }),
        enabled: isActive,
        staleTime: 30_000,
    });

    return {
        results: isActive ? (result.data ?? []) : [],
        query,
        isActive,
        isFetching: result.isFetching,
        isError: result.isError,
    };
}

/** The text of my own messages, in my own conversations only. Debounced, at least two characters. */
export function useMessageSearch(input: string): ChatSearchState<ChatMessageSearchHit> {
    const { client } = useChatContext();
    const { query, isActive } = useDebouncedSearch(input);
    const result = useQuery<ChatMessageSearchHit[], ChatApiError>({
        queryKey: chatQueryKeys.messageSearch(query),
        queryFn: ({ signal }) => client.searchMessages(query, { signal }),
        enabled: isActive,
        staleTime: 10_000,
    });

    return {
        results: isActive ? (result.data ?? []) : [],
        query,
        isActive,
        isFetching: result.isFetching,
        isError: result.isError,
    };
}

export function usePerson(userId: Maybe<UUID>): UseQueryResult<ChatPersonCard, ChatApiError> {
    const { client } = useChatContext();

    return useQuery<ChatPersonCard, ChatApiError>({
        queryKey: chatQueryKeys.person(userId ?? NO_ID),
        queryFn: ({ signal }) => client.getPerson(userId ?? NO_ID, { signal }),
        enabled: typeof userId === 'string' && userId.length > 0,
    });
}

/** My contacts. Network only, like `useBlocks`. */
export function useContacts({ enabled = true }: { enabled?: boolean } = {}): UseQueryResult<
    ChatContact[],
    ChatApiError
> {
    const { client } = useChatContext();

    return useQuery<ChatContact[], ChatApiError>({
        queryKey: chatQueryKeys.contacts(),
        queryFn: ({ signal }) => client.listContacts({ signal }),
        enabled,
    });
}

export interface ChatContactChange {
    userId: UUID;
    isContact: boolean;
}

/** Adds somebody to my contacts, or takes them off. A person who has me as a contact sees my messages as conversations, not requests. */
export function useContactChange(): UseMutationResult<void, ChatApiError, ChatContactChange> {
    const { client } = useChatContext();
    const queryClient = useQueryClient();

    return useMutation<void, ChatApiError, ChatContactChange>({
        mutationFn: async ({ userId, isContact }) => {
            if (isContact) await client.addContact({ userId });
            else await client.removeContact(userId);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: chatQueryKeys.contacts() }),
    });
}

/** My blocks. Network only, so a product's screen passes `enabled: false` rather than ask and be refused. */
export function useBlocks({ enabled = true }: { enabled?: boolean } = {}): UseQueryResult<ChatBlock[], ChatApiError> {
    const { client } = useChatContext();

    return useQuery<ChatBlock[], ChatApiError>({
        queryKey: chatQueryKeys.blocks(),
        queryFn: ({ signal }) => client.listBlocks({ signal }),
        enabled,
    });
}

export interface ChatBlockChange {
    userId: UUID;
    isBlocked: boolean;
}

/** Blocks or unblocks somebody. Silent: they are not told. Every conversation is looked at again, because who may write where has changed. */
export function useBlockChange(): UseMutationResult<void, ChatApiError, ChatBlockChange> {
    const { client } = useChatContext();
    const queryClient = useQueryClient();

    return useMutation<void, ChatApiError, ChatBlockChange>({
        mutationFn: ({ userId, isBlocked }) => (isBlocked ? client.block(userId) : client.unblock(userId)),
        onSettled: () => queryClient.invalidateQueries({ queryKey: chatQueryKeys.all }),
    });
}

export function useInvitation(code: Maybe<string>): UseQueryResult<ChatInvitationPreview, ChatApiError> {
    const { client } = useChatContext();

    return useQuery<ChatInvitationPreview, ChatApiError>({
        queryKey: chatQueryKeys.invitation(code ?? ''),
        queryFn: ({ signal }) => client.getInvitation(code ?? '', { signal }),
        enabled: typeof code === 'string' && code.length > 0,
        retry: false,
    });
}

/** Accepts an invitation: a person's opens (or returns) our conversation, a group's joins it. */
export function useAcceptInvitation(): UseMutationResult<AcceptChatInvitationResponse, ChatApiError, string> {
    const { client } = useChatContext();
    const queryClient = useQueryClient();

    return useMutation<AcceptChatInvitationResponse, ChatApiError, string>({
        mutationFn: (code) => client.acceptInvitation(code),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() }),
    });
}

/** Reports a message or a person. A second report of the same thing by the same person is a no-op on the server. */
export function useReport(): UseMutationResult<void, ChatApiError, CreateChatReportRequest> {
    const { client } = useChatContext();

    return useMutation<void, ChatApiError, CreateChatReportRequest>({
        mutationFn: (body) => client.report(body),
    });
}
