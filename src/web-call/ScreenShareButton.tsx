import { useChatText } from '../provider/index.js';
import { ScreenShareIcon, ScreenShareOffIcon } from '../web/icons.js';

/** The round control that starts or stops sharing my screen; its shape and colour are the screen's own controls'. */
export function ScreenShareButton({
    isSharing,
    onToggle,
    className,
}: Readonly<{ isSharing: boolean; onToggle: () => void; className: string }>): React.JSX.Element {
    const t = useChatText();

    return (
        <button
            type="button"
            aria-label={t(isSharing ? 'chat.call.stop-sharing' : 'chat.call.share-screen')}
            aria-pressed={isSharing}
            onClick={onToggle}
            className={className}
        >
            {isSharing ? <ScreenShareOffIcon className="h-6 w-6" /> : <ScreenShareIcon className="h-6 w-6" />}
        </button>
    );
}

/** The line that says my screen is being shown to the others, with the way to stop it beside the words. */
export function SharingMyScreen({ onStop }: Readonly<{ onStop: () => void }>): React.JSX.Element {
    const t = useChatText();

    return (
        <div
            role="status"
            className="mx-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full bg-white/10 px-4 py-1.5 text-label text-white"
        >
            <span>{t('chat.call.sharing-mine')}</span>
            <button
                type="button"
                onClick={onStop}
                className="rounded-full font-semibold text-chat-accent underline-offset-2 hover:underline"
            >
                {t('chat.call.stop-sharing')}
            </button>
        </div>
    );
}
