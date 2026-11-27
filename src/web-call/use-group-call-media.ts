import type { Maybe, Nullable } from '@iveri/contracts';
import { ChatCallKind, type ChatCallJoin } from '@iveri/contracts/chat';
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack, type VideoTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { ChatCallStageCandidate } from '../util/index.js';

import { canShareScreen, isScreenShare, toggleScreenShare } from './screen-share.js';
import { useCallDevices, type ChatCallDevices } from './use-call-devices.js';
import type { ChatCallMediaFailure } from './use-call-media.js';

/** Somebody else in a group call's room, as its screen draws them. */
export interface ChatGroupCallPerson extends ChatCallStageCandidate {
    /** Their camera, while it is on and received. */
    video: Nullable<VideoTrack>;
    /** Their shared screen, while they share one and it is received. */
    screen: Nullable<VideoTrack>;
}

export interface ChatGroupCallMedia {
    /** My own connection reached the call server: the call is live for me. */
    isConnected: boolean;
    /** Everybody else in the room, in the order they arrived. */
    people: ChatGroupCallPerson[];
    isMicOn: boolean;
    isCameraOn: boolean;
    isSpeaking: boolean;
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

/** The elements a group call draws into, owned by the screen and filled here. */
export interface ChatGroupCallMediaElements {
    localVideo: RefObject<HTMLVideoElement | null>;
    /** Where each person's sound is played: one `<audio>` each, added and removed here. */
    audio: RefObject<HTMLElement | null>;
}

function receivedVideo(participant: RemoteParticipant, source: Track.Source): Nullable<VideoTrack> {
    const publication = participant.getTrackPublication(source);

    return publication?.isSubscribed === true && !publication.isMuted ? (publication.videoTrack ?? null) : null;
}

function personOf(
    participant: RemoteParticipant,
    lastSpokeAt: Map<string, number>,
    sharingSince: Map<string, number>,
): ChatGroupCallPerson {
    const video = receivedVideo(participant, Track.Source.Camera);
    // Only a screen whose arrival was seen counts: LiveKit announces an unsubscribed track while its publication still
    // holds it, so the publication alone would keep a stopped screen on the stage.
    const since = sharingSince.get(participant.identity);
    const screen = since === undefined ? null : receivedVideo(participant, Track.Source.ScreenShare);

    return {
        identity: participant.identity,
        hasVideo: video !== null,
        isSpeaking: participant.isSpeaking,
        lastSpokeAt: lastSpokeAt.get(participant.identity) ?? 0,
        sharingSince: screen === null ? 0 : (since ?? 0),
        video,
        screen,
    };
}

/**
 * One LiveKit room for a group call, joined with the token `chat-api` signed, for as long as `join` is given. Like
 * `useCallMedia` it decides nothing about how the call ends; it reports who is in the room, who has a camera on, who
 * spoke last and who is sharing a screen since when (for the screen's stage and tiles), plays everybody's sound, and
 * switches my microphone, camera and screen sharing.
 *
 * The room is subscribed adaptively (`adaptiveStream`), so a tile LiveKit sees is small or hidden is sent small or not
 * at all: what keeps a group call on a phone affordable.
 */
export function useGroupCallMedia(
    join: Maybe<ChatCallJoin>,
    kind: ChatCallKind,
    elements: ChatGroupCallMediaElements,
): ChatGroupCallMedia {
    const { localVideo, audio } = elements;
    const room = useRef<Room | null>(null);
    const [isConnected, setConnected] = useState(false);
    const [people, setPeople] = useState<ChatGroupCallPerson[]>([]);
    const [isSpeaking, setSpeaking] = useState(false);
    const [isMicOn, setMicOn] = useState(true);
    const [isCameraOn, setCameraOn] = useState(kind === ChatCallKind.VIDEO);
    const [failure, setFailure] = useState<Maybe<ChatCallMediaFailure>>(null);
    // The room once connected, for the devices; the ref above is what the controls act on.
    const [liveRoom, setLiveRoom] = useState<Room | null>(null);
    const devices = useCallDevices(liveRoom);
    const [isSharingScreen, setSharingScreen] = useState(false);
    const [canShare] = useState(canShareScreen);
    const url = join?.url ?? null;
    const token = join?.token ?? null;

    useEffect(() => {
        if (url === null || token === null) return undefined;

        const current = new Room({ adaptiveStream: true, dynacast: true });
        const left = new AbortController();
        const isLeft = (): boolean => left.signal.aborted;
        const lastSpokeAt = new Map<string, number>();
        // When each shared screen first arrived, so the one shared last takes the stage.
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

        const attachAudio = (track: RemoteTrack): void => {
            if (track.kind !== Track.Kind.Audio || audio.current === null) return;

            audio.current.append(track.attach());
        };

        current
            .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
                if (isScreenShare(track)) sharingSince.set(participant.identity, Date.now());
                attachAudio(track);
                refresh();
            })
            .on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
                if (isScreenShare(track)) sharingSince.delete(participant.identity);
                for (const element of track.detach()) element.remove();
                refresh();
            })
            .on(RoomEvent.TrackUnpublished, refresh)
            .on(RoomEvent.TrackMuted, refresh)
            .on(RoomEvent.TrackUnmuted, refresh)
            .on(RoomEvent.ParticipantConnected, refresh)
            .on(RoomEvent.ParticipantDisconnected, refresh)
            .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
                const now = Date.now();

                for (const speaker of speakers) lastSpokeAt.set(speaker.identity, now);
                setSpeaking(speakers.some((speaker) => speaker.identity === current.localParticipant.identity));
                refresh();
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
            setLiveRoom(null);
            setSharingScreen(false);
            void current.disconnect();
        };
    }, [url, token, kind, localVideo, audio]);

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
        people,
        isMicOn,
        isCameraOn,
        isSpeaking,
        failure,
        canShareScreen: canShare,
        isSharingScreen,
        toggleMic,
        toggleCamera,
        toggleScreenShare: toggleShare,
        devices,
    };
}
