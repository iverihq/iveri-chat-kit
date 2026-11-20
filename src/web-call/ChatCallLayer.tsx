import type { Maybe, UUID } from '@iveri/contracts';
import type { ChatCallJoin } from '@iveri/contracts/chat';
import type { ReactNode } from 'react';

import { ChatCallControllerContext } from '../provider/index.js';
import { useCall, useCallSession } from '../query/index.js';

import { ChatCallScreen } from './ChatCallScreen.js';
import { ChatGroupCallScreen } from './ChatGroupCallScreen.js';
import { ChatIncomingCall } from './ChatIncomingCall.js';

export interface ChatCallLayerProps {
    children?: ReactNode;
}

/**
 * Calls for everything inside it: mount it once, inside `ChatProvider` and around the app. It hears calls ringing for
 * this person (a frame, or the poll while the socket is down), shows who is calling, and carries the one call under
 * way on a screen over the app. Threads inside it draw their call buttons, because it provides the controller they
 * look for. What it does is `useCallSession`; this only draws it.
 */
export function ChatCallLayer({ children }: Readonly<ChatCallLayerProps>): React.JSX.Element {
    const session = useCallSession();
    const { ringing, active } = session;

    return (
        <ChatCallControllerContext.Provider value={session.controller}>
            {children}
            {ringing !== null && (
                <ChatIncomingCall
                    call={ringing}
                    onAnswer={() => {
                        session.answer(ringing);
                    }}
                    onDecline={() => {
                        session.decline(ringing);
                    }}
                />
            )}
            {active !== null && <ActiveCall callId={active.callId} join={active.join} onClose={session.close} />}
        </ChatCallControllerContext.Provider>
    );
}

/** The call under way, on the screen its kind needs: two people face to face, or a group's grid. */
function ActiveCall({
    callId,
    join,
    onClose,
}: Readonly<{ callId: UUID; join: Maybe<ChatCallJoin>; onClose: () => void }>): React.JSX.Element | null {
    const call = useCall(callId).data;

    if (call === undefined) return null;

    return call.isGroup ? (
        <ChatGroupCallScreen callId={callId} join={join} onClose={onClose} />
    ) : (
        <ChatCallScreen callId={callId} join={join} onClose={onClose} />
    );
}
