import { color, radius } from '@iveri/tokens';
import { createContext, useContext, useMemo } from 'react';

import type { ChatUploadFile } from '../client/index.js';
import { ChatContext } from '../provider/chat-context.js';

import { applyChatTheme } from './native-theme.js';

/** The colours and radii the native components draw with. The app's palette, or the fleet's by default. */
export interface ChatNativeTheme {
    color: { [Key in keyof typeof color]: string };
    radius: { [Key in keyof typeof radius]: number };
    /** The two kinds of message bubble, which a `ChatProvider` theme can colour apart from the accent. */
    bubble: { own: string; ownLine: string; other: string; otherLine: string };
    /** A `ChatProvider` theme's face, used where the app's `resolveFontFamily` picks none. */
    fontFamily?: string;
}

export const DEFAULT_CHAT_NATIVE_THEME: ChatNativeTheme = {
    color,
    radius,
    bubble: { own: color.accentSoft, ownLine: color.accentLine, other: color.surface, otherLine: color.line },
};

export type ChatTextWeight = '400' | '500' | '600' | '700';

/** A photo or a file the app's picker returned (`expo-image-picker`, `expo-document-picker`). */
export interface ChatPickedFile {
    uri: string;
    name: string;
    /** The MIME type. */
    type: string;
    size: number;
    /**
     * The file itself, on the **web build** only. A browser's `FormData` cannot send `{ uri, name, type }`,
     * which is React Native's shape; Expo's pickers give the `File` there (`asset.file`). Without it the kit
     * reads the picker's `blob:` or `data:` address itself.
     */
    file?: Blob;
}

/** A finished voice note, from the app's recorder (`expo-audio`). */
export interface ChatRecordedVoice {
    uri: string;
    name: string;
    type: string;
    durationMs: number;
    /** Loudness samples taken while recording, for the waveform. Optional: the note sends without one. */
    levels?: number[];
    /** The recording itself, on the web build only, as for `ChatPickedFile.file`. */
    file?: Blob;
}

export interface ChatVoiceRecording {
    stop: () => Promise<ChatRecordedVoice | null>;
    cancel: () => Promise<void>;
}

export interface ChatAudioPlayback {
    stop: () => Promise<void>;
}

/**
 * What the native components need from the device, **supplied by the app**: picking a photo or a file,
 * recording and playing audio, opening an address. The kit depends on no Expo module, so it never forces
 * one on an app; a capability the app leaves out simply removes the control that would use it.
 */
export interface ChatNativeCapabilities {
    pickImage?: () => Promise<ChatPickedFile[] | null>;
    pickFile?: () => Promise<ChatPickedFile[] | null>;
    /** Starts recording and returns the handle that ends it. Throws when the microphone is refused. */
    recordVoice?: () => Promise<ChatVoiceRecording>;
    playAudio?: (url: string, options: { onFinish: () => void }) => Promise<ChatAudioPlayback>;
    openUrl?: (url: string) => void;
    copyText?: (text: string) => void;
}

export interface ChatNativeContextValue {
    theme: ChatNativeTheme;
    capabilities: ChatNativeCapabilities;
    /**
     * The face a run of text is set in. **React Native has no per-glyph fallback**, so an app whose
     * typefaces lack Georgian (Inter) passes its own rule here, the one `AppText` applies, and a Georgian
     * run is set in Noto. Absent, the platform font is used.
     */
    resolveFontFamily?: (text: string, weight: ChatTextWeight) => string | undefined;
}

export const ChatNativeContext = createContext<ChatNativeContextValue>({
    theme: DEFAULT_CHAT_NATIVE_THEME,
    capabilities: {},
});

/**
 * The native look and capabilities, with the `ChatProvider` theme (when there is one) laid over the
 * `ChatNativeProvider` palette, so one brand object reaches the web and the phone alike.
 */
export function useChatNative(): ChatNativeContextValue {
    const native = useContext(ChatNativeContext);
    const chatTheme = useContext(ChatContext)?.theme;

    return useMemo(
        () =>
            chatTheme === undefined || Object.keys(chatTheme).length === 0
                ? native
                : { ...native, theme: applyChatTheme(native.theme, chatTheme) },
        [native, chatTheme],
    );
}

/**
 * What to upload for a picked file or a recording. On a phone, React Native's `FormData` reads
 * `{ uri, name, type }` from disk. In a browser it would send the text `[object Object]`, so there the file
 * must be a `Blob`: the one the app supplied, or the one its address points at.
 */
export async function toUploadFile(
    picked: { uri: string; name: string; type: string; file?: Blob },
    platform: string,
    fetchImpl: typeof fetch = fetch,
): Promise<ChatUploadFile> {
    if (platform !== 'web') return { uri: picked.uri, name: picked.name, type: picked.type };
    if (picked.file !== undefined) return picked.file;

    const blob = await (await fetchImpl(picked.uri)).blob();

    return typeof File === 'function' ? new File([blob], picked.name, { type: picked.type || blob.type }) : blob;
}
