import type { Nullable } from '@iveri/contracts';
import { ChatRefusal } from '@iveri/contracts/chat';

const REFUSALS = new Set<string>(Object.values(ChatRefusal));

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): Nullable<string> {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

interface ChatApiErrorInit {
    status: number;
    message: string;
    code?: Nullable<string>;
    refusal?: Nullable<ChatRefusal>;
    details?: Nullable<Record<string, unknown>>;
    correlationId?: Nullable<string>;
}

/**
 * Every failure the client reports, whether `chat-api` answered or the network did not.
 *
 * **Branch on `refusal` first, then `status`, never on `message`.** A refusal is a `ChatRefusal` from
 * `details.reason`, which is the one thing a person can act on and which the kit translates; the
 * message is the API's English for a developer and may change at any time. A refusal value this
 * version of the contract does not know is reported as `null`, so a newer server cannot hand a
 * component a key nobody wrote words for.
 *
 * `status` is 0 when no response arrived at all, which is the one case a client should keep quiet
 * about and simply retry.
 */
export class ChatApiError extends Error {
    readonly status: number;
    readonly code: Nullable<string>;
    readonly refusal: Nullable<ChatRefusal>;
    readonly details: Nullable<Record<string, unknown>>;
    readonly correlationId: Nullable<string>;

    constructor(init: ChatApiErrorInit) {
        super(init.message);
        this.name = 'ChatApiError';
        this.status = init.status;
        this.code = init.code ?? null;
        this.refusal = init.refusal ?? null;
        this.details = init.details ?? null;
        this.correlationId = init.correlationId ?? null;
    }

    /** True when no response arrived: offline, a dropped connection, a refused socket. */
    get isNetworkError(): boolean {
        return this.status === 0;
    }

    /** Reads the fleet's `ApiErrorResponse` envelope, tolerating a body that is not one. */
    static fromResponse(status: number, body: unknown): ChatApiError {
        const error = isRecord(body) && isRecord(body.error) ? body.error : null;
        const details = error !== null && isRecord(error.details) ? error.details : null;
        const reason = details?.reason;

        return new ChatApiError({
            status,
            message: stringOrNull(error?.message) ?? `chat-api answered ${status}`,
            code: stringOrNull(error?.code),
            refusal: typeof reason === 'string' && REFUSALS.has(reason) ? (reason as ChatRefusal) : null,
            details,
            correlationId: stringOrNull(error?.correlationId),
        });
    }

    static network(cause: unknown): ChatApiError {
        const error = new ChatApiError({
            status: 0,
            message: cause instanceof Error ? cause.message : 'The request did not reach chat-api',
        });
        error.cause = cause;

        return error;
    }
}

/** Narrows anything a hook caught, so a component never has to know how an error was made. */
export function isChatApiError(error: unknown): error is ChatApiError {
    return error instanceof ChatApiError;
}
