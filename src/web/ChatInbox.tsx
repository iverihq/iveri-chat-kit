import type { Maybe, UUID } from '@iveri/contracts';
import type { ChatInboxFolder } from '@iveri/contracts/chat';
import type { KeyboardEvent, ReactNode } from 'react';
import { useId, useRef, useState } from 'react';

import { useChatContext, useChatRealtime, useChatText, useNow } from '../provider/index.js';
import { useInbox, useMessageSearch } from '../query/index.js';
import { conversationHeading, formatInboxTime, productText } from '../util/index.js';

import { ArchiveIcon, ChatBubblesIcon, CloseIcon, PlusIcon, SearchIcon } from './icons.js';
import { InboxRow } from './InboxRow.js';
import { cn, FOCUS_RING, ICON_BUTTON, PRIMARY_BUTTON, QUIET_BUTTON } from './style.js';

const FOLDERS: readonly ChatInboxFolder[] = ['inbox', 'requests', 'archived'];

const FOLDER_LABEL = {
    inbox: 'chat.inbox.tab.inbox',
    requests: 'chat.inbox.tab.requests',
    archived: 'chat.inbox.tab.archived',
} as const;

const EMPTY_TITLE = {
    inbox: 'chat.inbox.empty.inbox',
    requests: 'chat.inbox.empty.requests',
    archived: 'chat.inbox.empty.archived',
} as const;

const EMPTY_HINT = {
    inbox: 'chat.inbox.empty.inbox-hint',
    requests: 'chat.inbox.empty.requests-hint',
    archived: 'chat.inbox.empty.archived-hint',
} as const;

export interface ChatSelectOptions {
    /** A message to open the conversation at: a search hit. */
    seq?: number;
}

export interface ChatInboxProps {
    onSelectConversation: (conversationId: UUID, options?: ChatSelectOptions) => void;
    selectedConversationId?: Maybe<UUID>;
    /** Narrows to one product's conversations: Ezo's Messages page passes `'social'`. */
    product?: Maybe<string>;
    /** Controlled folder; uncontrolled (starting at the inbox) when absent. */
    folder?: ChatInboxFolder;
    onFolderChange?: (folder: ChatInboxFolder) => void;
    /** Shows a "New conversation" button. Only in the Baasi network, where a person can start one. */
    onNewConversation?: () => void;
    /** Off for a product page that only ever has one kind of conversation. */
    showFolders?: boolean;
    showSearch?: boolean;
    /** Drawn above the search: the page's own title, in the app's own words. */
    heading?: ReactNode;
    className?: string;
}

function SkeletonRows(): React.JSX.Element {
    return (
        <ul aria-hidden="true" className="flex flex-col gap-1 px-2 py-2">
            {[0, 1, 2, 3, 4].map((row) => (
                <li key={row} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="h-11 w-11 shrink-0 animate-shimmer rounded-full bg-linear-to-r from-sunken via-raised to-sunken bg-[length:200%_100%]" />
                    <span className="flex flex-1 flex-col gap-2">
                        <span className="h-3.5 w-2/5 animate-shimmer rounded-full bg-linear-to-r from-sunken via-raised to-sunken bg-[length:200%_100%]" />
                        <span className="h-3 w-4/5 animate-shimmer rounded-full bg-linear-to-r from-sunken via-raised to-sunken bg-[length:200%_100%]" />
                    </span>
                </li>
            ))}
        </ul>
    );
}

function EmptyState({
    title,
    hint,
    icon,
}: Readonly<{ title: string; hint: string; icon: ReactNode }>): React.JSX.Element {
    return (
        <div className="flex flex-col items-center px-8 py-14 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                {icon}
            </span>
            <p className="font-display text-h3 font-semibold text-ink">{title}</p>
            <p className="mt-1 max-w-xs text-small text-muted">{hint}</p>
        </div>
    );
}

/**
 * The list of conversations: three folders, a search over them and over my own messages, and a row per
 * conversation with what is unread. A component on its own, so a desktop page can show it beside
 * `ChatThread` and a phone can show one at a time.
 */
