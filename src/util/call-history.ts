import { ChatCallDirection, ChatCallEndReason, ChatCallStatus, type ChatCallHistoryEntry } from '@iveri/contracts/chat';

import type { ChatKitMessageKey } from '../i18n/index.js';

/** What one call in my history was, from my side, which picks its words and whether it is drawn as missed. */
export type ChatCallHistoryOutcome = 'ongoing' | 'missed' | 'declined' | 'incoming' | 'outgoing' | 'not-answered';

/** The words for each outcome, a select on the call's `kind`. */
export const CALL_HISTORY_KEYS: Readonly<Record<ChatCallHistoryOutcome, ChatKitMessageKey>> = {
    ongoing: 'chat.calls.line.ongoing',
    missed: 'chat.calls.line.missed',
    declined: 'chat.calls.line.declined',
    incoming: 'chat.calls.line.incoming',
    outgoing: 'chat.calls.line.outgoing',
    'not-answered': 'chat.calls.line.not-answered',
};

/**
 * One call from my side: still going; missed (the server's word, never my own call); one I turned down; one I
 * answered or made that connected; or one of mine nobody took (declined, busy, rang out or I gave up).
 */
export function callHistoryOutcome(entry: ChatCallHistoryEntry): ChatCallHistoryOutcome {
    if (entry.status !== ChatCallStatus.ENDED) return 'ongoing';
    if (entry.isMissed) return 'missed';

    const connected = entry.endReason === ChatCallEndReason.COMPLETED;

    if (entry.direction === ChatCallDirection.INCOMING) {
        return connected ? 'incoming' : 'declined';
    }

    return connected ? 'outgoing' : 'not-answered';
}
