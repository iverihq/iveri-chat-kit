import type { Maybe, UUID } from '@iveri/contracts';
import type {
    AcceptChatInvitationResponse,
    AddChatContactRequest,
    AddChatMembersRequest,
    ChatAttachment,
    ChatBlock,
    ChatContact,
    ChatConversation,
    ChatConversationSummary,
    ChatInboxFolder,
    ChatInboxPage,
    ChatInvitationPreview,
    ChatMessage,
    ChatMessagePage,
    ChatMessageSearchHit,
    ChatPersonCard,
    ChatProfile,
    ChatTypingResponse,
    CreateChatProfileRequest,
    CreateChatReportRequest,
    CreateGroupChatRequest,
    EditChatMessageRequest,
    MarkChatReadRequest,
    ReactToChatMessageRequest,
    RegisterChatDeviceRequest,
    SendChatMessageRequest,
    StartDirectChatRequest,
    UpdateChatMemberRequest,
    UpdateChatProfileRequest,
    UpdateGroupChatRequest,
    UpdateMyChatSettingsRequest,
    UploadChatAttachmentFields,
} from '@iveri/contracts/chat';

export interface ChatClientOptions {
    /**
     * `chat-api`'s base address **including** `/api/v1`, e.g. `http://localhost:3060/api/v1`. Taken
     * whole rather than built from an origin, so an app that reaches the API through a gateway with
     * another prefix needs no option for it.
     */
    baseUrl: string;

    /** The current identity access token. Read on every request, never captured, so a refresh is seen. */
    getAccessToken: () => Maybe<string> | Promise<Maybe<string>>;

    /**
     * Called once when `chat-api` answers 401, before the request is retried a single time. Wire it to
     * the app's own **single-flight** session refresh (`createSessionRefresh` in `@iveri/react-kit`):
     * identity treats a refresh token presented twice as stolen, so two parallel refreshes from one tab
     * would sign the person out everywhere. Return `false` to say the session is gone and skip the retry.
     */
    onUnauthorized?: () => unknown;

    /** Defaults to the global `fetch`. A spec passes a stub here instead of patching the global. */
    fetch?: typeof fetch;

    /** Defaults to `new XMLHttpRequest()`. Uploads use XHR because `fetch` reports no upload progress. */
    createXhr?: () => XMLHttpRequest;
}

/** A file to upload: a browser `Blob`/`File`, or React Native's `{ uri, name, type }`, which its `FormData` reads from disk. */
export type ChatUploadFile = Blob | { uri: string; name: string; type: string };

export interface ChatRequestOptions {
    signal?: AbortSignal;
}

export interface ChatUploadOptions extends ChatRequestOptions {
    /** Called with the fraction sent, from 0 to 1. */
    onProgress?: (fraction: number) => void;
}

export interface ListConversationsParams {
    folder?: ChatInboxFolder;
    cursor?: Maybe<string>;
    /** Narrows to one product's context conversations: how Ezo's Messages page lists only Ezo's. */
    product?: Maybe<string>;
    limit?: number;
}

export interface ChatContextRef {
    product: string;
    type: string;
    id: string;
}

export interface ListMessagesParams {
    beforeSeq?: number;
    afterSeq?: number;
    limit?: number;
}

export type ChatDeleteScope = 'everyone' | 'me';

/**
 * Every person route of `chat-api`, typed with `@iveri/contracts/chat`.
 *
 * An interface rather than only a factory so the gallery and the specs can stand in a client of their
 * own without patching anything. The embedding and staff routes are deliberately absent: the first is
 * called by a product's **server** with its service credential, and the second belongs to the staff
 * panel. Neither has any business in a component a person's browser runs.
 */
export interface ChatClient {
    getAccessToken(): Promise<Maybe<string>>;
    /** Runs the app's `onUnauthorized` and reports whether the session survived it. */
    refreshAccessToken(): Promise<boolean>;

    getProfile(options?: ChatRequestOptions): Promise<ChatProfile>;
    createProfile(body: CreateChatProfileRequest): Promise<ChatProfile>;
    updateProfile(body: UpdateChatProfileRequest): Promise<ChatProfile>;
    resetInviteCode(): Promise<ChatProfile>;
    registerDevice(body: RegisterChatDeviceRequest): Promise<void>;
    removeDevice(installationId: string): Promise<void>;

    searchPeople(query: string, options?: ChatRequestOptions): Promise<ChatPersonCard[]>;
    getPerson(userId: UUID, options?: ChatRequestOptions): Promise<ChatPersonCard>;
    listContacts(options?: ChatRequestOptions): Promise<ChatContact[]>;
    addContact(body: AddChatContactRequest): Promise<ChatContact>;
    removeContact(userId: UUID): Promise<void>;
    listBlocks(options?: ChatRequestOptions): Promise<ChatBlock[]>;
    block(userId: UUID): Promise<void>;
    unblock(userId: UUID): Promise<void>;
    getInvitation(code: string, options?: ChatRequestOptions): Promise<ChatInvitationPreview>;
    acceptInvitation(code: string): Promise<AcceptChatInvitationResponse>;

    listConversations(params: ListConversationsParams, options?: ChatRequestOptions): Promise<ChatInboxPage>;
    getConversationByContext(context: ChatContextRef, options?: ChatRequestOptions): Promise<ChatConversation>;
    getConversation(conversationId: UUID, options?: ChatRequestOptions): Promise<ChatConversation>;
    startDirect(body: StartDirectChatRequest): Promise<ChatConversation>;
    createGroup(body: CreateGroupChatRequest): Promise<ChatConversation>;
    updateGroup(conversationId: UUID, body: UpdateGroupChatRequest): Promise<ChatConversation>;
    addMembers(conversationId: UUID, body: AddChatMembersRequest): Promise<ChatConversation>;
    updateMember(conversationId: UUID, userId: UUID, body: UpdateChatMemberRequest): Promise<ChatConversation>;
    removeMember(conversationId: UUID, userId: UUID): Promise<ChatConversation>;
    leave(conversationId: UUID): Promise<void>;
    resetGroupInvite(conversationId: UUID): Promise<ChatConversation>;
    updateMySettings(conversationId: UUID, body: UpdateMyChatSettingsRequest): Promise<ChatConversationSummary>;
    accept(conversationId: UUID): Promise<ChatConversationSummary>;
    markRead(conversationId: UUID, body: MarkChatReadRequest): Promise<void>;
    typing(conversationId: UUID): Promise<ChatTypingResponse>;
    deleteConversation(conversationId: UUID): Promise<void>;

    listMessages(
        conversationId: UUID,
        params: ListMessagesParams,
        options?: ChatRequestOptions,
    ): Promise<ChatMessagePage>;
    sendMessage(conversationId: UUID, body: SendChatMessageRequest): Promise<ChatMessage>;
    editMessage(messageId: UUID, body: EditChatMessageRequest): Promise<ChatMessage>;
    deleteMessage(messageId: UUID, scope: ChatDeleteScope): Promise<void>;
    react(messageId: UUID, body: ReactToChatMessageRequest): Promise<ChatMessage>;
    unreact(messageId: UUID): Promise<ChatMessage>;
    searchMessages(query: string, options?: ChatRequestOptions): Promise<ChatMessageSearchHit[]>;

    uploadAttachment(
        file: ChatUploadFile,
        fields: UploadChatAttachmentFields,
        options?: ChatUploadOptions,
    ): Promise<ChatAttachment>;

    report(body: CreateChatReportRequest): Promise<void>;
}
