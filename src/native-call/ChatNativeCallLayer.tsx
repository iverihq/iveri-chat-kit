import { ChatCallKind, ChatCallStatus, type ChatCall } from '@iveri/contracts/chat';
import { VideoView } from '@livekit/react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

import { ChatText } from '../native/ChatText.js';
import { useChatNative } from '../native/native-context.js';
import { ChatCallControllerContext, useChatText } from '../provider/index.js';
import { useCall, useCallActions, useCallSession, type ChatActiveCall } from '../query/index.js';
import { callEndLine, callOther, callPhase, formatCallClock, initialsOf } from '../util/index.js';

import { useNativeCallMedia } from './use-native-call-media.js';

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
            {active !== null && <CallScreen active={active} onClose={session.close} />}
        </ChatCallControllerContext.Provider>
    );
}

function Face({ call, size }: Readonly<{ call: ChatCall; size: number }>): React.JSX.Element {
    const { theme } = useChatNative();
    const other = callOther(call);
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
    const { theme } = useChatNative();
    const line = t('chat.call.incoming', { kind: call.kind, name: callOther(call)?.displayName ?? '' });

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
    const showsOtherVideo = kind === ChatCallKind.VIDEO && media.otherVideo !== null && phase === 'live';

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
                    <View style={[styles.middle, showsOtherVideo && styles.top]}>
                        {!showsOtherVideo && call !== undefined && <Face call={call} size={96} />}
                        <ChatText style={styles.name}>{name}</ChatText>
                        <ChatText accessibilityLiveRegion="polite" style={styles.status}>
                            {status}
                        </ChatText>
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
    incomingBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 12 },
    card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardLine: { flex: 1, fontSize: 16, fontWeight: '600' },
    cardButton: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
