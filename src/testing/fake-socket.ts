import type { ChatSocket, ChatSocketFactory, ChatSocketOptions } from '../realtime/index.js';

/** A Socket.IO client stand-in: records what was asked of it, and lets a spec play the gateway's part. */
export class FakeSocket implements ChatSocket {
    connected = false;
    connectCalls = 0;
    disconnectCalls = 0;
    readonly listeners = new Map<string, ((...args: never[]) => void)[]>();

    constructor(
        readonly url: string,
        readonly options: ChatSocketOptions,
    ) {}

    on(event: string, listener: (...args: never[]) => void): this {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);

        return this;
    }

    connect(): this {
        this.connectCalls += 1;

        return this;
    }

    disconnect(): this {
        this.disconnectCalls += 1;
        this.connected = false;

        return this;
    }

    /** What the gateway sends, as the client would receive it. */
    emit(event: string, ...args: unknown[]): void {
        if (event === 'connect') this.connected = true;
        for (const listener of this.listeners.get(event) ?? []) (listener as (...values: unknown[]) => void)(...args);
    }

    /** Starts an attempt, as Socket.IO does on every connection, without waiting for its credential. */
    attempt(): void {
        this.options.auth(() => undefined);
    }

    /** The token the socket would present, read through its `auth` callback as Socket.IO does. */
    async presentedToken(): Promise<unknown> {
        return new Promise((resolve) => {
            this.options.auth((data) => {
                resolve(data.token);
            });
        });
    }
}

export function fakeSocketFactory(): { factory: ChatSocketFactory; sockets: FakeSocket[] } {
    const sockets: FakeSocket[] = [];

    return {
        sockets,
        factory: (url, options): FakeSocket => {
            const socket = new FakeSocket(url, options);
            sockets.push(socket);

            return socket;
        },
    };
}
