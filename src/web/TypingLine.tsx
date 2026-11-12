import type { UUID } from '@iveri/contracts';
import type { ChatConversation } from '@iveri/contracts/chat';

import { useChatContext } from '../provider/index.js';
import { useTypingPeople } from '../query/index.js';
import { typingText } from '../util/index.js';

/**
 * "Nino is typing", under the last message, while a typing frame is less than six seconds old.
 *
 * The height is kept whether or not anybody is typing, so the line appearing does not shove the
 * conversation up by a line every few seconds; and it is a polite live region, because a screen reader
 * user wants to know somebody is answering without being interrupted to hear it.
 */
export function TypingLine({
    conversationId,
    conversation,
}: Readonly<{ conversationId: UUID; conversation: ChatConversation }>): React.JSX.Element {
    const { translate } = useChatContext();
    const typing = useTypingPeople(conversationId);
    const names = typing
        .map(
            (userId) =>
                conversation.participants.find((participant) => participant.userId === userId)?.displayName ?? '',
        )
        .filter((name) => name.length > 0);
    const text = typingText(names, translate);

    return (
        <div aria-live="polite" className="flex h-6 items-center gap-2 px-5 text-caption text-chat-muted">
            {text !== null && (
                <>
                    <span aria-hidden="true" className="flex items-center gap-[3px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-chat-faint motion-safe:animate-chat-typing" />
                        <span className="h-1.5 w-1.5 rounded-full bg-chat-faint motion-safe:animate-chat-typing [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-chat-faint motion-safe:animate-chat-typing [animation-delay:300ms]" />
                    </span>
                    <span className="truncate">{text}</span>
                </>
            )}
        </div>
    );
}
