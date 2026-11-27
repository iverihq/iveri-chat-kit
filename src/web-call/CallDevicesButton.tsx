import { useEffect, useId, useRef, useState } from 'react';

import { useChatText } from '../provider/index.js';
import type { ChatCallDeviceChoice, ChatCallDeviceKind } from '../util/index.js';
import { DevicesIcon } from '../web/icons.js';
import { cn, FOCUS_RING } from '../web/style.js';

import type { ChatCallDevices } from './use-call-devices.js';

const SELECT = cn(
    'w-full rounded-chat-control border border-white/20 bg-white/10 px-3 py-2 text-body text-white',
    FOCUS_RING,
);

interface Row {
    kind: ChatCallDeviceKind;
    labelKey: 'chat.call.device.microphone' | 'chat.call.device.camera' | 'chat.call.device.speaker';
    choice: ChatCallDeviceChoice;
}

/**
 * The round control that opens the call's devices, and the panel it opens above the controls: the microphone, the
 * camera in a video call, and the speaker where the browser can switch one. The panel is placed against the controls'
 * row (the nearest positioned box), never against this button, so it stays on a phone's screen whichever button it
 * opened from. Escape, the control again or a press outside closes it; choosing a device leaves it open, so a person
 * can try one microphone after another while talking.
 */
export function CallDevicesButton({
    devices,
    hasCamera,
    className,
}: Readonly<{ devices: ChatCallDevices; hasCamera: boolean; className: string }>): React.JSX.Element {
    const t = useChatText();
    const [isOpen, setOpen] = useState(false);
    const panelId = useId();
    const titleId = useId();
    const wrapper = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) return undefined;

        const onPointer = (event: PointerEvent): void => {
            if (wrapper.current !== null && !wrapper.current.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);

        return (): void => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [isOpen]);

    const candidates: (Row | null)[] = [
        { kind: 'audioinput', labelKey: 'chat.call.device.microphone', choice: devices.microphones },
        hasCamera ? { kind: 'videoinput', labelKey: 'chat.call.device.camera', choice: devices.cameras } : null,
        devices.speakers === null
            ? null
            : { kind: 'audiooutput', labelKey: 'chat.call.device.speaker', choice: devices.speakers },
    ];
    const rows = candidates.filter((row): row is Row => row !== null && row.choice.options.length > 0);

    return (
        <div ref={wrapper} className="contents">
            <button
                type="button"
                aria-label={t('chat.call.devices')}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => {
                    setOpen((open) => !open);
                }}
                className={className}
            >
                <DevicesIcon className="h-6 w-6" />
            </button>
            {isOpen && (
                <div
                    id={panelId}
                    role="group"
                    aria-labelledby={titleId}
                    className="absolute inset-x-4 bottom-full mx-auto mb-4 flex max-w-xs flex-col gap-3 rounded-chat-card bg-chat-ink/95 p-4 text-left shadow-lg ring-1 ring-white/15 [color-scheme:dark]"
                >
                    <p id={titleId} className="text-label font-semibold text-white">
                        {t('chat.call.devices')}
                    </p>
                    {rows.length === 0 ? (
                        <p className="text-caption text-white/80">{t('chat.call.devices.none')}</p>
                    ) : (
                        rows.map((row) => (
                            <label key={row.kind} className="flex flex-col gap-1 text-caption text-white/80">
                                {t(row.labelKey)}
                                <select
                                    value={row.choice.selected ?? ''}
                                    onChange={(event) => {
                                        devices.choose(row.kind, event.target.value);
                                    }}
                                    className={SELECT}
                                >
                                    {row.choice.options.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label ?? t('chat.call.device.unnamed', { index: option.number })}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
