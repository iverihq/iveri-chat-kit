import type { Maybe, UUID } from '@iveri/contracts';
import { ChatCallStatus, type ChatCall, type ChatCallJoin, type ChatCallKind } from '@iveri/contracts/chat';
import { useCallback, useMemo, useState } from 'react';

import type { ChatCallController } from '../provider/index.js';

import { useCallActions, useIncomingCalls } from './use-calls.js';

/** The one call under way: its id, and what connects to it once the server has answered. */
export interface ChatActiveCall {
    callId: UUID;
    join: Maybe<ChatCallJoin>;
}

export interface ChatCallSession {
    /** What a thread reads to draw its call buttons. */
    controller: ChatCallController;
    /** A call ringing for me, to show, while no call is under way. */
    ringing: ChatCall | null;
    active: ChatActiveCall | null;
    answer: (call: ChatCall) => void;
    decline: (call: ChatCall) => void;
    /** The call screen is done: the call ended and its last line has been shown. */
    close: () => void;
}

/**
 * Everything a call layer does, for the web and the phone alike, so each only draws: what is ringing for me, the
 * one call under way, starting one (and joining it once it rings), answering and declining.
 *
 * One call at a time: a second ringing while a call is under way is not offered, and `chat-api` has told its caller
 * this person is busy. A ring I declined is hidden at once, before the server's answer arrives.
 */
export function useCallSession(): ChatCallSession {
    const actions = useCallActions();
    const incoming = useIncomingCalls();
    const [active, setActive] = useState<ChatActiveCall | null>(null);
    const [dismissed, setDismissed] = useState<ReadonlySet<UUID>>(new Set());

    const ringing =
        active === null
            ? ((incoming.data ?? []).find(
                  (call) => call.status === ChatCallStatus.RINGING && !dismissed.has(call.id),
              ) ?? null)
            : null;

    const controller = useMemo<ChatCallController>(
        () => ({
            activeCallId: active?.callId ?? null,
            startCall: (conversationId: UUID, kind: ChatCallKind): void => {
                if (active !== null) return;

                void (async (): Promise<void> => {
                    const call = await actions.start(conversationId, kind);

                    setActive({ callId: call.id, join: null });

                    // Busy ends it before it rings: the screen says so and closes, with nothing to join.
                    if (call.status === ChatCallStatus.ENDED) return;

                    const join = await actions.join(call.id);

                    setActive((current) => (current?.callId === call.id ? { ...current, join } : current));
                })().catch(() => {
                    setActive(null);
                });
            },
        }),
        [actions, active],
    );

    const answer = useCallback(
        (call: ChatCall): void => {
            setActive({ callId: call.id, join: null });
            actions
                .accept(call.id)
                .then((join) => {
                    setActive({ callId: call.id, join });
                })
                .catch(() => {
                    setActive(null);
                });
        },
        [actions],
    );

    const decline = useCallback(
        (call: ChatCall): void => {
            setDismissed((current) => new Set([...current, call.id]));
            void actions.decline(call.id).catch(() => undefined);
        },
        [actions],
    );

    const close = useCallback((): void => {
        setActive(null);
    }, []);

    return { controller, ringing, active, answer, decline, close };
}
