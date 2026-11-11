/** The most levels a voice note carries on the wire (`ChatAttachment.waveform`). */
export const WAVEFORM_MAX_LEVELS = 64;

/** The quietest bar drawn, so a silent stretch still reads as part of the note rather than a gap. */
const MINIMUM_LEVEL = 4;

/**
 * Reduces (or stretches) a run of levels to exactly `bars` values.
 *
 * Each bar takes the **peak** of the samples under it rather than their mean: averaging flattens a
 * spoken word into the silence around it, and a waveform whose bars are all one height says nothing
 * about where the speech is. Stretching a short stored waveform to a wider drawing repeats samples,
 * which is the honest reading of having fewer measurements than bars.
 */
export function downsampleWaveform(levels: readonly number[], bars: number): number[] {
    const count = Math.max(0, Math.floor(bars));
    if (count === 0 || levels.length === 0) return Array.from({ length: count }, () => 0);

    return Array.from({ length: count }, (_, bar) => {
        const start = Math.floor((bar * levels.length) / count);
        const end = Math.max(start + 1, Math.floor(((bar + 1) * levels.length) / count));
        let peak = 0;
        for (let index = start; index < end && index < levels.length; index += 1) {
            peak = Math.max(peak, levels[index] ?? 0);
        }

        return peak;
    });
}

/**
 * Scales measured levels to whole numbers between `MINIMUM_LEVEL` and 100, loudest at 100.
 *
 * Relative to the note's own peak, so a quiet speaker's note is as readable as a loud one: the shape
 * of the speech is the information, not the microphone's gain.
 */
export function normaliseWaveform(levels: readonly number[]): number[] {
    const peak = Math.max(0, ...levels.filter((level) => Number.isFinite(level)));
    if (peak === 0) return levels.map(() => MINIMUM_LEVEL);

    return levels.map((level) => Math.max(MINIMUM_LEVEL, Math.min(100, Math.round((Math.max(0, level) / peak) * 100))));
}

/** What a recording client sends as the `waveform` field of `POST /attachments`: up to 64 levels, as JSON. */
export function encodeWaveformField(levels: readonly number[]): string {
    return JSON.stringify(normaliseWaveform(downsampleWaveform(levels, Math.min(WAVEFORM_MAX_LEVELS, levels.length))));
}
