import { ChatParticipantStatus, type ChatMention } from '@iveri/contracts/chat';
import { describe, expect, it } from 'vitest';

import { GIORGI, NINO, participant } from '../testing/fixtures.js';

import { insertMention, mentionCandidates, mentionQueryAt, mentionsInText, messageParts } from './mention.js';

const nino: ChatMention = { userId: NINO, displayName: 'Nino Beridze' };
const giorgi: ChatMention = { userId: GIORGI, displayName: 'Giorgi' };

describe('mentions', () => {
    it('opens on an @ at the start or after a space, never inside a word or an email address', () => {
        expect(mentionQueryAt('@ni', 3)).toEqual({ start: 0, query: 'ni' });
        expect(mentionQueryAt('hi @Nino B', 10)).toEqual({ start: 3, query: 'Nino B' });
        expect(mentionQueryAt('me@iveri.ge', 11)).toBeNull();
        expect(mentionQueryAt('@ni\nthere', 9)).toBeNull();
        expect(mentionQueryAt('no at here', 10)).toBeNull();
        expect(mentionQueryAt('@ nobody', 8)).toBeNull();
    });

    it('offers everybody present but me whose name has a word starting with the query', () => {
        const people = [
            participant({ userId: NINO, displayName: 'Nino Beridze' }),
            participant({ userId: GIORGI, displayName: 'Giorgi Beridze' }),
            participant({ displayName: 'Me', isMe: true }),
            participant({ displayName: 'Gone', status: ChatParticipantStatus.LEFT }),
        ];

        expect(mentionCandidates(people, 'beri').map((person) => person.userId)).toEqual([NINO, GIORGI]);
        expect(mentionCandidates(people, 'NI').map((person) => person.userId)).toEqual([NINO]);
        expect(mentionCandidates(people, '').map((person) => person.displayName)).toEqual([
            'Nino Beridze',
            'Giorgi Beridze',
        ]);
    });

    it('puts the whole name in place of the query and the caret after it', () => {
        expect(insertMention('hi @ni and', { start: 3, query: 'ni' }, 6, nino)).toEqual({
            text: 'hi @Nino Beridze  and',
            caret: 17,
        });
    });

    it('forgets a mention whose name was deleted from the text', () => {
        expect(mentionsInText('@Nino Beridze hi', [nino, giorgi, nino])).toEqual([nino]);
    });

    it('draws the longest names first, links as before, and an @ inside a word as text', () => {
        expect(messageParts('@Nino Beridze and @Giorgi see https://iveri.ge x@Giorgi', [giorgi, nino])).toEqual([
            { type: 'mention', text: '@Nino Beridze', userId: NINO },
            { type: 'text', text: ' and ' },
            { type: 'mention', text: '@Giorgi', userId: GIORGI },
            { type: 'text', text: ' see ' },
            { type: 'link', text: 'https://iveri.ge', href: 'https://iveri.ge' },
            { type: 'text', text: ' x@Giorgi' },
        ]);
        expect(messageParts('plain', [])).toEqual([{ type: 'text', text: 'plain' }]);
    });
});