export function ChatInbox({
    onSelectConversation,
    selectedConversationId,
    product,
    folder: controlledFolder,
    onFolderChange,
    onNewConversation,
    showFolders = true,
    showSearch = true,
    heading,
    className,
}: Readonly<ChatInboxProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone } = useChatContext();
    const now = useNow();
    useChatRealtime();

    const [ownFolder, setOwnFolder] = useState<ChatInboxFolder>('inbox');
    const folder = controlledFolder ?? ownFolder;
    const [search, setSearch] = useState('');
    const inbox = useInbox(folder, { product });
    const messageSearch = useMessageSearch(showSearch ? search : '');
    const tabsId = useId();
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const chooseFolder = (next: ChatInboxFolder): void => {
        setOwnFolder(next);
        onFolderChange?.(next);
    };

    const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = (index + step + FOLDERS.length) % FOLDERS.length;
        chooseFolder(FOLDERS[next]);
        tabRefs.current[next]?.focus();
    };

    const query = search.trim().toLocaleLowerCase(locale);
    const isSearching = query.length > 0;
    const matches = isSearching
        ? inbox.conversations.filter((conversation) => {
              const { title, label, subtitle } = conversationHeading(conversation, translate);
              const handle = conversation.other?.handle ?? '';

              return [title, label ?? '', subtitle ?? '', handle].some((text) =>
                  text.toLocaleLowerCase(locale).includes(query),
              );
          })
        : inbox.conversations;

    const renderRows = (): React.JSX.Element => (
        <ul className="flex flex-col gap-0.5">
            {matches.map((conversation) => (
                <InboxRow
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={conversation.id === selectedConversationId}
                    now={now}
                    onSelect={() => {
                        onSelectConversation(conversation.id);
                    }}
                />
            ))}
        </ul>
    );

    const renderBody = (): React.JSX.Element => {
        if (inbox.isLoading) return <SkeletonRows />;

        if (inbox.isError) {
            return (
                <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <p className="text-body text-ink-soft">{t('chat.inbox.error')}</p>
                    <button type="button" className={QUIET_BUTTON} onClick={inbox.refetch}>
                        {t('chat.common.retry')}
                    </button>
                </div>
            );
        }

        if (isSearching) {
            const hasNothing = matches.length === 0 && messageSearch.results.length === 0 && !messageSearch.isFetching;

            return (
                <div className="flex flex-col gap-4 px-2 py-2">
                    {matches.length > 0 && (
                        <section aria-label={t('chat.inbox.search.conversations')}>
                            <h3 className="px-3 pb-1 text-caption font-semibold text-faint">
                                {t('chat.inbox.search.conversations')}
                            </h3>
                            {renderRows()}
                        </section>
                    )}
                    {messageSearch.results.length > 0 && (
                        <section aria-label={t('chat.inbox.search.messages')}>
                            <h3 className="px-3 pb-1 text-caption font-semibold text-faint">
                                {t('chat.inbox.search.messages')}
                            </h3>
                            <ul className="flex flex-col gap-0.5">
                                {messageSearch.results.map((hit) => (
                                    <li key={hit.messageId}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSelectConversation(hit.conversationId, { seq: hit.seq });
                                            }}
                                            className={cn(
                                                'flex w-full flex-col gap-0.5 rounded-card px-3 py-2 text-start hover:bg-raised',
                                                FOCUS_RING,
                                            )}
                                        >
                                            <span className="flex items-baseline gap-2">
                                                <span className="truncate text-label font-semibold text-ink">
                                                    {productText(hit.conversationTitle, translate)}
                                                </span>
                                                <span className="ms-auto shrink-0 text-caption text-faint tabular-nums">
                                                    {formatInboxTime(hit.sentAt, translate, { locale, timeZone, now })}
                                                </span>
                                            </span>
                                            <span className="line-clamp-2 text-small text-muted">
                                                {hit.senderName === null
                                                    ? hit.excerpt
                                                    : t('chat.preview.sender', {
                                                          name: hit.senderName,
                                                          text: hit.excerpt,
                                                      })}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    {hasNothing && (
                        <p className="px-6 py-10 text-center text-small text-muted">
                            {t('chat.inbox.search.empty', { query: search.trim() })}
                        </p>
                    )}
                </div>
            );
        }

        if (matches.length === 0) {
            return (
                <EmptyState
                    title={t(EMPTY_TITLE[folder])}
                    hint={t(EMPTY_HINT[folder])}
                    icon={folder === 'archived' ? <ArchiveIcon /> : <ChatBubblesIcon />}
                />
            );
        }

        return (
            <div className="px-2 py-2">
                {renderRows()}
                {inbox.hasMore && (
                    <div className="flex justify-center py-3">
                        <button
                            type="button"
                            className={QUIET_BUTTON}
                            disabled={inbox.isLoadingMore}
                            onClick={inbox.loadMore}
                        >
                            {inbox.isLoadingMore ? t('chat.common.loading') : t('chat.common.show-more')}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <section className={cn('flex h-full min-h-0 flex-col bg-surface', className)}>
            <header className="flex flex-col gap-3 border-b border-line px-4 pt-4 pb-3">
                {(heading !== undefined || onNewConversation !== undefined) && (
                    <div className="flex min-h-10 items-center gap-3">
                        <div className="min-w-0 flex-1">{heading}</div>
                        {onNewConversation !== undefined && (
                            <button
                                type="button"
                                className={cn(PRIMARY_BUTTON, 'min-h-9 px-3')}
                                onClick={onNewConversation}
                            >
                                <PlusIcon className="h-4 w-4" />
                                <span>{t('chat.inbox.new')}</span>
                            </button>
                        )}
                    </div>
                )}
                {showSearch && (
                    <div className="relative">
                        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-faint" />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                            }}
                            aria-label={t('chat.inbox.search.label')}
                            placeholder={t('chat.inbox.search.placeholder')}
                            className={cn(
                                'block w-full rounded-control border border-transparent bg-sunken py-2 ps-9 pe-9 text-body text-ink placeholder:text-faint',
                                'transition-colors duration-fast hover:border-line focus:border-accent focus:bg-surface',
                                '[&::-webkit-search-cancel-button]:hidden',
                                FOCUS_RING,
                            )}
                        />
                        {search.length > 0 && (
                            <button
                                type="button"
                                aria-label={t('chat.inbox.search.clear')}
                                onClick={() => {
                                    setSearch('');
                                }}
                                className={cn(ICON_BUTTON, 'absolute end-0.5 top-1/2 h-8 w-8 -translate-y-1/2')}
                            >
                                <CloseIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                )}
                {showFolders && !isSearching && (
                    <div
                        role="tablist"
                        aria-label={t('chat.inbox.tabs')}
                        className="flex gap-0.5 rounded-control bg-sunken p-0.5"
                    >
                        {FOLDERS.map((entry, index) => {
                            const isSelected = entry === folder;

                            return (
                                <button
                                    key={entry}
                                    ref={(node) => {
                                        tabRefs.current[index] = node;
                                    }}
                                    type="button"
                                    role="tab"
                                    id={`${tabsId}-${entry}`}
                                    aria-selected={isSelected}
                                    aria-controls={`${tabsId}-panel`}
                                    tabIndex={isSelected ? 0 : -1}
                                    onClick={() => {
                                        chooseFolder(entry);
                                    }}
                                    onKeyDown={(event) => {
                                        onTabKeyDown(event, index);
                                    }}
                                    className={cn(
                                        'min-h-8 flex-auto rounded-[calc(var(--radius-control)-2px)] px-2.5 text-label whitespace-nowrap transition-colors duration-fast',
                                        isSelected
                                            ? 'bg-surface font-semibold text-ink shadow-sm'
                                            : 'font-medium text-muted hover:text-ink',
                                        FOCUS_RING,
                                    )}
                                >
                                    {t(FOLDER_LABEL[entry])}
                                </button>
                            );
                        })}
                    </div>
                )}
            </header>
            <div
                id={`${tabsId}-panel`}
                role={showFolders && !isSearching ? 'tabpanel' : undefined}
                aria-labelledby={showFolders && !isSearching ? `${tabsId}-${folder}` : undefined}
                className="min-h-0 flex-1 overflow-y-auto"
            >
                {renderBody()}
            </div>
        </section>
    );
}
