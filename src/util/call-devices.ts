import type { Maybe, Nullable } from '@iveri/contracts';

/** The three kinds of device a call can be switched between, as the browser names them. */
export type ChatCallDeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

/** A device as `navigator.mediaDevices.enumerateDevices` describes one; only these two fields are read. */
export interface ChatCallDeviceInfo {
    deviceId: string;
    label: string;
}

export interface ChatCallDeviceOption {
    id: string;
    /** The browser's own name for it, or null where it gave none and the screen numbers it instead. */
    label: Nullable<string>;
    /** Its place in the list from 1, for "Device 2" when it has no name. */
    number: number;
}

export interface ChatCallDeviceChoice {
    options: ChatCallDeviceOption[];
    /** The device in use, always one of `options`, or null when there is none. */
    selected: Nullable<string>;
}

/**
 * The devices of one kind a person can pick between, and which one is in use.
 *
 * A browser that has not been allowed the microphone lists devices with an empty id and no name; such an entry cannot
 * be chosen, so it is left out. A device with an id but no name is kept and numbered.
 *
 * What is in use is what LiveKit reports switching to; before anything was switched it reports nothing, and the
 * browser is then using its default, which Chrome lists as `default` and Safari and Firefox do not list at all, so the
 * first entry stands for it.
 */
export function callDeviceChoice(
    devices: readonly ChatCallDeviceInfo[],
    activeId: Maybe<string>,
): ChatCallDeviceChoice {
    const usable = devices.filter((device) => device.deviceId !== '');
    const options = usable.map((device, index) => ({
        id: device.deviceId,
        label: device.label.trim() === '' ? null : device.label,
        number: index + 1,
    }));
    const ids = new Set(options.map((option) => option.id));
    const selected =
        activeId !== null && activeId !== undefined && ids.has(activeId)
            ? activeId
            : ids.has('default')
              ? 'default'
              : (options[0]?.id ?? null);

    return { options, selected };
}
