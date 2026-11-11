export interface RecordedRequest {
    method: string;
    path: string;
    query: URLSearchParams;
    body: unknown;
    authorization: string | null;
}

type Handler = (request: RecordedRequest) => { status?: number; body?: unknown } | undefined;

/**
 * A `fetch` for specs: answers by method and path, records every request. The HTTP boundary is the only
 * thing faked; the client, the hooks and the cache above it are the real ones.
 */
export function createFetchStub(baseUrl = 'http://chat.test/api/v1'): {
    fetch: typeof fetch;
    requests: RecordedRequest[];
    on: (method: string, path: string | RegExp, handler: Handler) => void;
} {
    const requests: RecordedRequest[] = [];
    const routes: { method: string; path: string | RegExp; handler: Handler }[] = [];

    const stub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const headers = new Headers(init?.headers);
        const request: RecordedRequest = {
            method: init?.method ?? 'GET',
            path: url.pathname.replace(new URL(baseUrl).pathname, ''),
            query: url.searchParams,
            body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
            authorization: headers.get('Authorization'),
        };
        requests.push(request);
        await Promise.resolve();

        // Last registered wins, so a spec can override a default route.
        const route = [...routes]
            .reverse()
            .find(
                (candidate) =>
                    candidate.method === request.method &&
                    (typeof candidate.path === 'string'
                        ? candidate.path === request.path
                        : candidate.path.test(request.path)),
            );
        const answer = route?.handler(request) ?? {
            status: 404,
            body: { success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'No route' } },
        };
        const status = answer.status ?? 200;

        return new Response(status === 204 || answer.body === undefined ? null : JSON.stringify(answer.body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    return {
        fetch: stub,
        requests,
        on: (method, path, handler): void => {
            routes.push({ method, path, handler });
        },
    };
}
