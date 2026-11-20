import { Track, type LocalParticipant, type TrackPublication } from 'livekit-client';

/**
 * Whether this browser can share a screen at all. A phone's browser has no `getDisplayMedia`, and the calls plan keeps
 * screen sharing to the web, so the control is not drawn there rather than drawn and refused.
 */
export function canShareScreen(): boolean {
    if (typeof navigator === 'undefined' || !('mediaDevices' in navigator)) return false;

    return 'getDisplayMedia' in navigator.mediaDevices;
}

/**
 * Starts sharing my screen, or stops it. The browser asks which screen or window; closing that question without picking
 * one rejects, which is not a failure worth a word, so it is swallowed and nothing is shared. The screen's sound is not
 * sent: it would be a second sound to place beside the person's voice, and a shared tab playing back the call echoes.
 *
 * Whether I am sharing is read from the room's own events, never set here, because the browser's own "Stop sharing"
 * bar ends the track without asking us; LiveKit then unpublishes it and the screen hears `LocalTrackUnpublished`.
 */
export function toggleScreenShare(participant: LocalParticipant | undefined): void {
    if (participant === undefined) return;

    void participant.setScreenShareEnabled(!participant.isScreenShareEnabled, { audio: false }).catch(() => undefined);
}

export function isScreenShare(publication: Pick<TrackPublication, 'source'>): boolean {
    return publication.source === Track.Source.ScreenShare;
}
