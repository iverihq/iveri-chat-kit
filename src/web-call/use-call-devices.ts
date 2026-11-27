import type { Nullable } from '@iveri/contracts';
import { Room, RoomEvent, supportsAudioOutputSelection } from 'livekit-client';
import { useCallback, useEffect, useState } from 'react';

import {
    callDeviceChoice,
    type ChatCallDeviceChoice,
    type ChatCallDeviceInfo,
    type ChatCallDeviceKind,
} from '../util/index.js';

export interface ChatCallDevices {
    microphones: ChatCallDeviceChoice;
    cameras: ChatCallDeviceChoice;
    /** Null where the browser cannot send a call's sound to another output (Safari on a phone), so none is offered. */
    speakers: Nullable<ChatCallDeviceChoice>;
    choose: (kind: ChatCallDeviceKind, deviceId: string) => void;
}

type Lists = Record<ChatCallDeviceKind, ChatCallDeviceInfo[]>;
type Active = Record<ChatCallDeviceKind, Nullable<string>>;

const KINDS: readonly ChatCallDeviceKind[] = ['audioinput', 'videoinput', 'audiooutput'];
const NO_LISTS: Lists = { audioinput: [], videoinput: [], audiooutput: [] };
const NO_ACTIVE: Active = { audioinput: null, videoinput: null, audiooutput: null };

/**
 * The microphones, cameras and speakers this browser offers for the call in `room`, and switching between them.
 *
 * The lists are read without asking for permission again: the call already asked when it turned the microphone on,
 * and a second prompt over a call would read as something gone wrong. They are read again whenever the browser says a
 * device came or went, and whenever LiveKit switched one, including on its own when the device in use was unplugged.
 *
 * A switch LiveKit refuses (a camera another app holds, an output the browser will not route to) leaves what was in
 * use, read back from the room, rather than a choice the call is not using.
 */
export function useCallDevices(room: Nullable<Room>): ChatCallDevices {
    const [lists, setLists] = useState<Lists>(NO_LISTS);
    const [active, setActive] = useState<Active>(NO_ACTIVE);
    const [canChooseSpeaker] = useState(() => supportsAudioOutputSelection());

    const read = useCallback(async (current: Room, isStale: () => boolean): Promise<void> => {
        const found = await Promise.all(
            KINDS.map((kind) => Room.getLocalDevices(kind, false).catch((): MediaDeviceInfo[] => [])),
        );

        if (isStale()) return;
        setLists({ audioinput: found[0] ?? [], videoinput: found[1] ?? [], audiooutput: found[2] ?? [] });
        setActive({
            audioinput: current.getActiveDevice('audioinput') ?? null,
            videoinput: current.getActiveDevice('videoinput') ?? null,
            audiooutput: current.getActiveDevice('audiooutput') ?? null,
        });
    }, []);

    useEffect(() => {
        if (room === null) return undefined;

        let isStopped = false;
        const isStale = (): boolean => isStopped;
        const onChange = (): void => {
            void read(room, isStale);
        };

        onChange();
        room.on(RoomEvent.MediaDevicesChanged, onChange)
            .on(RoomEvent.ActiveDeviceChanged, onChange)
            .on(RoomEvent.LocalTrackPublished, onChange);

        return (): void => {
            isStopped = true;
            room.off(RoomEvent.MediaDevicesChanged, onChange)
                .off(RoomEvent.ActiveDeviceChanged, onChange)
                .off(RoomEvent.LocalTrackPublished, onChange);
        };
    }, [room, read]);

    const choose = useCallback(
        (kind: ChatCallDeviceKind, deviceId: string): void => {
            if (room === null) return;

            setActive((previous) => ({ ...previous, [kind]: deviceId }));
            void room.switchActiveDevice(kind, deviceId).catch(() => read(room, () => false));
        },
        [room, read],
    );

    return {
        microphones: callDeviceChoice(lists.audioinput, active.audioinput),
        cameras: callDeviceChoice(lists.videoinput, active.videoinput),
        speakers: canChooseSpeaker ? callDeviceChoice(lists.audiooutput, active.audiooutput) : null,
        choose,
    };
}
