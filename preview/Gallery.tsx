import type { UUID } from '@iveri/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlMessageFormat } from 'intl-messageformat';
import { useMemo, useState } from 'react';
import { namespace } from 'virtual:chat-kit-namespace';

import { ChatProvider, type ChatTranslate } from '../src/index.js';
import { ME } from '../src/testing/fixtures.js';
import { createMemoryClient, type GalleryCopy } from '../src/testing/memory-client.js';
import { ChatInbox, ChatThread, GroupInfo } from '../src/web/index.js';

const COPY: Record<'en' | 'ka', GalleryCopy> = {
    en: {
        nino: 'Nino Beridze',
        giorgi: 'Giorgi Bakradze',
        me: 'Tamar',
        group: 'Saturday dinner',
        lines: [
            'Are you still coming on Saturday?',
            'Yes, I will be there by seven.',
            'Great. I booked the table by the window.',
            'Perfect, see you at the bakery first?',
            'Here is the menu they sent.',
            'Who is bringing the cake?',
            'I can, if somebody reminds me on Friday.',
            'I will remind you. Twice.',
            'I am at the corner by the pharmacy.',
            'Hello! Ana from the climbing club here.',
        ],
    },
    ka: {
        nino: 'ნინო ბერიძე',
        giorgi: 'გიორგი ბაქრაძე',
        me: 'თამარი',
        group: 'შაბათის ვახშამი',
        lines: [
            'შაბათს მაინც მოდიხარ?',
            'კი, შვიდისთვის იქ ვიქნები.',
            'მშვენიერია. ფანჯარასთან მაგიდა დავჯავშნე.',
            'კარგი, ჯერ საცხობთან ხომ შევხვდებით?',
            'აი, მენიუ, რომელიც გამოგვიგზავნეს.',
            'ტორტს ვინ მოიტანს?',
            'მე შემიძლია, თუ პარასკევს ვინმე შემახსენებს.',
            'შეგახსენებ. ორჯერ.',
            'აფთიაქთან, კუთხეში ვარ.',
            'გამარჯობა! ანა ვარ, ცოცვის კლუბიდან.',
        ],
    },
};

function translatorFor(locale: 'en' | 'ka'): ChatTranslate {
    const values = new Map(namespace.messages.map((message) => [message.key, message.values[locale]]));

    return (key, variables) => {
        const pattern = values.get(key);
        if (pattern === undefined) return key;
        try {
            return String(new IntlMessageFormat(pattern, locale).format(variables));
        } catch {
            return pattern;
        }
    };
}

/** One messenger as an app would mount it: an inbox beside a thread, a thread alone on a phone. */
function Messenger({ locale }: Readonly<{ locale: 'en' | 'ka' }>): React.JSX.Element {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => createMemoryClient(COPY[locale], new Date()));
    const translate = useMemo(() => translatorFor(locale), [locale]);
    const [selected, setSelected] = useState<UUID | null>('aaaaaaaa-aaaa-4aaa-8aaa-000000000001' as UUID);
    const [details, setDetails] = useState(false);

    return (
        <QueryClientProvider client={queryClient}>
            <ChatProvider client={client} locale={locale} translate={translate} currentUserId={ME}>
                <div className="flex h-[min(780px,100dvh)] overflow-hidden rounded-panel border border-line bg-surface shadow-md">
                    <div
                        className={
                            selected === null
                                ? 'w-full md:w-[360px] md:shrink-0 md:border-e md:border-line'
                                : 'hidden md:block md:w-[360px] md:shrink-0 md:border-e md:border-line'
                        }
                    >
                        <ChatInbox
                            selectedConversationId={selected}
                            onSelectConversation={(id) => {
                                setSelected(id);
                                setDetails(false);
                            }}
                            onNewConversation={() => undefined}
                            heading={<h2 className="font-display text-h2 font-bold text-ink">Baasi</h2>}
                        />
                    </div>
                    {selected !== null && (
                        <div className="flex min-w-0 flex-1">
                            <div className="min-w-0 flex-1">
                                <ChatThread
                                    conversationId={selected}
                                    onBack={() => {
                                        setSelected(null);
                                    }}
                                    onOpenDetails={() => {
                                        setDetails(true);
                                    }}
                                />
                            </div>
                            {details && (
                                <div className="hidden w-80 shrink-0 border-s border-line lg:block">
                                    <GroupInfo
                                        conversationId={selected}
                                        inviteLinkFor={(code) => `https://baasi.example/join/${code}`}
                                        onClose={() => {
                                            setDetails(false);
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ChatProvider>
        </QueryClientProvider>
    );
}

export function Gallery(): React.JSX.Element {
    const [locale, setLocale] = useState<'en' | 'ka'>('en');

    return (
        <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-8">
            <header className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                    <h1 className="font-display text-h1 font-bold text-ink">@iveri/chat-kit</h1>
                    <p className="text-small text-muted">
                        The web components, against an in-memory chat-api, with the published chat-kit strings.
                    </p>
                </div>
                <div role="group" aria-label="Language" className="inline-flex rounded-control bg-sunken p-0.5">
                    {(['en', 'ka'] as const).map((entry) => (
                        <button
                            key={entry}
                            type="button"
                            aria-pressed={locale === entry}
                            onClick={() => {
                                setLocale(entry);
                            }}
                            className={
                                locale === entry
                                    ? 'rounded-control bg-surface px-3 py-1.5 text-label font-semibold text-ink shadow-sm'
                                    : 'px-3 py-1.5 text-label text-muted'
                            }
                        >
                            {entry === 'en' ? 'English' : 'ქართული'}
                        </button>
                    ))}
                </div>
            </header>
            <Messenger key={locale} locale={locale} />
        </main>
    );
}
