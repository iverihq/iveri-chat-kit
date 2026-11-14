import type { Maybe, UUID } from '@iveri/contracts';
import type { ChatCallKind } from '@iveri/contracts/chat';
import { createContext, useContext } from 'react';

/**
 * What a thread needs of whatever carries calls in this app: a way to start one, and which call is under way. The
 * call layer from `@iveri/chat-kit/web-call` provides it; **without one, no call button is drawn**, so an app that
 * does not install the media library offers no call it could not make.
 */
export interface ChatCallController {
    startCall: (conversationId: UUID, kind: ChatCallKind) => void;
    activeCallId: Maybe<UUID>;
}

export const ChatCallControllerContext = createContext<ChatCallController | null>(null);

export function useChatCallController(): ChatCallController | null {
    return useContext(ChatCallControllerContext);
}
