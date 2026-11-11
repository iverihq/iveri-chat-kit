import { ChatMessageKind, ChatRefusal } from '@iveri/contracts/chat';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CONVERSATION, conversation, keyTranslate, message, ownMessage } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';

import { ChatNativeProvider } from './ChatNativeProvider.js';
import { ChatThreadScreen } from './ChatThreadScreen.js';

// React Native cannot run in a test runner (its entry point is Flow), so this project renders the same
// components through `react-native-web`. It proves they mount and draw the right things; the gestures,
// the keyboard and the device capabilities are verified on a phone.
describe('ChatThreadScreen', () => {
    it('draws messages, a notice, read state, and the composer with only the controls the app supplied', async () => {
        const harness = createHarness({
            translate: (key, values) =>
                key === 'chat.system.closed' ? 'This conversation has closed' : keyTranslate(key, values),
        });
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({ body: conversation() }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: {
                hasOlder: false,
                lastSeq: 3,
                messages: [
                    message({ seq: 1, body: 'Hello from Nino' }),
                    message({
                        seq: 2,
                        sender: null,
                        kind: ChatMessageKind.SYSTEM,
                        body: null,
                        systemKey: 'chat.system.closed',
                    }),
                    ownMessage({ seq: 3, body: 'Hi' }),
                ],
            },
        }));

        render(
            <ChatNativeProvider capabilities={{ pickImage: () => Promise.resolve(null) }}>
                <ChatThreadScreen conversationId={CONVERSATION} />
            </ChatNativeProvider>,
            { wrapper: harness.wrapper },
        );

        expect(await screen.findByText('Hello from Nino')).toBeInTheDocument();
        expect(screen.getByText('This conversation has closed')).toBeInTheDocument();
        expect(screen.getByLabelText('chat.message.sent')).toBeInTheDocument();
        expect(screen.getByLabelText('chat.composer.attach-photo')).toBeInTheDocument();
        // No `pickFile` and no `recordVoice` were supplied, so neither control exists.
        expect(screen.queryByLabelText('chat.composer.attach-file')).toBeNull();
        expect(screen.queryByLabelText('chat.composer.record')).toBeNull();
    });

    it('replaces the composer with the refusal when the conversation is closed', async () => {
        const harness = createHarness();
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({
            body: conversation({ canSend: false, refusal: ChatRefusal.CLOSED }),
        }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));

        render(<ChatThreadScreen conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        expect(await screen.findByText('chat.refusal.closed')).toBeInTheDocument();
        expect(screen.queryByLabelText('chat.composer.label')).toBeNull();
    });
});
