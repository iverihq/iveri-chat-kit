import type { Maybe, UUID } from '@iveri/contracts';
import { ChatCallKind, ChatCallStatus, type ChatCall, type ChatCallParticipant } from '@iveri/contracts/chat';
import { VideoView } from '@livekit/react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { FlatList, Image, Modal, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

import { ChatText } from '../native/ChatText.js';
import { useChatNative } from '../native/native-context.js';
import { ChatCallControllerContext, useChatContext, useChatText } from '../provider/index.js';
import { useCall, useCallActions, useCallSession, type ChatActiveCall } from '../query/index.js';
import {
    callCaller,
    callEndLine,
    callOther,
    callPhase,
    callRingLine,
    callTitle,
    arrangeCallStage,
    formatCallClock,
    initialsOf,
    orderCallTiles,
} from '../util/index.js';

import { useNativeCallMedia } from './use-native-call-media.js';
import { useNativeGroupCallMedia, type ChatNativeGroupCallPerson } from './use-native-group-call-media.js';

const END_LINE_MS = 2_500;
const DARK = '#141824';

export interface ChatNativeCallLayerProps {
    children?: ReactNode;
}

/**
 * Calls inside an app on the phone: mount it once inside `ChatProvider` and `ChatNativeProvider`. Like the web's
 * `ChatCallLayer` it does what `useCallSession` says and only draws: who is calling, as a card over the bottom of the
 * screen, and the one call under way, full screen.
 *
 * **This rings only while the app is open.** Ringing a closed phone is the operating system's incoming-call screen
 * (CallKit, ConnectionService), woken by a VoIP or FCM push, which the app wires itself and which needs a real phone.
 */
export function ChatNativeCallLayer({ children }: Readonly<ChatNativeCallLayerProps>): React.JSX.Element {
    const session = useCallSession();
    const { ringing, active } = session;

    return (
        <ChatCallControllerContext.Provider value={session.controller}>
            {children}
            {ringing !== null && (
                <IncomingCard
                    call={ringing}
                    onAnswer={() => {
                        session.answer(ringing);
                    }}
                    onDecline={() => {
                        session.decline(ringing);
                    }}
                />
            )}
            {active !== null && <ActiveCall active={active} onClose={session.close} />}
        </ChatCallControllerContext.Provider>
    );
}

/** The call under way, on the screen its kind needs: two people face to face, or a group's grid. */
function ActiveCall({ active, onClose }: Readonly<{ active: ChatActiveCall; onClose: () => void }>): React.JSX.Element {
    const call = useCall(active.callId).data;

    return call?.isGroup === true ? (
        <GroupCallScreen active={active} onClose={onClose} />
    ) : (
        <CallScreen active={active} onClose={onClose} />
    );
}

function Face({ call, size }: Readonly<{ call: ChatCall; size: number }>): React.JSX.Element {
    return <PersonFace person={call.isGroup ? callCaller(call) : callOther(call)} size={size} />;
}

function PersonFace({
    person,
    size,
}: Readonly<{ person: Maybe<ChatCallParticipant>; size: number }>): React.JSX.Element {
    const { theme } = useChatNative();
    const other = person;
    const image = other?.avatar ?? null;
    const style = { width: size, height: size, borderRadius: size / 2 };

    if (image !== null)
        return <Image source={{ uri: image.thumbnailUrl }} style={style} accessibilityIgnoresInvertColors />;

    return (
        <View style={[style, styles.initials, { backgroundColor: theme.color.accentSoft }]}>
            <ChatText style={{ color: theme.color.accent, fontSize: size / 2.6, fontWeight: '600' }}>
                {initialsOf(other?.displayName ?? '')}
            </ChatText>
        </View>
    );
}

