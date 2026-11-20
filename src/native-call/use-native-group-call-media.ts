import type { Maybe, Nullable } from '@iveri/contracts';
import { ChatCallKind, type ChatCallJoin } from '@iveri/contracts/chat';
import { AudioSession } from '@livekit/react-native';
import { Room, RoomEvent, Track, type RemoteParticipant, type VideoTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatCallStageCandidate } from '../util/index.js';

import type { ChatNativeCallMediaFailure } from './use-native-call-media.js';

/** Somebody else in a group call's room, as the phone's grid draws them. */
export interface ChatNativeGroupCallPerson extends ChatCallStageCandidate {
    video: Nullable<VideoTrack>;
    /** Their shared screen, from a browser; a phone never shares one. */
    screen: Nullable<VideoTrack>;
}

export interface ChatNativeGroupCallMedia {
    isConnected: boolean;
    people: ChatNativeGroupCallPerson[];
    myVideo: Maybe<VideoTrack>;
    isMicOn: boolean;
    isCameraOn: boolean;
    failure: Maybe<ChatNativeCallMediaFailure>;
    toggleMic: () => void;
    toggleCamera: () => void;
    switchCamera: () => void;
}

function receivedVideo(participant: RemoteParticipant, source: Track.Source): Nullable<VideoTrack> {
    const publication = participant.getTrackPublication(source);

    return publication?.isSubscribed === true && !publication.isMuted ? (publication.videoTrack ?? null) : null;
}

function personOf(
    participant: RemoteParticipant,
    lastSpokeAt: Map<string, number>,
    sharingSince: Map<string, number>,
): ChatNativeGroupCallPerson {
    const video = receivedVideo(participant, Track.Source.Camera);
    const screen = receivedVideo(participant, Track.Source.ScreenShare);

    return {
        identity: participant.identity,
        hasVideo: video !== null,
        isSpeaking: participant.isSpeaking,
        lastSpokeAt: lastSpokeAt.get(participant.identity) ?? 0,
        sharingSince: screen === null ? 0 : (sharingSince.get(participant.identity) ?? 1),
        video,
        screen,
    };
}

/**
 * The phone's half of a group call: one LiveKit room, the audio session started for it and stopped after, everybody's
 * sound playing by itself, and each person's camera handed back as a track for `VideoView`, with who spoke last for the
 * grid's order. `registerGlobals()` from `@livekit/react-native` must have run once at the app's start.
 */
export function useNativeGroupCallMedia(join: Maybe<ChatCallJoin>, kind: ChatCallKind): ChatNativeGroupCallMedia {
    const room = useRef<Room | null>(null);
    const [isConnected, setConnected] = useState(false);
    const [people, setPeople] = useState<ChatNativeGroupCallPerson[]>([]);
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
        const lastSpokeAt = new Map<string, number>();
        const sharingSince = new Map<string, number>();
        const refresh = (): void => {
            if (isLeft()) return;
            setPeople(
                [...current.remoteParticipants.values()].map((participant) =>
                    personOf(participant, lastSpokeAt, sharingSince),
                ),
            );
        };

        room.current = current;
        current
            .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
                if (track.source === Track.Source.ScreenShare) sharingSince.set(participant.identity, Date.now());
                refresh();
            })
            .on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
                if (track.source === Track.Source.ScreenShare) sharingSince.delete(participant.identity);
                refresh();
            })
            .on(RoomEvent.TrackMuted, refresh)
            .on(RoomEvent.TrackUnmuted, refresh)
            .on(RoomEvent.ParticipantConnected, refresh)
            .on(RoomEvent.ParticipantDisconnected, refresh)
            .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
                const now = Date.now();

                for (const speaker of speakers) lastSpokeAt.set(speaker.identity, now);
                refresh();
            })
            .on(RoomEvent.LocalTrackPublished, (publication) => {
                if (publication.source === Track.Source.Camera) setMyVideo(publication.track as VideoTrack);
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
            refresh();

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
        void room.current?.localParticipant
            .getTrackPublication(Track.Source.Camera)
            ?.videoTrack?.restartTrack({ facingMode: next ? 'user' : 'environment' });
    }, [isFrontCamera]);

    return { isConnected, people, myVideo, isMicOn, isCameraOn, failure, toggleMic, toggleCamera, switchCamera };
}
