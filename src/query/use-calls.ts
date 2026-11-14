import type { Maybe, UUID } from '@iveri/contracts';
import { ChatCallStatus, type ChatCall, type ChatCallJoin, type ChatCallKind } from '@iveri/contracts/chat';
import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createClientMessageId, type ChatApiError } from '../client/index.js';
import { useChatContext, useChatRealtimeStatus } from '../provider/index.js';
import { conversationPollInterval, incomingCallsPollInterval } from '../realtime/index.js';

import { chatQueryKeys, NO_ID } from './query-keys.js';

/**
 * The calls ringing for me now, anywhere. Polled every four seconds while the socket is down, because a call rings
 * for 45 and the poll is then the only way to hear it; with the socket up a frame brings it and the poll recovers.
 */
export function useIncomingCalls(options: { enabled?: boolean } = {}): UseQueryResult<ChatCall[], ChatApiError> {
    const { client } = useChatContext();
    const status = useChatRealtimeStatus();

    return useQuery<ChatCall[], ChatApiError>({
        queryKey: chatQueryKeys.incomingCalls(),
        queryFn: ({ signal }) => client.listIncomingCalls({ signal }),
        refetchInterval: incomingCallsPollInterval(status),
        enabled: options.enabled ?? true,
    });
}

/** One call, followed until it ends: the poll stops once it has. */
export function useCall(callId: Maybe<UUID>): UseQueryResult<ChatCall, ChatApiError> {
    const { client } = useChatContext();
    const status = useChatRealtimeStatus();

    return useQuery<ChatCall, ChatApiError>({
        queryKey: chatQueryKeys.call(callId ?? NO_ID),
        queryFn: ({ signal }) => client.getCall(callId ?? NO_ID, { signal }),
        enabled: callId !== null,
        refetchInterval: (query) =>
            query.state.data?.status === ChatCallStatus.ENDED ? false : conversationPollInterval(status),
    });
}

/** The call ringing or under way in one conversation, for a banner over its thread. */
export function useCurrentCall(conversationId: Maybe<UUID>): UseQueryResult<Maybe<ChatCall>, ChatApiError> {
    const { client } = useChatContext();
    const status = useChatRealtimeStatus();

    return useQuery<Maybe<ChatCall>, ChatApiError>({
        queryKey: chatQueryKeys.currentCall(conversationId ?? NO_ID),
        queryFn: async ({ signal }) => (await client.getCurrentCall(conversationId ?? NO_ID, { signal })).call,
        enabled: conversationId !== null,
        refetchInterval: conversationPollInterval(status),
    });
}

export interface ChatCallActions {
    /** Rings the other person. The answer may already be over: busy. */
    start: (conversationId: UUID, kind: ChatCallKind) => Promise<ChatCall>;
    accept: (callId: UUID) => Promise<ChatCallJoin>;
    join: (callId: UUID) => Promise<ChatCallJoin>;
    decline: (callId: UUID) => Promise<ChatCall>;
    end: (callId: UUID) => Promise<ChatCall>;
}

/** Puts what the server answered straight into the cache, then lets every call query look again. */
async function remember(queryClient: QueryClient, call: ChatCall): Promise<void> {
    queryClient.setQueryData(chatQueryKeys.call(call.id), call);
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.calls(), refetchType: 'none' });
}

/**
 * What a call screen does. Plain promises rather than mutations, because a call screen chains them (start, then
 * join, then connect) and decides itself what a failure means at each step.
 */
export function useCallActions(): ChatCallActions {
    const { client } = useChatContext();
    const queryClient = useQueryClient();

    return useMemo(
        () => ({
            start: async (conversationId, kind): Promise<ChatCall> => {
                const call = await client.startCall(conversationId, { kind, clientCallId: createClientMessageId() });

                await remember(queryClient, call);

                return call;
            },
            accept: async (callId): Promise<ChatCallJoin> => {
                const answer = await client.acceptCall(callId);

                await remember(queryClient, answer.call);

                return answer;
            },
            join: async (callId): Promise<ChatCallJoin> => {
                const answer = await client.joinCall(callId);

                await remember(queryClient, answer.call);

                return answer;
            },
            decline: async (callId): Promise<ChatCall> => {
                const call = await client.declineCall(callId);

                await remember(queryClient, call);

                return call;
            },
            end: async (callId): Promise<ChatCall> => {
                const call = await client.endCall(callId);

                await remember(queryClient, call);

                return call;
            },
        }),
        [client, queryClient],
    );
}
