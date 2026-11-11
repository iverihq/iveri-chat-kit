import type { UUID } from '@iveri/contracts';

interface CryptoLike {
    randomUUID?: () => string;
    getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
}

/**
 * A version 4 UUID for a message the person is about to send.
 *
 * It is an **idempotency key, not a secret**: a retry presents the same one and `chat-api` returns the
 * first message rather than a second. So the fallbacks are acceptable where they would not be for a
 * token. `randomUUID` exists only in a secure context, which a phone opening the laptop's preview over
 * `http://192.168…` is not; and Hermes has no `crypto` at all unless the app installs a polyfill.
 */
export function createClientMessageId(
    source: CryptoLike | undefined = globalThis.crypto as CryptoLike | undefined,
): UUID {
    if (typeof source?.randomUUID === 'function') return source.randomUUID() as UUID;

    const bytes = new Uint8Array(16);
    if (typeof source?.getRandomValues === 'function') {
        source.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }

    // RFC 9562: version 4 in the high nibble of byte 6, the variant `10` in the top bits of byte 8.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
