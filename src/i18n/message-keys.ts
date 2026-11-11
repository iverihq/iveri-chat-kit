import { ChatRefusal, ChatReportReason } from '@iveri/contracts/chat';

/**
 * The system notices the kit can draw. A notice is a key and variables, never free text, so every key a
 * server can send has to be here and in the namespace.
 *
 * The first nine are `chat-api`'s own (`SYSTEM_MESSAGE_KEYS` in its `conversation/util`), with the
 * variables it writes: `{actor}` who did it, `{name}` who it was done to, `{title}`, and `{role}` as
 * `owner`, `admin` or `member`. The rest are products' notices, posted through the embedding API.
 */
export const CHAT_SYSTEM_MESSAGE_KEYS = [
    'chat.system.group-created',
    'chat.system.group-renamed',
    'chat.system.group-photo-changed',
    'chat.system.group-photo-removed',
    'chat.system.member-added',
    'chat.system.member-joined',
    'chat.system.member-removed',
    'chat.system.member-left',
    'chat.system.member-role-changed',
    'chat.system.taxi-driver-arriving',
    'chat.system.taxi-ride-started',
    'chat.system.taxi-ride-completed',
    'chat.system.closed',
] as const;

/**
 * Labels and titles a product may send as keys instead of words: a participant's `label` ("Driver") and
 * a context conversation's `title`/`subtitle` ("Taxi ride"). A value starting with `chat.` is one of
 * these and is translated for the reader; anything else is the product's own text and shown as written.
 */
export const CHAT_PRODUCT_TEXT_MESSAGE_KEYS = [
    'chat.label.passenger',
    'chat.label.driver',
    'chat.label.shop',
    'chat.label.customer',
    'chat.label.courier',
    'chat.label.trainer',
    'chat.label.member',
    'chat.title.taxi-ride',
    'chat.title.order',
    'chat.title.delivery',
    'chat.title.social-direct',
] as const;

/** One key per refusal `chat-api` can send, derived from the enum so a new member cannot be forgotten. */
export const CHAT_REFUSAL_MESSAGE_KEYS = Object.values(ChatRefusal).map(
    (refusal) => `chat.refusal.${refusal}` as const,
);

/** One key per report reason, derived from the enum for the same reason. */
export const CHAT_REPORT_REASON_MESSAGE_KEYS = Object.values(ChatReportReason).map(
    (reason) => `chat.report.reason.${reason}` as const,
);

