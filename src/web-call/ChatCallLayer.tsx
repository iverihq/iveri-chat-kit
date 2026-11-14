import type { Maybe, UUID } from '@iveri/contracts';
import { ChatCallStatus, type ChatCallJoin, type ChatCallKind } from '@iveri/contracts/chat';
import { useMemo, useState, type ReactNode } from 'react';

import { ChatCallControllerContext, type ChatCallController } from '../provider/index.js';
import { useCallActions, useIncomingCalls } from '../query/index.js';

import { ChatCallScreen } from './ChatCallScreen.js';
import { ChatIncomingCall } from './ChatIncomingCall.js';

interface ActiveCall {
    callId: UUID;
    join: Maybe<ChatCallJoin>;
}

export interface ChatCallLayerProps {
    children?: ReactNode;
}

/**
 * Calls for everything inside it: mount it once, inside `ChatProvider` and around the app. It hears calls ringing for
 * this person (a frame, or the poll while the socket is down), shows who is calling, and carries the one call under
 * way on a screen over the app. Threads inside it draw their call buttons, because it provides the controller they
 * look for.
 *
 * One call at a time: a second one ringing while a call is under way is not shown, and `chat-api` has already told
 * its caller this person is busy. A ring I declined is hidden at once, before the server's answer arrives.
 */
export function ChatCallLayer({ children }: Readonly<ChatCallLayerProps>): React.JSX.Element {
    const actions = useCallActions();
    const incoming = useIncomingCalls();
    const [active, setActive] = useState<ActiveCall | null>(null);
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

    return (
        <ChatCallControllerContext.Provider value={controller}>
            {children}
            {ringing !== null && (
                <ChatIncomingCall
                    call={ringing}
                    onAnswer={() => {
                        setActive({ callId: ringing.id, join: null });
                        actions
                            .accept(ringing.id)
                            .then((join) => {
                                setActive({ callId: ringing.id, join });
                            })
                            .catch(() => {
                                setActive(null);
                            });
                    }}
                    onDecline={() => {
                        setDismissed(new Set([...dismissed, ringing.id]));
                        void actions.decline(ringing.id).catch(() => undefined);
                    }}
                />
            )}
            {active !== null && (
                <ChatCallScreen
                    callId={active.callId}
                    join={active.join}
                    onClose={() => {
                        setActive(null);
                    }}
                />
            )}
        </ChatCallControllerContext.Provider>
    );
}
