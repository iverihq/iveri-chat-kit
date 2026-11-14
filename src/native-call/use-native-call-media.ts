import type { Maybe } from '@iveri/contracts';
import { ChatCallKind, type ChatCallJoin } from '@iveri/contracts/chat';
import { AudioSession } from '@livekit/react-native';
import { Room, RoomEvent, Track, type VideoTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ChatNativeCallMediaFailure = 'permission' | 'connection';

export interface ChatNativeCallMedia {
    isConnected: boolean;
    hasOther: boolean;
    otherVideo: Maybe<VideoTrack>;
    myVideo: Maybe<VideoTrack>;
    isMicOn: boolean;
    isCameraOn: boolean;
    failure: Maybe<ChatNativeCallMediaFailure>;
    toggleMic: () => void;
    toggleCamera: () => void;
    switchCamera: () => void;
}

/**
 * The phone's half of a call's media: one LiveKit room joined with the token `chat-api` signed, the phone's audio
 * session started for it and stopped after, the microphone on and, in a video call, the camera. The other person's
 * sound plays by itself; video is handed back as tracks for `VideoView` to draw.
 *
 * `registerGlobals()` from `@livekit/react-native` must have run once at the app's start, before this.
 */
export function useNativeCallMedia(join: Maybe<ChatCallJoin>, kind: ChatCallKind): ChatNativeCallMedia {
    const room = useRef<Room | null>(null);
    const [isConnected, setConnected] = useState(false);
    const [hasOther, setHasOther] = useState(false);
    const [otherVideo, setOtherVideo] = useState<Maybe<VideoTrack>>(null);
    const [myVideo, setMyVideo] = useState<Maybe<VideoTrack>>(null);
    const [isMicOn, setMicOn] = useState(true);
    const [isCameraOn, setCameraOn] = useState(kind === ChatCallKind.VIDEO);
    const [isFrontCamera, setFrontCamera] = useState(true);
    const [failure, setFailure] = useState<Maybe<ChatNativeCallMediaFailure>>(null);
    const url = join?.url ?? null;
    const token = join?.token ?? null;

    useEffect(() => {
        if (url === null || token === null) return undefined;

        const current = new Room({ adaptiveStream: true, dynacast: true });
        const left = new AbortController();
        const isLeft = (): boolean => left.signal.aborted;

        room.current = current;
        current
            .on(RoomEvent.TrackSubscribed, (track) => {
                if (track.kind === Track.Kind.Video) setOtherVideo(track as VideoTrack);
            })
            .on(RoomEvent.TrackUnsubscribed, (track) => {
                if (track.kind === Track.Kind.Video) setOtherVideo(null);
            })
            .on(RoomEvent.ParticipantConnected, () => {
                setHasOther(true);
            })
            .on(RoomEvent.ParticipantDisconnected, () => {
                setHasOther(current.remoteParticipants.size > 0);
            })
            .on(RoomEvent.LocalTrackPublished, (publication) => {
                if (publication.track?.kind === Track.Kind.Video) setMyVideo(publication.track as VideoTrack);
            })
            .on(RoomEvent.LocalTrackUnpublished, (publication) => {
                if (publication.track?.kind === Track.Kind.Video) setMyVideo(null);
            });

        void (async (): Promise<void> => {
            try {
                await AudioSession.startAudioSession();
                await current.connect(url, token);
            } catch {
                if (!isLeft()) setFailure('connection');

                return;
            }

            if (isLeft()) return;

            setConnected(true);
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
            void current.disconnect().finally(() => {
                void AudioSession.stopAudioSession();
            });
        };
    }, [url, token, kind]);

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

    const switchCamera = useCallback((): void => {
        const next = !isFrontCamera;

        setFrontCamera(next);
        // Restarting the camera's track with the other facing keeps the same publication, so the other person sees no gap.
        void room.current?.localParticipant
            .getTrackPublication(Track.Source.Camera)
            ?.videoTrack?.restartTrack({ facingMode: next ? 'user' : 'environment' });
    }, [isFrontCamera]);

    return {
        isConnected,
        hasOther,
        otherVideo,
        myVideo,
        isMicOn,
        isCameraOn,
        failure,
        toggleMic,
        toggleCamera,
        switchCamera,
    };
}