/** Every key the components render directly. Kept in one list so the kit's own spec can hold it to the source. */
const INTERFACE_KEYS = [
    'chat.common.cancel',
    'chat.common.close',
    'chat.common.loading',
    'chat.common.retry',
    'chat.common.save',
    'chat.common.show-more',
    'chat.common.you',

    'chat.error.generic',
    'chat.error.network',
    'chat.error.not-found',
    'chat.error.rate-limited',
    'chat.error.too-large',
    'chat.error.unauthenticated',

    'chat.inbox.tabs',
    'chat.inbox.tab.inbox',
    'chat.inbox.tab.requests',
    'chat.inbox.tab.archived',
    'chat.inbox.search.label',
    'chat.inbox.search.placeholder',
    'chat.inbox.search.clear',
    'chat.inbox.search.conversations',
    'chat.inbox.search.messages',
    'chat.inbox.search.empty',
    'chat.inbox.new',
    'chat.inbox.empty.inbox',
    'chat.inbox.empty.inbox-hint',
    'chat.inbox.empty.requests',
    'chat.inbox.empty.requests-hint',
    'chat.inbox.empty.archived',
    'chat.inbox.empty.archived-hint',
    'chat.inbox.error',
    'chat.inbox.unread',
    'chat.inbox.muted',
    'chat.inbox.pinned',
    'chat.inbox.request',
    'chat.inbox.options',

    'chat.action.pin',
    'chat.action.unpin',
    'chat.action.mute',
    'chat.action.unmute',
    'chat.action.mute-8h',
    'chat.action.mute-week',
    'chat.action.mute-always',
    'chat.action.archive',
    'chat.action.unarchive',
    'chat.action.delete-conversation',
    'chat.action.details',
    'chat.action.leave',
    'chat.action.reply',
    'chat.action.copy',
    'chat.action.copied',
    'chat.action.edit',
    'chat.action.delete-for-me',
    'chat.action.delete-for-everyone',
    'chat.action.report',
    'chat.action.more',

    'chat.delete-conversation.title',
    'chat.delete-conversation.body',
    'chat.delete-conversation.confirm',
    'chat.delete-message.title',
    'chat.delete-message.everyone-body',
    'chat.delete-message.me-body',
    'chat.delete-message.confirm',

    'chat.preview.own',
    'chat.preview.sender',
    'chat.preview.photo',
    'chat.preview.file',
    'chat.preview.voice',
    'chat.preview.deleted',
    'chat.preview.empty',

    'chat.day.today',
    'chat.day.yesterday',
    'chat.presence.just-now',
    'chat.presence.minutes',
    'chat.presence.hours',
    'chat.presence.yesterday',
    'chat.presence.days',
    'chat.presence.last-active',

    'chat.thread.members',
    'chat.thread.back',
    'chat.thread.options',
    'chat.thread.messages',
    'chat.thread.load-older',
    'chat.thread.new-messages',
    'chat.thread.jump-latest',
    'chat.thread.error',
    'chat.thread.empty',
    'chat.thread.empty-hint',
    'chat.thread.read-only',
    'chat.thread.request.title',
    'chat.thread.request.body',
    'chat.thread.request.accept',
    'chat.thread.request.block',

    'chat.message.edited',
    'chat.message.deleted',
    'chat.message.sending',
    'chat.message.failed',
    'chat.message.discard',
    'chat.message.sent',
    'chat.message.read',
    'chat.message.read-by',
    'chat.message.reply-quote',
    'chat.message.quote-deleted',
    'chat.message.photo',
    'chat.message.open-photo',
    'chat.message.download',

    'chat.voice.play',
    'chat.voice.pause',
    'chat.voice.position',

    'chat.reaction.add',
    'chat.reaction.count',
    'chat.reaction.quick',
    'chat.reaction.react-with',

    'chat.typing.one',
    'chat.typing.two',
    'chat.typing.many',

    'chat.composer.label',
    'chat.composer.placeholder',
    'chat.composer.hint',
    'chat.composer.send',
    'chat.composer.attach',
    'chat.composer.attach-photo',
    'chat.composer.attach-file',
    'chat.composer.record',
    'chat.composer.recording',
    'chat.composer.cancel-recording',
    'chat.composer.send-voice',
    'chat.composer.microphone-denied',
    'chat.composer.recording-unsupported',
    'chat.composer.replying-to',
    'chat.composer.editing',
    'chat.composer.cancel-reply',
    'chat.composer.cancel-edit',
    'chat.composer.too-long',
    'chat.composer.uploading',
    'chat.composer.upload-failed',
    'chat.composer.remove-attachment',
    'chat.composer.too-large',
    'chat.composer.too-many',

    'chat.report.title-message',
    'chat.report.title-person',
    'chat.report.reason',
    'chat.report.note',
    'chat.report.note-hint',
    'chat.report.disclosure',
    'chat.report.submit',
    'chat.report.sent',

    'chat.people.title-direct',
    'chat.people.title-group',
    'chat.people.title-add',
    'chat.people.search',
    'chat.people.search-placeholder',
    'chat.people.search-hint',
    'chat.people.empty',
    'chat.people.contacts',
    'chat.people.results',
    'chat.people.selected',
    'chat.people.select',
    'chat.people.deselect',
    'chat.people.message',
    'chat.people.group-name',
    'chat.people.group-name-required',
    'chat.people.members-required',
    'chat.people.create-group',
    'chat.people.add',

    'chat.group.title',
    'chat.group.members',
    'chat.group.role.owner',
    'chat.group.role.admin',
    'chat.group.role.member',
    'chat.group.add-people',
    'chat.group.rename',
    'chat.group.make-admin',
    'chat.group.make-member',
    'chat.group.make-owner',
    'chat.group.remove',
    'chat.group.member-options',
    'chat.group.leave-title',
    'chat.group.leave-body',
    'chat.group.invite',
    'chat.group.invite-hint',
    'chat.group.invite-copy',
    'chat.group.invite-copied',
    'chat.group.invite-reset',
    'chat.group.invite-reset-body',

    'chat.person.block',
    'chat.person.unblock',
    'chat.person.block-title',
    'chat.person.block-body',
    'chat.person.report',
    'chat.person.add-contact',
    'chat.person.remove-contact',

    'chat.lightbox.label',
    'chat.lightbox.previous',
    'chat.lightbox.next',

    'chat.system.unknown',
] as const;

/** A key the kit renders itself. Server-sent system and refusal keys are plain strings until checked. */
export type ChatKitMessageKey =
    | (typeof INTERFACE_KEYS)[number]
    | (typeof CHAT_SYSTEM_MESSAGE_KEYS)[number]
    | (typeof CHAT_PRODUCT_TEXT_MESSAGE_KEYS)[number]
    | (typeof CHAT_REFUSAL_MESSAGE_KEYS)[number]
    | (typeof CHAT_REPORT_REASON_MESSAGE_KEYS)[number];

/**
 * Every key the kit can render, including every system notice and every refusal.
 *
 * **Each consuming app's `catalog.spec.ts` asserts its pulled catalogue holds all of these.** That
 * spec scans an app's own source for `t('…')`, and the kit's components live in `node_modules`, where
 * no scan reaches: without this list a component rendering a key the app never pulled would show the
 * key itself on screen, which is exactly the failure a catalogue spec exists to catch.
 */
export const CHAT_KIT_MESSAGE_KEYS: readonly ChatKitMessageKey[] = [
    ...INTERFACE_KEYS,
    ...CHAT_SYSTEM_MESSAGE_KEYS,
    ...CHAT_PRODUCT_TEXT_MESSAGE_KEYS,
    ...CHAT_REFUSAL_MESSAGE_KEYS,
    ...CHAT_REPORT_REASON_MESSAGE_KEYS,
];
