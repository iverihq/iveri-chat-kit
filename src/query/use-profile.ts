import type { ChatProfile, CreateChatProfileRequest, UpdateChatProfileRequest } from '@iveri/contracts/chat';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import type { ChatApiError } from '../client/index.js';
import { useChatContext } from '../provider/index.js';

import { chatQueryKeys } from './query-keys.js';

/**
 * The signed-in person's own profile. The first call creates their `chat_person` row, and `hasProfile`
 * is false for a Baasi person until they have chosen a handle; inside a product it is always true.
 */
export function useChatProfile(): UseQueryResult<ChatProfile, ChatApiError> {
    const { client } = useChatContext();

    return useQuery<ChatProfile, ChatApiError>({
        queryKey: chatQueryKeys.profile(),
        queryFn: ({ signal }) => client.getProfile({ signal }),
        staleTime: 60_000,
    });
}

function useProfileMutation<TInput>(
    run: (input: TInput) => Promise<ChatProfile>,
): UseMutationResult<ChatProfile, ChatApiError, TInput> {
    const queryClient = useQueryClient();

    return useMutation<ChatProfile, ChatApiError, TInput>({
        mutationFn: run,
        onSuccess: (profile) => {
            queryClient.setQueryData(chatQueryKeys.profile(), profile);
        },
    });
}

/** Chooses a Baasi handle and name. Network only; `HANDLE_TAKEN` when somebody has it in any case. */
export function useCreateChatProfile(): UseMutationResult<ChatProfile, ChatApiError, CreateChatProfileRequest> {
    const { client } = useChatContext();

    return useProfileMutation((body: CreateChatProfileRequest) => client.createProfile(body));
}

export function useUpdateChatProfile(): UseMutationResult<ChatProfile, ChatApiError, UpdateChatProfileRequest> {
    const { client } = useChatContext();

    return useProfileMutation((body: UpdateChatProfileRequest) => client.updateProfile(body));
}

/** Replaces my personal invitation code; links with the old one stop working. */
export function useResetChatInviteCode(): UseMutationResult<ChatProfile, ChatApiError, void> {
    const { client } = useChatContext();

    return useProfileMutation(() => client.resetInviteCode());
}
