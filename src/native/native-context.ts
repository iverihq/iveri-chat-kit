import { color, radius } from '@iveri/tokens';
import { createContext, useContext } from 'react';

/** The colours and radii the native components draw with. The app's palette, or the fleet's by default. */
export interface ChatNativeTheme {
    color: { [Key in keyof typeof color]: string };
    radius: { [Key in keyof typeof radius]: number };
}

export const DEFAULT_CHAT_NATIVE_THEME: ChatNativeTheme = { color, radius };

export type ChatTextWeight = '400' | '500' | '600' | '700';

/** A photo or a file the app's picker returned (`expo-image-picker`, `expo-document-picker`). */
export interface ChatPickedFile {
    uri: string;
    name: string;
    /** The MIME type. */
    type: string;
    size: number;
}

/** A finished voice note, from the app's recorder (`expo-audio`). */
export interface ChatRecordedVoice {
    uri: string;
    name: string;
    type: string;
    durationMs: number;
    /** Loudness samples taken while recording, for the waveform. Optional: the note sends without one. */
    levels?: number[];
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

export function useChatNative(): ChatNativeContextValue {
    return useContext(ChatNativeContext);
}
