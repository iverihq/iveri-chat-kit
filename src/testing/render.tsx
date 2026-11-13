import type { Maybe, UUID } from '@iveri/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createChatClient, type ChatClient } from '../client/index.js';
import type { ChatMessages, ChatTranslate } from '../i18n/index.js';
import { ChatProvider } from '../provider/index.js';
import type { ChatSocketFactory } from '../realtime/index.js';
import type { ChatTheme } from '../theme/index.js';

import { createFetchStub } from './fetch-stub.js';
import { keyTranslate, ME } from './fixtures.js';

export interface TestHarness {
    queryClient: QueryClient;
    client: ChatClient;
    stub: ReturnType<typeof createFetchStub>;
    wrapper: (props: { children: ReactNode }) => React.JSX.Element;
}

/** The kit as an app mounts it: a real client over a stubbed `fetch`, a fresh query cache, the provider. */
export function createHarness(
    options: {
        realtimeUrl?: string;
        socketFactory?: ChatSocketFactory;
        /** `'bundled'` leaves the prop out, as a customer's app does, so the kit uses the words it carries. */
        translate?: ChatTranslate | 'bundled';
        messages?: ChatMessages;
        locale?: string;
        /** `'omit'` leaves the prop out, as a customer's app may; the default is `ME`. */
        currentUserId?: Maybe<UUID> | 'omit';
        realtimeTicket?: boolean;
        theme?: Partial<ChatTheme>;
    } = {},
): TestHarness {
    const stub = createFetchStub();
    const client = createChatClient({
        baseUrl: 'http://chat.test/api/v1',
        getAccessToken: () => 'token-1',
        fetch: stub.fetch,
    });
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });

    const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
        <QueryClientProvider client={queryClient}>
            <ChatProvider
                client={client}
                realtimeUrl={options.realtimeUrl}
                socketFactory={options.socketFactory}
                locale={options.locale ?? 'en'}
                timeZone="Asia/Tbilisi"
                {...(options.translate === 'bundled'
                    ? { messages: options.messages }
                    : { translate: options.translate ?? keyTranslate })}
                realtimeTicket={options.realtimeTicket}
                theme={options.theme}
                {...(options.currentUserId === 'omit' ? {} : { currentUserId: options.currentUserId ?? ME })}
            >
                {children}
            </ChatProvider>
        </QueryClientProvider>
    );

    return { queryClient, client, stub, wrapper };
}
