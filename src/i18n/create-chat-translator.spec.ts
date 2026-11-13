import { describe, expect, it } from 'vitest';

import type { ChatCatalogue } from './catalogue.type.js';
import { createChatTranslator } from './create-chat-translator.js';

const catalogue: ChatCatalogue = {
    namespace: 'chat-kit',
    version: 1,
    sourceLocale: 'en',
    messages: {
        en: {
            'chat.common.cancel': 'Cancel',
            'chat.thread.members': '{count, plural, one {# member} other {# members}}',
            'chat.only-english': '{count, plural, one {# thing} other {# things}}',
        },
        ru: {
            'chat.common.cancel': 'Отмена',
            'chat.thread.members':
                '{count, plural, one {# участник} few {# участника} many {# участников} other {# участника}}',
        },
    },
};

describe('createChatTranslator', () => {
    it('reads the reader’s locale, then its language, then the source', () => {
        expect(createChatTranslator({ locale: 'ru', catalogue })('chat.common.cancel')).toBe('Отмена');
        expect(createChatTranslator({ locale: 'ru-RU', catalogue })('chat.common.cancel')).toBe('Отмена');
        expect(createChatTranslator({ locale: 'ka', catalogue })('chat.common.cancel')).toBe('Cancel');
    });

    it('formats with the plural rules of the locale that supplied the words', () => {
        const t = createChatTranslator({ locale: 'ru', catalogue });
        expect(t('chat.thread.members', { count: 5 })).toBe('5 участников');
        // English words under Russian rules would take `many`, which English does not have, and answer `other`
        // only by luck; under English rules 1 is `one`.
        expect(t('chat.only-english', { count: 1 })).toBe('1 thing');
    });

    it('reads the app’s words first, but never lets an English override hide a translation the kit has', () => {
        const messages = { en: { 'chat.common.cancel': 'Never mind', 'acme.order.shipped': 'Order {order} shipped' } };
        expect(createChatTranslator({ locale: 'en', catalogue, messages })('chat.common.cancel')).toBe('Never mind');
        expect(createChatTranslator({ locale: 'ru', catalogue, messages })('chat.common.cancel')).toBe('Отмена');
        expect(
            createChatTranslator({ locale: 'ru', catalogue, messages })('acme.order.shipped', { order: 'A-17' }),
        ).toBe('Order A-17 shipped');
    });

    it('answers an unknown key with the key, and an unformattable pattern as written', () => {
        const t = createChatTranslator({ locale: 'en', catalogue, messages: { en: { 'acme.broken': 'Hi {name' } } });
        expect(t('acme.nobody-wrote-this')).toBe('acme.nobody-wrote-this');
        expect(t('acme.broken', { name: 'Ana' })).toBe('Hi {name');
    });
});
