import type { IsoDateTime, Nullable } from '@iveri/contracts';
import { ChatConversationKind, ChatParticipantStatus } from '@iveri/contracts/chat';
import type { ChatConversation, ChatConversationSummary, ChatImage } from '@iveri/contracts/chat';

import type { ChatTranslate } from '../i18n/index.js';

/** The prefix that marks a product's label or title as a `chat-kit` key rather than its own words. */
export const CHAT_TEXT_KEY_PREFIX = 'chat.';

/**
 * A label or title a product sent, as the reader should see it.
 *
 * **A value starting with `chat.` is a translation key** in the `chat-kit` namespace (`chat.label.driver`,
 * `chat.title.taxi-ride`) and is rendered through `translate`, so a ride's chat reads "Driver" to the
 * passenger in English and "მძღოლი" to the one in Georgian, from one value Taxi's server wrote once.
 * **Anything else is the product's own text and is shown exactly as written**: a shop's name, a ride's
 * destination. Nothing in between: a value is never half-translated, and a person's name is never
 * looked up as a key.
 */
export function productText(value: string, t: ChatTranslate): string;
export function productText(value: Nullable<string>, t: ChatTranslate): Nullable<string>;
export function productText(value: Nullable<string>, t: ChatTranslate): Nullable<string> {
    if (value === null || value.length === 0) return value;

    return value.startsWith(CHAT_TEXT_KEY_PREFIX) ? t(value) : value;
}

/** What a conversation's header, and its inbox row, show as its name and the line beneath it. */
export interface ChatConversationHeading {
    title: string;
    /** A product's label beside the title: "Driver". */
    label: Nullable<string>;
    /** The product's own line for a context conversation; null otherwise. */
    subtitle: Nullable<string>;
    /** The face beside the title: the other person in a two-person conversation, else the conversation's. */
    avatar: Nullable<ChatImage>;
    /** The other person's last activity, in a conversation with exactly one other person. */
    lastActiveAt: Nullable<IsoDateTime>;
}

type HeadingSource = ChatConversationSummary & Partial<Pick<ChatConversation, 'participants'>>;

/**
 * The header rule for every kind of conversation.
 *
 * **A context conversation between two people is about the other person**, so it shows their name with
 * the product's label beside it ("Giorgi B. · Driver") and the product's title beneath ("Taxi ride").
 * Leading with "Taxi ride" would make every ride the passenger ever took look like the same
 * conversation. Any other context conversation leads with the product's title, and so does one the product
 * opened as a group, such as a team that holds two people today. A direct conversation's title is already the
 * other person's name, and a group's is its own.
 */
export function conversationHeading(conversation: HeadingSource, t: ChatTranslate): ChatConversationHeading {
    const others = (conversation.participants ?? []).filter(
        (participant) =>
            !participant.isMe &&
            participant.status !== ChatParticipantStatus.LEFT &&
            participant.status !== ChatParticipantStatus.REMOVED,
    );

    if (conversation.kind === ChatConversationKind.CONTEXT) {
        const other = others.length === 1 && !conversation.isGroup ? others[0] : null;
        if (other !== null) {
            return {
                title: other.displayName,
                label: productText(other.label, t),
                subtitle: productText(conversation.title, t),
                avatar: other.avatar,
                lastActiveAt: other.lastActiveAt,
            };
        }
        // An inbox summary carries no participants; `chat-api` names the other person of a two-person
        // context conversation in `other` instead, with the name the product gave them.
        if (conversation.other !== null) {
            return {
                title: conversation.other.displayName,
                label: null,
                subtitle: productText(conversation.title, t),
                avatar: conversation.other.avatar,
                lastActiveAt: conversation.other.lastActiveAt,
            };
        }

        return {
            title: productText(conversation.title, t),
            label: null,
            subtitle: productText(conversation.subtitle, t),
            avatar: conversation.avatar,
            lastActiveAt: null,
        };
    }

    const isDirect = conversation.kind === ChatConversationKind.DIRECT;

    return {
        title: conversation.title,
        label: null,
        subtitle: null,
        avatar: isDirect ? (conversation.other?.avatar ?? conversation.avatar) : conversation.avatar,
        lastActiveAt: isDirect ? (conversation.other?.lastActiveAt ?? others[0]?.lastActiveAt ?? null) : null,
    };
}
