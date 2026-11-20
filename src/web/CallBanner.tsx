import type { UUID } from '@iveri/contracts';
import { ChatCallKind, ChatCallStatus } from '@iveri/contracts/chat';

import { useChatCallController, useChatText } from '../provider/index.js';
import { useCurrentCall } from '../query/index.js';
import { callPeopleIn, isCallFull } from '../util/index.js';

import { PhoneIcon, VideoIcon } from './icons.js';
import { cn, PRIMARY_BUTTON } from './style.js';

export interface CallBannerProps {
    conversationId: UUID;
}

/**
 * A group call going on in this conversation that I am not in: what kind, how many are in it, and Join (or that it is
 * full). Drawn only inside a call layer, like the call buttons, and never for the call already on my screen. Somebody
 * a group call did not ring (they muted the group, or it was too large to ring) finds it here.
 */
export function CallBanner({ conversationId }: Readonly<CallBannerProps>): React.JSX.Element | null {
    const t = useChatText();
    const calls = useChatCallController();
    const current = useCurrentCall(calls === null ? null : conversationId).data ?? null;

    if (
        calls === null ||
        current === null ||
        !current.isGroup ||
        current.status === ChatCallStatus.ENDED ||
        calls.activeCallId === current.id
    ) {
        return null;
    }

    const isFull = isCallFull(current);
    const Icon = current.kind === ChatCallKind.VIDEO ? VideoIcon : PhoneIcon;

    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-chat-line bg-chat-accent-soft px-4 py-2.5 sm:px-6"
        >
            <Icon className="h-5 w-5 shrink-0 text-chat-accent" />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-label font-semibold text-chat-ink">
                    {t('chat.call.in-progress', { kind: current.kind })}
                </span>
                <span className="text-caption text-chat-muted">
                    {isFull
                        ? t('chat.call.full')
                        : t('chat.call.people', { count: callPeopleIn(current).length })}
                </span>
            </span>
            <button
                type="button"
                disabled={isFull || calls.activeCallId !== null}
                onClick={() => {
                    calls.joinCall(current.id);
                }}
                className={cn(PRIMARY_BUTTON, 'min-h-9 px-3')}
            >
                {t('chat.call.join')}
            </button>
        </div>
    );
}
