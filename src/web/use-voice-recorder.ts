import { CHAT_VOICE_MAX_SECONDS } from '@iveri/contracts/chat';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Opus in WebM first, which every Chromium and Firefox records; Safari falls through to MP4/AAC. */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;
const LEVEL_SAMPLE_MS = 60;

export type VoiceRecorderStatus = 'idle' | 'recording' | 'denied' | 'unsupported';

export interface RecordedVoice {
    blob: Blob;
    fileName: string;
    durationMs: number;
    /** Loudness measured while recording, one value per sample, for the note's waveform. */
    levels: number[];
}

export interface VoiceRecorder {
    status: VoiceRecorderStatus;
    elapsedMs: number;
    start: () => Promise<void>;
    /** Stops and returns the note; `null` if nothing was recorded. */
    stop: () => Promise<RecordedVoice | null>;
    cancel: () => void;
}

function chooseMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined;

    return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(mimeType: string): string {
    if (mimeType.includes('mp4')) return 'm4a';
    if (mimeType.includes('ogg')) return 'ogg';

    return 'webm';
}

/**
 * Records a voice note in the browser with `MediaRecorder`, measuring its loudness as it goes so the
 * note arrives with a waveform the client computed (the server only checks the length it can read).
 *
 * Stops by itself at `CHAT_VOICE_MAX_SECONDS`. The microphone is released the moment recording ends,
 * whichever way it ends, so the browser's recording indicator never outlives the note.
 */
export function useVoiceRecorder(): VoiceRecorder {
    const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
    const [elapsedMs, setElapsedMs] = useState(0);
    const session = useRef<{
        recorder: MediaRecorder;
        stream: MediaStream;
        chunks: Blob[];
        levels: number[];
        startedAt: number;
        timer: ReturnType<typeof setInterval>;
        context: AudioContext | null;
    } | null>(null);
    const stopRef = useRef<() => Promise<RecordedVoice | null>>(() => Promise.resolve(null));

    const release = useCallback((): void => {
        const current = session.current;
        if (current === null) return;
        clearInterval(current.timer);
        for (const track of current.stream.getTracks()) track.stop();
        void current.context?.close().catch(() => undefined);
        session.current = null;
        setElapsedMs(0);
    }, []);

    const start = useCallback(async (): Promise<void> => {
        if (session.current !== null) return;
        if (
            typeof navigator === 'undefined' ||
            typeof MediaRecorder === 'undefined' ||
            !('mediaDevices' in navigator)
        ) {
            setStatus('unsupported');

            return;
        }

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            setStatus('denied');

            return;
        }

        const mimeType = chooseMimeType();
        const recorder = new MediaRecorder(stream, mimeType === undefined ? undefined : { mimeType });
        const chunks: Blob[] = [];
        const levels: number[] = [];
        recorder.ondataavailable = (event: BlobEvent): void => {
            if (event.data.size > 0) chunks.push(event.data);
        };

        let context: AudioContext | null = null;
        let analyser: AnalyserNode | null = null;
        if (typeof AudioContext !== 'undefined') {
            context = new AudioContext();
            analyser = context.createAnalyser();
            analyser.fftSize = 512;
            context.createMediaStreamSource(stream).connect(analyser);
        }
        const samples = new Uint8Array(analyser?.fftSize ?? 0);
        const startedAt = Date.now();

        const timer = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            setElapsedMs(elapsed);
            if (analyser !== null) {
                analyser.getByteTimeDomainData(samples);
                let sum = 0;
                for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
                levels.push(Math.sqrt(sum / samples.length));
            }
            if (elapsed >= CHAT_VOICE_MAX_SECONDS * 1000) void stopRef.current();
        }, LEVEL_SAMPLE_MS);

        session.current = { recorder, stream, chunks, levels, startedAt, timer, context };
        recorder.start(250);
        setStatus('recording');
    }, []);

    const stop = useCallback(async (): Promise<RecordedVoice | null> => {
        const current = session.current;
        if (current === null) return null;

        const stopped = new Promise<void>((resolve) => {
            current.recorder.onstop = (): void => {
                resolve();
            };
        });
        if (current.recorder.state !== 'inactive') current.recorder.stop();
        await stopped;

        const durationMs = Math.min(Date.now() - current.startedAt, CHAT_VOICE_MAX_SECONDS * 1000);
        const mimeType = current.recorder.mimeType.length > 0 ? current.recorder.mimeType : 'audio/webm';
        const blob = new Blob(current.chunks, { type: mimeType });
        const levels = [...current.levels];
        release();
        setStatus('idle');

        return blob.size === 0 ? null : { blob, fileName: `voice-note.${extensionFor(mimeType)}`, durationMs, levels };
    }, [release]);

    useEffect(() => {
        stopRef.current = stop;
    }, [stop]);

    const cancel = useCallback((): void => {
        const current = session.current;
        if (current !== null && current.recorder.state !== 'inactive') {
            current.recorder.onstop = null;
            current.recorder.stop();
        }
        release();
        setStatus('idle');
    }, [release]);

    useEffect(() => release, [release]);

    return { status, elapsedMs, start, stop, cancel };
}
