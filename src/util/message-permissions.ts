import {
    CHAT_DELETE_WINDOW_HOURS,
    CHAT_EDIT_WINDOW_HOURS,
    ChatConversationKind,
    ChatParticipantRole,
} from '@iveri/contracts/chat';
import type { ChatConversation, ChatMessage } from '@iveri/contracts/chat';

const HOUR_MS = 3_600_000;

function within(message: ChatMessage, hours: number, now: Date): boolean {
    return now.getTime() - new Date(message.sentAt).getTime() <= hours * HOUR_MS;
}

/**
 * What a person may do to one message, decided the way `chat-api` decides it, so the kit never offers
 * an action the server will refuse. The server still decides: these only choose which buttons to draw,
 * and a refusal that slips through (a clock that is off) is shown like any other.
 */
export interface ChatMessagePermissions {
    canReply: boolean;
    canReact: boolean;
    canCopy: boolean;
    /** Author only, text only, within `CHAT_EDIT_WINDOW_HOURS`. */
    canEdit: boolean;
    /** The author within `CHAT_DELETE_WINDOW_HOURS`, or a group's owner or admin at any time. */
    canDeleteForEveryone: boolean;
    canDeleteForMe: boolean;
    /** Never one's own message, never a notice. */
    canReport: boolean;
}

export function messagePermissions(
    message: ChatMessage,
    conversation: Pick<ChatConversation, 'kind' | 'myRole' | 'canSend'>,
    now: Date,
): ChatMessagePermissions {
    const isSystem = message.systemKey !== null;
    const isLive = !message.isDeleted && !isSystem;
    const hasText = message.body !== null && message.body.length > 0;
    const moderatesGroup =
        conversation.kind === ChatConversationKind.GROUP &&
        (conversation.myRole === ChatParticipantRole.OWNER || conversation.myRole === ChatParticipantRole.ADMIN);

    return {
        canReply: isLive && conversation.canSend,
        canReact: isLive && conversation.canSend,
        canCopy: isLive && hasText,
        canEdit: isLive && message.isOwn && hasText && within(message, CHAT_EDIT_WINDOW_HOURS, now),
        canDeleteForEveryone:
            isLive && ((message.isOwn && within(message, CHAT_DELETE_WINDOW_HOURS, now)) || moderatesGroup),
        canDeleteForMe: !isSystem,
        canReport: isLive && !message.isOwn,
    };
}
