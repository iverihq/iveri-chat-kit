import { useState } from 'react';

import { useChatContext, useChatText } from '../provider/index.js';
import { describeError } from '../util/index.js';

import { ChatDialog } from './ChatDialog.js';
import { DANGER_BUTTON, PRIMARY_BUTTON, QUIET_BUTTON } from './style.js';

export interface ConfirmDialogProps {
    title: string;
    body: string;
    confirmLabel: string;
    tone?: 'danger' | 'default';
    onConfirm: () => Promise<void>;
    onClose: () => void;
}

/** A question before something that cannot be undone. The error, if any, stays in the dialog so it can be retried. */
export function ConfirmDialog({
    title,
    body,
    confirmLabel,
    tone = 'danger',
    onConfirm,
    onClose,
}: Readonly<ConfirmDialogProps>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const [isWorking, setIsWorking] = useState(false);
    const [error, setError] = useState<unknown>(null);

    const confirm = async (): Promise<void> => {
        setIsWorking(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (caught: unknown) {
            setError(caught);
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <ChatDialog
            title={title}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className={QUIET_BUTTON} onClick={onClose}>
                        {t('chat.common.cancel')}
                    </button>
                    <button
                        type="button"
                        className={tone === 'danger' ? DANGER_BUTTON : PRIMARY_BUTTON}
                        disabled={isWorking}
                        onClick={() => {
                            void confirm();
                        }}
                    >
                        {confirmLabel}
                    </button>
                </>
            }
        >
            <p className="text-body text-chat-ink-soft">{body}</p>
            {error !== null && (
                <p role="alert" className="mt-3 text-small text-critical">
                    {describeError(error, translate)}
                </p>
            )}
        </ChatDialog>
    );
}
