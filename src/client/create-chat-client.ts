import type { Maybe } from '@iveri/contracts';
import type { ChatAttachment, UploadChatAttachmentFields } from '@iveri/contracts/chat';

import { ChatApiError } from './chat-api-error.js';
import type {
    ChatClient,
    ChatClientOptions,
    ChatRequestOptions,
    ChatUploadFile,
    ChatUploadOptions,
} from './chat-client.type.js';

type QueryValue = Maybe<string | number>;

interface RequestInit {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    query?: Record<string, QueryValue>;
    body?: unknown;
    signal?: AbortSignal;
}

const encode = encodeURIComponent;

/** Joins a base and a path without doubling or dropping the slash between them. */
function joinUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
    const url = `${baseUrl.replace(/\/+$/u, '')}${path}`;
    const params = new URLSearchParams();

    for (const [name, value] of Object.entries(query ?? {})) {
        if (value === null || value === undefined || value === '') continue;
        params.set(name, String(value));
    }

    const search = params.toString();

    return search.length > 0 ? `${url}?${search}` : url;
}

async function readBody(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (text.length === 0) return undefined;

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

/** True for an abort, without naming `DOMException`, which React Native's runtime may not define. */
export function isAbortError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function abortError(): Error {
    const error = new Error('The request was cancelled');
    error.name = 'AbortError';

    return error;
}

function isUriFile(file: ChatUploadFile): file is { uri: string; name: string; type: string } {
    return typeof (file as { uri?: unknown }).uri === 'string';
}

function fileName(file: ChatUploadFile): string {
    if (isUriFile(file)) return file.name;

    return typeof File !== 'undefined' && file instanceof File ? file.name : 'upload';
}

/**
 * The typed HTTP client for every person route in `chat-api`.
 *
 * - **The token is read per request**, so a session refreshed elsewhere in the app is what the next
 *   request presents.
 * - **A 401 is retried exactly once**, after `onUnauthorized` has run. Twice would turn a revoked
 *   session into a loop; never would make every expired token a visible failure.
 * - **Success bodies are bare**, as across the fleet; a failure is a `ChatApiError` carrying the
 *   status and `details.reason` read as a `ChatRefusal`.
 */
export function createChatClient(options: ChatClientOptions): ChatClient {
    const fetchImpl =
        options.fetch ??
        ((input: RequestInfo | URL, init?: globalThis.RequestInit): Promise<Response> => fetch(input, init));
    const createXhr = options.createXhr ?? ((): XMLHttpRequest => new XMLHttpRequest());

    const getAccessToken = async (): Promise<Maybe<string>> => options.getAccessToken();

    const refreshAccessToken = async (): Promise<boolean> => {
        if (!options.onUnauthorized) return false;
        try {
            const outcome = await options.onUnauthorized();

            return outcome !== false;
        } catch {
            return false;
        }
    };

    const send = async (init: RequestInit): Promise<Response> => {
        const token = await getAccessToken();
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (typeof token === 'string' && token.length > 0) headers.Authorization = `Bearer ${token}`;
        if (init.body !== undefined) headers['Content-Type'] = 'application/json';

        try {
            return await fetchImpl(joinUrl(options.baseUrl, init.path, init.query), {
                method: init.method,
                headers,
                body: init.body === undefined ? undefined : JSON.stringify(init.body),
                signal: init.signal,
            });
        } catch (error: unknown) {
            // An abort is the caller's own decision and must stay an `AbortError`, which TanStack
            // Query recognises; only a genuine network failure becomes a status-0 `ChatApiError`.
            if (isAbortError(error)) throw error;
            throw ChatApiError.network(error);
        }
    };

    const request = async <T>(init: RequestInit): Promise<T> => {
        let response = await send(init);

        if (response.status === 401 && (await refreshAccessToken())) {
            response = await send(init);
        }

        const body = await readBody(response);
        if (!response.ok) throw ChatApiError.fromResponse(response.status, body);

        return body as T;
    };

    const get = <T>(path: string, query?: Record<string, QueryValue>, opts?: ChatRequestOptions): Promise<T> =>
        request<T>({ method: 'GET', path, query, signal: opts?.signal });

    const uploadOnce = async (
        file: ChatUploadFile,
        fields: UploadChatAttachmentFields,
        opts: ChatUploadOptions | undefined,
    ): Promise<{ status: number; body: unknown }> => {
        const token = await getAccessToken();
        const form = new FormData();
        form.append('kind', fields.kind);
        if (fields.durationMs !== undefined) form.append('durationMs', String(fields.durationMs));
        if (fields.waveform !== undefined) form.append('waveform', fields.waveform);
        if (isUriFile(file)) {
            // React Native's `FormData` reads `{ uri, name, type }` from disk; the DOM typing does not
            // know that shape, which is the only reason for the cast.
            form.append('file', file as unknown as Blob, file.name);
        } else {
            form.append('file', file, fileName(file));
        }

        return new Promise((resolve, reject) => {
            const xhr = createXhr();
            xhr.open('POST', joinUrl(options.baseUrl, '/attachments'));
            xhr.setRequestHeader('Accept', 'application/json');
            if (typeof token === 'string' && token.length > 0) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            xhr.upload.onprogress = (event: ProgressEvent): void => {
                if (event.lengthComputable && event.total > 0) opts?.onProgress?.(event.loaded / event.total);
            };
            xhr.onload = (): void => {
                let body: unknown;
                try {
                    body = xhr.responseText.length > 0 ? (JSON.parse(xhr.responseText) as unknown) : undefined;
                } catch {
                    body = xhr.responseText;
                }
                resolve({ status: xhr.status, body });
            };
            xhr.onerror = (): void => {
                reject(ChatApiError.network(new Error('The upload did not reach chat-api')));
            };
            xhr.onabort = (): void => {
                reject(abortError());
            };
            opts?.signal?.addEventListener('abort', () => {
                xhr.abort();
            });
            xhr.send(form);
        });
    };

    return {
        getAccessToken,
        refreshAccessToken,
        createRealtimeTicket: () => request({ method: 'POST', path: '/realtime/ticket' }),

        getProfile: (opts) => get('/me', undefined, opts),
        createProfile: (body) => request({ method: 'POST', path: '/me/profile', body }),
        updateProfile: (body) => request({ method: 'PATCH', path: '/me', body }),
        resetInviteCode: () => request({ method: 'POST', path: '/me/invite-code/reset' }),
        registerDevice: (body) => request({ method: 'PUT', path: '/me/devices', body }),
        removeDevice: (installationId) => request({ method: 'DELETE', path: `/me/devices/${encode(installationId)}` }),

        searchPeople: (query, opts) => get('/people/search', { q: query }, opts),
        getPerson: (userId, opts) => get(`/people/${encode(userId)}`, undefined, opts),
        listContacts: (opts) => get('/contacts', undefined, opts),
        addContact: (body) => request({ method: 'POST', path: '/contacts', body }),
        removeContact: (userId) => request({ method: 'DELETE', path: `/contacts/${encode(userId)}` }),
        listBlocks: (opts) => get('/blocks', undefined, opts),
        block: (userId) => request({ method: 'PUT', path: `/blocks/${encode(userId)}` }),
        unblock: (userId) => request({ method: 'DELETE', path: `/blocks/${encode(userId)}` }),
        getInvitation: (code, opts) => get(`/invitations/${encode(code)}`, undefined, opts),
        acceptInvitation: (code) => request({ method: 'POST', path: `/invitations/${encode(code)}/accept` }),

        listConversations: (params, opts) =>
            get(
                '/conversations',
                { folder: params.folder, cursor: params.cursor, product: params.product, limit: params.limit },
                opts,
            ),
        getConversationByContext: (context, opts) =>
            get('/conversations/by-context', { product: context.product, type: context.type, id: context.id }, opts),
        getConversation: (id, opts) => get(`/conversations/${encode(id)}`, undefined, opts),
        startDirect: (body) => request({ method: 'POST', path: '/conversations/direct', body }),
        createGroup: (body) => request({ method: 'POST', path: '/conversations/group', body }),
        updateGroup: (id, body) => request({ method: 'PATCH', path: `/conversations/${encode(id)}`, body }),
        addMembers: (id, body) => request({ method: 'POST', path: `/conversations/${encode(id)}/members`, body }),
        updateMember: (id, userId, body) =>
            request({ method: 'PATCH', path: `/conversations/${encode(id)}/members/${encode(userId)}`, body }),
        removeMember: (id, userId) =>
            request({ method: 'DELETE', path: `/conversations/${encode(id)}/members/${encode(userId)}` }),
        leave: (id) => request({ method: 'POST', path: `/conversations/${encode(id)}/leave` }),
        resetGroupInvite: (id) => request({ method: 'POST', path: `/conversations/${encode(id)}/invite-code/reset` }),
        updateMySettings: (id, body) => request({ method: 'PATCH', path: `/conversations/${encode(id)}/me`, body }),
        accept: (id) => request({ method: 'POST', path: `/conversations/${encode(id)}/accept` }),
        markRead: (id, body) => request({ method: 'POST', path: `/conversations/${encode(id)}/read`, body }),
        typing: (id) => request({ method: 'POST', path: `/conversations/${encode(id)}/typing` }),
        deleteConversation: (id) => request({ method: 'DELETE', path: `/conversations/${encode(id)}` }),

        listMessages: (id, params, opts) =>
            get(
                `/conversations/${encode(id)}/messages`,
                { beforeSeq: params.beforeSeq, afterSeq: params.afterSeq, limit: params.limit },
                opts,
            ),
        sendMessage: (id, body) => request({ method: 'POST', path: `/conversations/${encode(id)}/messages`, body }),
        editMessage: (messageId, body) => request({ method: 'PATCH', path: `/messages/${encode(messageId)}`, body }),
        deleteMessage: (messageId, scope) =>
            request({ method: 'DELETE', path: `/messages/${encode(messageId)}`, query: { for: scope } }),
        react: (messageId, body) => request({ method: 'PUT', path: `/messages/${encode(messageId)}/reactions`, body }),
        unreact: (messageId) => request({ method: 'DELETE', path: `/messages/${encode(messageId)}/reactions` }),
        searchMessages: (query, opts) => get('/search/messages', { q: query }, opts),

        uploadAttachment: async (file, fields, opts): Promise<ChatAttachment> => {
            let outcome = await uploadOnce(file, fields, opts);
            if (outcome.status === 401 && (await refreshAccessToken())) {
                outcome = await uploadOnce(file, fields, opts);
            }
            if (outcome.status < 200 || outcome.status >= 300) {
                throw ChatApiError.fromResponse(outcome.status, outcome.body);
            }

            return outcome.body as ChatAttachment;
        },

        report: (body) => request({ method: 'POST', path: '/reports', body }),

        startCall: (id, body) => request({ method: 'POST', path: `/conversations/${encode(id)}/calls`, body }),
        getCall: (id, opts) => get(`/calls/${encode(id)}`, undefined, opts),
        getCurrentCall: (id, opts) => get(`/conversations/${encode(id)}/calls/current`, undefined, opts),
        listIncomingCalls: (opts) => get('/me/calls/incoming', undefined, opts),
        acceptCall: (id) => request({ method: 'POST', path: `/calls/${encode(id)}/accept` }),
        joinCall: (id) => request({ method: 'POST', path: `/calls/${encode(id)}/join` }),
        declineCall: (id) => request({ method: 'POST', path: `/calls/${encode(id)}/decline` }),
        endCall: (id) => request({ method: 'POST', path: `/calls/${encode(id)}/end` }),
    };
}
