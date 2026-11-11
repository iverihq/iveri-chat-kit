import type { UUID } from '@iveri/contracts';
import type {
    ChatConversation,
    ChatParticipantRole,
    CreateGroupChatRequest,
    StartDirectChatRequest,
    UpdateGroupChatRequest,
} from '@iveri/contracts/chat';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { ChatApiError, ChatClient } from '../client/index.js';
import { useChatContext } from '../provider/index.js';

import { storeConversation } from './cache.js';

/** A mutation that answers with the whole conversation, which is stored and the inbox refreshed. */
function useConversationMutation<TInput>(
    run: (client: ChatClient, input: TInput) => Promise<ChatConversation>,
): UseMutationResult<ChatConversation, ChatApiError, TInput> {
    const { client } = useChatContext();
    const queryClient = useQueryClient();

    return useMutation<ChatConversation, ChatApiError, TInput>({
        mutationFn: (input) => run(client, input),
        onSuccess: (conversation) => storeConversation(queryClient, conversation),
    });
}

/** Opens (or returns) my one-to-one conversation with somebody. Network only; `BLOCKED` either way. */
export function useStartDirectChat(): UseMutationResult<ChatConversation, ChatApiError, StartDirectChatRequest> {
    return useConversationMutation((client, body: StartDirectChatRequest) => client.startDirect(body));
}

/** Creates a group with me as its owner. Network only; people either side has blocked are skipped. */
export function useCreateGroupChat(): UseMutationResult<ChatConversation, ChatApiError, CreateGroupChatRequest> {
    return useConversationMutation((client, body: CreateGroupChatRequest) => client.createGroup(body));
}

export interface UpdateGroupInput extends UpdateGroupChatRequest {
    conversationId: UUID;
}

/** Renames a group or changes its photograph. Owner or admin; the server posts a notice either way. */
export function useUpdateGroupChat(): UseMutationResult<ChatConversation, ChatApiError, UpdateGroupInput> {
    return useConversationMutation((client, { conversationId, ...body }: UpdateGroupInput) =>
        client.updateGroup(conversationId, body),
    );
}

export interface AddMembersInput {
    conversationId: UUID;
    userIds: UUID[];
}

/** Adds people to a group. Owner or admin; `GROUP_FULL` past the limit. */
export function useAddChatMembers(): UseMutationResult<ChatConversation, ChatApiError, AddMembersInput> {
    return useConversationMutation((client, { conversationId, userIds }: AddMembersInput) =>
        client.addMembers(conversationId, { userIds }),
    );
}

export interface UpdateMemberRoleInput {
    conversationId: UUID;
    userId: UUID;
    role: ChatParticipantRole;
}

/** Changes a member's role. Owner only. */
export function useUpdateChatMemberRole(): UseMutationResult<ChatConversation, ChatApiError, UpdateMemberRoleInput> {
    return useConversationMutation((client, { conversationId, userId, role }: UpdateMemberRoleInput) =>
        client.updateMember(conversationId, userId, { role }),
    );
}

export interface RemoveMemberInput {
    conversationId: UUID;
    userId: UUID;
}

/** Removes somebody from a group. The owner, or an admin removing a member. */
export function useRemoveChatMember(): UseMutationResult<ChatConversation, ChatApiError, RemoveMemberInput> {
    return useConversationMutation((client, { conversationId, userId }: RemoveMemberInput) =>
        client.removeMember(conversationId, userId),
    );
}

/** Replaces a group's invitation link; the old one stops working. Owner or admin. */
export function useResetGroupInvite(): UseMutationResult<ChatConversation, ChatApiError, UUID> {
    return useConversationMutation((client, conversationId: UUID) => client.resetGroupInvite(conversationId));
}
