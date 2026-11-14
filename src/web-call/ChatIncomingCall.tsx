import type { ChatCall } from '@iveri/contracts/chat';
import { createPortal } from 'react-dom';

import { useChatText } from '../provider/index.js';
import { callOther } from '../util/index.js';
import { ChatAvatar } from '../web/ChatAvatar.js';
import { ChatThemeScope } from '../web/ChatThemeScope.js';
import { HangUpIcon, PhoneIcon } from '../web/icons.js';
import { cn, DANGER_BUTTON, PRIMARY_BUTTON } from '../web/style.js';

export interface ChatIncomingCallProps {
    call: ChatCall;
    onAnswer: () => void;
    onDecline: () => void;
}

/**
 * Somebody is calling: who, voice or video, and Answer or Decline. A card at the bottom of the screen rather than a
 * modal over the page, because what somebody was doing stays theirs until they choose; an `alertdialog`, so a screen
 * reader announces it at once.
 */
export function ChatIncomingCall({ call, onAnswer, onDecline }: Readonly<ChatIncomingCallProps>): React.JSX.Element {
    const t = useChatText();
    const other = callOther(call);
    const name = other?.displayName ?? '';
    const line = t('chat.call.incoming', { kind: call.kind, name });

    return createPortal(
        <ChatThemeScope>
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:justify-end sm:p-6">
                <div
                    role="alertdialog"
                    aria-label={line}
                    className="pointer-events-auto flex w-full max-w-sm animate-fade-in flex-col gap-4 rounded-chat-card border border-chat-line bg-chat-surface p-4 text-chat-ink shadow-lg"
                >
                    <div className="flex items-center gap-3">
                        <ChatAvatar name={name} image={other?.avatar ?? null} size="md" />
                        <p className="min-w-0 flex-1 text-label font-semibold">{line}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={onDecline} className={DANGER_BUTTON}>
                            <HangUpIcon />
                            {t('chat.call.decline')}
                        </button>
                        <button type="button" onClick={onAnswer} className={cn(PRIMARY_BUTTON)}>
                            <PhoneIcon />
                            {t('chat.call.answer')}
                        </button>
                    </div>
                </div>
            </div>
        </ChatThemeScope>,
        document.body,
    );
}