function IncomingCard({
    call,
    onAnswer,
    onDecline,
}: Readonly<{ call: ChatCall; onAnswer: () => void; onDecline: () => void }>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const { theme } = useChatNative();
    const ring = callRingLine(call, translate);
    const line = t(ring.key, ring.values);

    return (
        <Modal transparent animationType="slide" onRequestClose={onDecline}>
            <View style={styles.incomingBackdrop}>
                <View
                    accessibilityRole="alert"
                    accessibilityLabel={line}
                    style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.line }]}
                >
                    <View style={styles.row}>
                        <Face call={call} size={44} />
                        <ChatText style={[styles.cardLine, { color: theme.color.ink }]}>{line}</ChatText>
                    </View>
                    <View style={styles.row}>
                        <Pressable
                            accessibilityRole="button"
                            onPress={onDecline}
                            style={[styles.cardButton, { backgroundColor: theme.color.critical }]}
                        >
                            <ChatText style={styles.cardButtonText}>{t('chat.call.decline')}</ChatText>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            onPress={onAnswer}
                            style={[styles.cardButton, { backgroundColor: theme.color.accent }]}
                        >
                            <ChatText style={styles.cardButtonText}>{t('chat.call.answer')}</ChatText>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function CallScreen({ active, onClose }: Readonly<{ active: ChatActiveCall; onClose: () => void }>): React.JSX.Element {
    const t = useChatText();
    const { theme } = useChatNative();
    const actions = useCallActions();
    const call = useCall(active.callId).data;
    const isOver = call?.status === ChatCallStatus.ENDED;
    const kind = call?.kind ?? ChatCallKind.VOICE;
    const media = useNativeCallMedia(isOver ? null : active.join, kind);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 1_000);

        return (): void => {
            clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (!isOver) return undefined;

        const timer = setTimeout(onClose, END_LINE_MS);

        return (): void => {
            clearTimeout(timer);
        };
    }, [isOver, onClose]);

    const name = call === undefined ? '' : (callOther(call)?.displayName ?? '');
    const phase = call === undefined ? 'connecting' : callPhase(call, media.hasOther);
    const status =
        call === undefined
            ? t('chat.call.connecting')
            : media.failure === 'permission'
              ? t('chat.call.permission', { kind })
              : media.failure === 'connection'
                ? t('chat.call.failed')
                : phase === 'ended'
                  ? t(callEndLine(call).key as Parameters<typeof t>[0], { name })
                  : phase === 'outgoing'
                    ? t('chat.call.calling', { name })
                    : phase === 'live' && call.answeredAt !== null
                      ? formatCallClock(now - new Date(call.answeredAt).getTime())
                      : t('chat.call.connecting');
    // A screen shared from a browser is shown whole, in place of their camera, in any kind of call.
    const showsOtherScreen = media.otherScreen !== null && phase === 'live';
    const showsOtherVideo =
        kind === ChatCallKind.VIDEO && media.otherVideo !== null && phase === 'live' && !showsOtherScreen;
    const showsLarge = showsOtherVideo || showsOtherScreen;

    return (
        <Modal animationType="fade" presentationStyle="fullScreen" onRequestClose={() => undefined}>
            <View style={[styles.screen, { backgroundColor: DARK }]} accessibilityLabel={name}>
                {showsOtherVideo && (
                    <VideoView
                        videoTrack={media.otherVideo ?? undefined}
                        style={StyleSheet.absoluteFill}
                        objectFit="cover"
                    />
                )}
                {showsOtherScreen && (
                    <VideoView
                        videoTrack={media.otherScreen ?? undefined}
                        style={StyleSheet.absoluteFill}
                        objectFit="contain"
                    />
                )}
                {kind === ChatCallKind.VIDEO && media.myVideo !== null && media.isCameraOn && phase !== 'ended' && (
                    <VideoView
                        videoTrack={media.myVideo ?? undefined}
                        style={styles.myVideo}
                        objectFit="cover"
                        mirror
                        zOrder={1}
                    />
                )}
                <SafeAreaView style={styles.fill}>
                    <View style={[styles.middle, showsLarge && styles.top]}>
                        {!showsLarge && call !== undefined && <Face call={call} size={96} />}
                        <ChatText style={styles.name}>{name}</ChatText>
                        <ChatText accessibilityLiveRegion="polite" style={styles.status}>
                            {status}
                        </ChatText>
                        {showsOtherScreen && (
                            <ChatText style={styles.sharing}>{t('chat.call.sharing', { name })}</ChatText>
                        )}
                    </View>
                    {phase !== 'ended' && (
                        <View style={styles.controls}>
                            <Control
                                label={t(media.isMicOn ? 'chat.call.mute' : 'chat.call.unmute')}
                                glyph={media.isMicOn ? 'mic' : 'mic-off'}
                                isPressed={!media.isMicOn}
                                onPress={media.toggleMic}
                            />
                            {kind === ChatCallKind.VIDEO && (
                                <>
                                    <Control
                                        label={t(media.isCameraOn ? 'chat.call.camera-off' : 'chat.call.camera-on')}
                                        glyph={media.isCameraOn ? 'camera' : 'camera-off'}
                                        isPressed={!media.isCameraOn}
                                        onPress={media.toggleCamera}
                                    />
                                    <Control
                                        label={t('chat.call.switch-camera')}
                                        glyph="switch"
                                        onPress={media.switchCamera}
                                    />
                                </>
                            )}
                            <Control
                                label={t('chat.call.hang-up')}
                                glyph="hang-up"
                                color={theme.color.critical}
                                onPress={() => {
                                    void actions.end(active.callId).catch(() => undefined);
                                }}
                            />
                        </View>
                    )}
                </SafeAreaView>
            </View>
        </Modal>
    );
}

