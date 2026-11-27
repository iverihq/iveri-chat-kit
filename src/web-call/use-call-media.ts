import type { Maybe } from '@iveri/contracts';
import { ChatCallKind, type ChatCallJoin } from '@iveri/contracts/chat';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { canShareScreen, isScreenShare, toggleScreenShare } from './screen-share.js';
import { useCallDevices, type ChatCallDevices } from './use-call-devices.js';

/** What went wrong with the media, as the screen words it: no microphone or camera allowed, or no connection. */
export type ChatCallMediaFailure = 'permission' | 'connection';

export interface ChatCallMedia {
    /** My own connection reached the call server. */
    isConnected: boolean;
    /** The other person is in the room too: the call is live. */
    hasOther: boolean;
    hasOtherVideo: boolean;
    /** The other person is sharing their screen, which plays in `remoteScreen`. */
    hasOtherScreen: boolean;
    isMicOn: boolean;
    isCameraOn: boolean;
    failure: Maybe<ChatCallMediaFailure>;
    /** This browser can share a screen; false on a phone, where the control is not drawn. */
    canShareScreen: boolean;
    /** I am sharing my screen. */
    isSharingScreen: boolean;
    toggleMic: () => void;
    toggleCamera: () => void;
    toggleScreenShare: () => void;
    /** The microphones, cameras and speakers to switch between, once connected. */
    devices: ChatCallDevices;
}

/** The elements a call draws into, owned by the screen and filled here. */
export interface ChatCallMediaElements {
    remoteVideo: RefObject<HTMLVideoElement | null>;
    remoteAudio: RefObject<HTMLAudioElement | null>;
    localVideo: RefObject<HTMLVideoElement | null>;
    /** Where the other person's shared screen plays; without it a shared screen is not drawn. */
    remoteScreen?: RefObject<HTMLVideoElement | null>;
}

/**
 * One LiveKit room, joined with the token `chat-api` signed for this person and this call, for as long as `join` is
 * given; set it to null and the room is left. The microphone is on from the start and, in a video call, the camera.
 *
 * **Nothing here decides how a call ends**: leaving the room only leaves it. `chat-api` hears it from LiveKit and
 * ends the call, and the screen reads that from the call itself.
 */
export function useCallMedia(
    join: Maybe<ChatCallJoin>,
    kind: ChatCallKind,
    elements: ChatCallMediaElements,
): ChatCallMedia {
    const { remoteVideo, remoteAudio, localVideo, remoteScreen } = elements;
    const room = useRef<Room | null>(null);
    const [isConnected, setConnected] = useState(false);
    const [hasOther, setHasOther] = useState(false);
    const [hasOtherVideo, setHasOtherVideo] = useState(false);
    const [hasOtherScreen, setHasOtherScreen] = useState(false);
    const [isSharingScreen, setSharingScreen] = useState(false);
    const [canShare] = useState(canShareScreen);
    const [isMicOn, setMicOn] = useState(true);
    const [isCameraOn, setCameraOn] = useState(kind === ChatCallKind.VIDEO);
    const [failure, setFailure] = useState<Maybe<ChatCallMediaFailure>>(null);
    // The room once connected, for the devices; the ref above is what the controls act on.
    const [liveRoom, setLiveRoom] = useState<Room | null>(null);
    const devices = useCallDevices(liveRoom);
    const url = join?.url ?? null;
    const token = join?.token ?? null;

    useEffect(() => {
        if (url === null || token === null) return undefined;

        const current = new Room({ adaptiveStream: true, dynacast: true });
        // Set when this room is left, which the async connect below checks after every wait.
        const left = new AbortController();
        const isLeft = (): boolean => left.signal.aborted;

        room.current = current;

        // A shared screen is a second video beside the camera, told apart by its source.
        const attach = (track: RemoteTrack): void => {
            if (track.kind === Track.Kind.Video && isScreenShare(track)) {
                if (remoteScreen === undefined || remoteScreen.current === null) return;
                track.attach(remoteScreen.current);
                setHasOtherScreen(true);
            } else if (track.kind === Track.Kind.Video && remoteVideo.current !== null) {
                track.attach(remoteVideo.current);
                setHasOtherVideo(true);
            }
            if (track.kind === Track.Kind.Audio && remoteAudio.current !== null) track.attach(remoteAudio.current);
        };

        current
            .on(RoomEvent.TrackSubscribed, attach)
            .on(RoomEvent.TrackUnsubscribed, (track) => {
                track.detach();
                if (track.kind !== Track.Kind.Video) return;
                if (isScreenShare(track)) setHasOtherScreen(false);
                else setHasOtherVideo(false);
            })
            .on(RoomEvent.ParticipantConnected, () => {
                setHasOther(true);
            })
            .on(RoomEvent.ParticipantDisconnected, () => {
                setHasOther(current.remoteParticipants.size > 0);
            })
            .on(RoomEvent.LocalTrackPublished, (publication) => {
                if (isScreenShare(publication)) {
                    setSharingScreen(true);
                } else if (publication.track?.kind === Track.Kind.Video && localVideo.current !== null) {
                    publication.track.attach(localVideo.current);
                }
            })
            .on(RoomEvent.LocalTrackUnpublished, (publication) => {
                if (isScreenShare(publication)) setSharingScreen(false);
            });

        void (async (): Promise<void> => {
            try {
                await current.connect(url, token);
            } catch {
                if (!isLeft()) setFailure('connection');

                return;
            }

            if (isLeft()) return;

            setConnected(true);
            setLiveRoom(current);
            setHasOther(current.remoteParticipants.size > 0);

            try {
                await current.localParticipant.setMicrophoneEnabled(true);
                if (kind === ChatCallKind.VIDEO) await current.localParticipant.setCameraEnabled(true);
            } catch {
                if (!isLeft()) setFailure('permission');
            }
        })();

        return (): void => {
            left.abort();
            room.current = null;
            setLiveRoom(null);
            setSharingScreen(false);
            setHasOtherScreen(false);
            void current.disconnect();
        };
    }, [url, token, kind, remoteVideo, remoteAudio, localVideo, remoteScreen]);

    const toggleMic = useCallback((): void => {
        const next = !isMicOn;

        setMicOn(next);
        void room.current?.localParticipant.setMicrophoneEnabled(next);
    }, [isMicOn]);

    const toggleCamera = useCallback((): void => {
        const next = !isCameraOn;

        setCameraOn(next);
        void room.current?.localParticipant.setCameraEnabled(next);
    }, [isCameraOn]);

    const toggleShare = useCallback((): void => {
        toggleScreenShare(room.current?.localParticipant);
    }, []);

    return {
        isConnected,
        hasOther,
        hasOtherVideo,
        hasOtherScreen,
        isMicOn,
        isCameraOn,
        failure,
        canShareScreen: canShare,
        isSharingScreen,
        toggleMic,
        toggleCamera,
        toggleScreenShare: toggleShare,
        devices,
    };
}
