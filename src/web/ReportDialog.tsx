import type { Nullable, UUID } from '@iveri/contracts';
import { ChatReportReason, ChatReportTarget } from '@iveri/contracts/chat';
import { useId, useState } from 'react';

import { useChatContext, useChatText } from '../provider/index.js';
import { useReport } from '../query/index.js';
import { describeError } from '../util/index.js';

import { ChatDialog } from './ChatDialog.js';
import { cn, FOCUS_RING, PRIMARY_BUTTON, QUIET_BUTTON, TEXT_INPUT } from './style.js';

export type ReportTarget = { kind: 'message'; messageId: UUID } | { kind: 'person'; userId: UUID; name: string };

export interface ReportDialogProps {
    target: ReportTarget;
    onClose: () => void;
}

const NOTE_MAX_LENGTH = 1000;

/**
 * Reporting a message or a person: a reason, an optional note, and an honest line about what a reviewer
 * will see. Reporting a message copies it and the five before it into the case, because the author can
 * edit or delete it the moment they notice; saying so is the difference between a report and a surprise.
 */
export function ReportDialog({ target, onClose }: Readonly<ReportDialogProps>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const report = useReport();
    const [reason, setReason] = useState<Nullable<ChatReportReason>>(null);
    const [note, setNote] = useState('');
    const groupId = useId();
    const noteId = useId();

    const title =
        target.kind === 'message'
            ? t('chat.report.title-message')
            : t('chat.report.title-person', { name: target.name });

    if (report.isSuccess) {
        return (
            <ChatDialog
                title={title}
                onClose={onClose}
                footer={
                    <button type="button" className={PRIMARY_BUTTON} onClick={onClose}>
                        {t('chat.common.close')}
                    </button>
                }
            >
                <p role="status" className="text-body text-chat-ink-soft">
                    {t('chat.report.sent')}
                </p>
            </ChatDialog>
        );
    }

    const submit = (): void => {
        if (reason === null) return;
        const trimmed = note.trim();
        report.mutate({
            target: target.kind === 'message' ? ChatReportTarget.MESSAGE : ChatReportTarget.PERSON,
            ...(target.kind === 'message' ? { messageId: target.messageId } : { userId: target.userId }),
            reason,
            note: trimmed.length > 0 ? trimmed : null,
        });
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
                        className={PRIMARY_BUTTON}
                        disabled={reason === null || report.isPending}
                        onClick={submit}
                    >
                        {t('chat.report.submit')}
                    </button>
                </>
            }
        >
            <fieldset aria-labelledby={groupId} className="flex flex-col gap-1">
                <legend id={groupId} className="mb-2 text-label font-medium text-chat-ink-soft">
                    {t('chat.report.reason')}
                </legend>
                {Object.values(ChatReportReason).map((value) => (
                    <label
                        key={value}
                        className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-chat-control border px-3 py-2.5 text-body transition-colors duration-fast',
                            reason === value
                                ? 'border-chat-accent bg-chat-accent-soft text-chat-ink'
                                : 'border-chat-line text-chat-ink hover:bg-chat-raised',
                        )}
                    >
                        <input
                            type="radio"
                            name={groupId}
                            value={value}
                            checked={reason === value}
                            onChange={() => {
                                setReason(value);
                            }}
                            className={cn('h-4 w-4 accent-[var(--color-accent)]', FOCUS_RING)}
                        />
                        {t(`chat.report.reason.${value}`)}
                    </label>
                ))}
            </fieldset>

            <div className="mt-4 flex flex-col gap-2">
                <label htmlFor={noteId} className="text-label font-medium text-chat-ink-soft">
                    {t('chat.report.note')}{' '}
                    <span className="font-normal text-chat-muted">{t('chat.report.note-hint')}</span>
                </label>
                <textarea
                    id={noteId}
                    rows={3}
                    maxLength={NOTE_MAX_LENGTH}
                    value={note}
                    onChange={(event) => {
                        setNote(event.target.value);
                    }}
                    className={cn(TEXT_INPUT, 'resize-y')}
                />
            </div>

            {target.kind === 'message' && (
                <p className="mt-4 text-small text-chat-muted">{t('chat.report.disclosure')}</p>
            )}
            {report.isError && (
                <p role="alert" className="mt-3 text-small text-critical">
                    {describeError(report.error, translate)}
                </p>
            )}
        </ChatDialog>
    );
}