/** Columns for the phone's grid: one tile fills the screen, up to four sit two by two, more three across. */
function columnsFor(tiles: number): number {
    if (tiles <= 1) return 1;

    return tiles <= 4 ? 2 : 3;
}

function GroupTile({
    person,
    participant,
    columns,
}: Readonly<{
    person: ChatNativeGroupCallPerson;
    participant: Maybe<ChatCallParticipant>;
    columns: number;
}>): React.JSX.Element {
    const { theme } = useChatNative();

    return (
        <View
            style={[
                styles.tile,
                { flexBasis: `${100 / columns}%` },
                person.isSpeaking && { borderColor: theme.color.accent, borderWidth: 2 },
            ]}
        >
            {person.video === null ? (
                <PersonFace person={participant} size={56} />
            ) : (
                <VideoView videoTrack={person.video} style={StyleSheet.absoluteFill} objectFit="cover" />
            )}
            <ChatText numberOfLines={1} style={styles.tileName}>
                {participant?.displayName ?? ''}
            </ChatText>
        </View>
    );
}

/**
 * A group call on the phone: the group's name and the clock, a grid of up to eight people (video first, then whoever
 * spoke last, the speaker outlined), how many more are in it, my camera small, and mute, camera, switch and leave.
 * Leaving leaves the call to the others and closes the screen.
 */
function GroupCallScreen({
    active,
    onClose,
}: Readonly<{ active: ChatActiveCall; onClose: () => void }>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const { theme } = useChatNative();
    const actions = useCallActions();
    const call = useCall(active.callId).data;
    const [hasLeft, setLeft] = useState(false);
    const isOver = call?.status === ChatCallStatus.ENDED;
    const kind = call?.kind ?? ChatCallKind.VOICE;
    const media = useNativeGroupCallMedia(isOver || hasLeft ? null : active.join, kind);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 1_000);

        return (): void => {
            clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (hasLeft) {
            onClose();

            return undefined;
        }
        if (!isOver) return undefined;

        const timer = setTimeout(onClose, END_LINE_MS);

        return (): void => {
            clearTimeout(timer);
        };
    }, [isOver, hasLeft, onClose]);

    const title = call === undefined ? '' : callTitle(call, translate);
    const phase = call === undefined ? 'connecting' : callPhase(call, media.isConnected);
    const byUser = new Map((call?.participants ?? []).map((participant) => [participant.userId, participant]));
    // A screen shared from a browser goes above the grid, which then keeps one video fewer, so eight still holds.
    const arranged = arrangeCallStage(media.people);
    const sharer = arranged.stage?.kind === 'screen' ? arranged.stage.person : null;
    const { tiles, more } = sharer === null ? orderCallTiles(media.people) : arranged;
    const sharedScreen = sharer?.screen ?? null;
    const sharerName = sharer === null ? '' : (byUser.get(sharer.identity as UUID)?.displayName ?? '');
    const columns = columnsFor(tiles.length);
    const status =
        call === undefined
            ? t('chat.call.connecting')
            : media.failure === 'permission'
              ? t('chat.call.permission', { kind })
              : media.failure === 'connection'
                ? t('chat.call.failed')
                : phase === 'ended'
                  ? t(callEndLine(call).key as Parameters<typeof t>[0], { name: title })
                  : phase === 'connecting'
                    ? t('chat.call.connecting')
                    : media.people.length > 0 && call.answeredAt !== null
                      ? formatCallClock(now - new Date(call.answeredAt).getTime())
                      : t('chat.call.waiting');

    return (
        <Modal animationType="fade" presentationStyle="fullScreen" onRequestClose={() => undefined}>
            <View style={[styles.screen, { backgroundColor: DARK }]} accessibilityLabel={title}>
                <SafeAreaView style={styles.fill}>
                    <View style={styles.groupHeader}>
                        <ChatText style={styles.name}>{title}</ChatText>
                        <ChatText accessibilityLiveRegion="polite" style={styles.status}>
                            {status}
                        </ChatText>
                    </View>
                    {phase !== 'ended' && sharedScreen !== null && (
                        <View style={styles.sharedScreen}>
                            <VideoView videoTrack={sharedScreen} style={StyleSheet.absoluteFill} objectFit="contain" />
                            <ChatText numberOfLines={2} style={styles.tileName}>
                                {t('chat.call.sharing', { name: sharerName })}
                            </ChatText>
                        </View>
                    )}
                    {phase !== 'ended' && (
                        <FlatList
                            key={columns}
                            data={tiles}
                            numColumns={columns}
                            keyExtractor={(person) => person.identity}
                            contentContainerStyle={styles.grid}
                            renderItem={({ item }) => (
                                <GroupTile
                                    person={item}
                                    participant={byUser.get(item.identity as UUID) ?? null}
                                    columns={columns}
                                />
                            )}
                            ListFooterComponent={
                                more > 0 ? (
                                    <ChatText style={styles.status}>{t('chat.call.more', { count: more })}</ChatText>
                                ) : undefined
                            }
                        />
                    )}
                    {kind === ChatCallKind.VIDEO && media.myVideo !== null && media.isCameraOn && phase !== 'ended' && (
                        <VideoView
                            videoTrack={media.myVideo ?? undefined}
                            style={styles.myGroupVideo}
                            objectFit="cover"
                            mirror
                            zOrder={1}
                        />
                    )}
                    {phase !== 'ended' && (
                        <View style={styles.controls}>
                            <Control
                                label={t(media.isMicOn ? 'chat.call.mute' : 'chat.call.unmute')}
                                glyph={media.isMicOn ? 'mic' : 'mic-off'}
                                isPressed={!media.isMicOn}
                                onPress={media.toggleMic}
                            />
                            {kind === ChatCallKind.VIDEO && (
                                <>
                                    <Control
                                        label={t(media.isCameraOn ? 'chat.call.camera-off' : 'chat.call.camera-on')}
                                        glyph={media.isCameraOn ? 'camera' : 'camera-off'}
                                        isPressed={!media.isCameraOn}
                                        onPress={media.toggleCamera}
                                    />
                                    <Control
                                        label={t('chat.call.switch-camera')}
                                        glyph="switch"
                                        onPress={media.switchCamera}
                                    />
                                </>
                            )}
                            <Control
                                label={t('chat.call.leave')}
                                glyph="hang-up"
                                color={theme.color.critical}
                                onPress={() => {
                                    setLeft(true);
                                    void actions.end(active.callId).catch(() => undefined);
                                }}
                            />
                        </View>
                    )}
                </SafeAreaView>
            </View>
        </Modal>
    );
}

/** The marks on a round control: plain characters every phone has, so the kit carries no icon library. */
const GLYPHS = {
    mic: '●',
    'mic-off': '○',
    camera: '▣',
    'camera-off': '□',
    switch: '↻',
    'hang-up': '✕',
} as const;

function Control({
    label,
    glyph,
    onPress,
    isPressed,
    color,
}: Readonly<{
    label: string;
    glyph: keyof typeof GLYPHS;
    onPress: () => void;
    isPressed?: boolean;
    color?: string;
}>): React.JSX.Element {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={isPressed === undefined ? undefined : { selected: isPressed }}
            onPress={onPress}
            style={[styles.control, { backgroundColor: color ?? 'rgba(255,255,255,0.16)' }]}
        >
            <ChatText style={styles.glyph}>{GLYPHS[glyph]}</ChatText>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    screen: { flex: 1 },
    middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
    top: { justifyContent: 'flex-start', paddingTop: 48 },
    name: { color: '#ffffff', fontSize: 24, fontWeight: '600', textAlign: 'center' },
    status: { color: 'rgba(255,255,255,0.8)', fontSize: 16, textAlign: 'center', fontVariant: ['tabular-nums'] },
    controls: { flexDirection: 'row', justifyContent: 'center', gap: 18, paddingBottom: 32 },
    control: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
    glyph: { color: '#ffffff', fontSize: 22 },
    myVideo: {
        position: 'absolute',
        top: 56,
        right: 16,
        width: 110,
        height: 150,
        borderRadius: 14,
        overflow: 'hidden',
    },
    initials: { alignItems: 'center', justifyContent: 'center' },
    sharing: {
        color: '#ffffff',
        fontSize: 14,
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        overflow: 'hidden',
    },
    sharedScreen: {
        aspectRatio: 16 / 9,
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#000000',
    },
    groupHeader: { alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12 },
    grid: { paddingHorizontal: 8, gap: 8 },
    tile: {
        aspectRatio: 3 / 4,
        margin: 4,
        borderRadius: 14,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        flexGrow: 0,
        flexShrink: 1,
    },
    tileName: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        right: 6,
        color: '#ffffff',
        fontSize: 13,
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        overflow: 'hidden',
    },
    myGroupVideo: {
        position: 'absolute',
        bottom: 120,
        right: 16,
        width: 96,
        height: 128,
        borderRadius: 14,
        overflow: 'hidden',
    },
    incomingBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 12 },
    card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardLine: { flex: 1, fontSize: 16, fontWeight: '600' },
    cardButton: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
