import type { UUID } from '@iveri/contracts';
import { CHAT_GROUP_TITLE_MAX_LENGTH } from '@iveri/contracts/chat';
import type { ChatPersonCard } from '@iveri/contracts/chat';
import { useId, useState } from 'react';

import { useChatContext, useChatText } from '../provider/index.js';
import {
    useAddChatMembers,
    useContacts,
    useCreateGroupChat,
    usePeopleSearch,
    useStartDirectChat,
} from '../query/index.js';
import { describeError } from '../util/index.js';

import { ChatAvatar } from './ChatAvatar.js';
import { ChatDialog } from './ChatDialog.js';
import { CheckIcon, CloseIcon, SearchIcon } from './icons.js';
import { cn, FOCUS_RING, PRIMARY_BUTTON, QUIET_BUTTON, TEXT_INPUT } from './style.js';

export type PersonPickerMode = 'direct' | 'group' | 'add';

export interface PersonPickerProps {
    mode: PersonPickerMode;
    /** The group people are added to, for `add`. */
    conversationId?: UUID;
    /** People already in it, who are not offered again. */
    excludeUserIds?: readonly UUID[];
    /** With the conversation that was opened, created or added to. */
    onDone: (conversationId: UUID) => void;
    onClose: () => void;
}

/**
 * Finding people in Baasi to talk to: one for a one-to-one conversation, several for a new group or to
 * add to one. Contacts are offered before anything is typed; search starts at two characters and never
 * shows anybody either side has blocked, because the server leaves them out. Network only: a product's
 * screen never draws this, since a person there cannot start a conversation.
 */
export function PersonPicker({
    mode,
    conversationId,
    excludeUserIds = [],
    onDone,
    onClose,
}: Readonly<PersonPickerProps>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<ChatPersonCard[]>([]);
    const [groupTitle, setGroupTitle] = useState('');
    const [problem, setProblem] = useState<string | null>(null);
    const search = usePeopleSearch(query);
    const contacts = useContacts();
    const startDirect = useStartDirectChat();
    const createGroup = useCreateGroupChat();
    const addMembers = useAddChatMembers();
    const titleId = useId();
    const isMulti = mode !== 'direct';
    const isWorking = startDirect.isPending || createGroup.isPending || addMembers.isPending;

    const excluded = new Set<UUID>(excludeUserIds);
    const people = (search.isActive ? search.results : (contacts.data ?? []).map((contact) => contact.person)).filter(
        (person) => !excluded.has(person.userId),
    );
    const isSelected = (person: ChatPersonCard): boolean => selected.some((entry) => entry.userId === person.userId);

    const run = async (work: () => Promise<{ id: UUID }>): Promise<void> => {
        setProblem(null);
        try {
            const conversation = await work();
            onDone(conversation.id);
        } catch (error: unknown) {
            setProblem(describeError(error, translate));
        }
    };

    const choose = (person: ChatPersonCard): void => {
        if (!isMulti) {
            void run(() => startDirect.mutateAsync({ userId: person.userId }));

            return;
        }
        setSelected((current) =>
            isSelected(person) ? current.filter((entry) => entry.userId !== person.userId) : [...current, person],
        );
    };

    const finish = (): void => {
        if (selected.length === 0) {
            setProblem(t('chat.people.members-required'));

            return;
        }
        if (mode === 'group') {
            const title = groupTitle.trim();
            if (title.length === 0) {
                setProblem(t('chat.people.group-name-required'));

                return;
            }
            void run(() => createGroup.mutateAsync({ title, memberUserIds: selected.map((person) => person.userId) }));

            return;
        }
        if (conversationId !== undefined) {
            void run(() =>
                addMembers.mutateAsync({ conversationId, userIds: selected.map((person) => person.userId) }),
            );
        }
    };

    const title =
        mode === 'direct'
            ? t('chat.people.title-direct')
            : mode === 'group'
              ? t('chat.people.title-group')
              : t('chat.people.title-add');

    return (
        <ChatDialog
            title={title}
            onClose={onClose}
            footer={
                isMulti ? (
                    <>
                        <button type="button" className={QUIET_BUTTON} onClick={onClose}>
                            {t('chat.common.cancel')}
                        </button>
                        <button type="button" className={PRIMARY_BUTTON} disabled={isWorking} onClick={finish}>
                            {mode === 'group' ? t('chat.people.create-group') : t('chat.people.add')}
                        </button>
                    </>
                ) : undefined
            }
        >
            <div className="flex flex-col gap-4">
                {mode === 'group' && (
                    <div className="flex flex-col gap-2">
                        <label htmlFor={titleId} className="text-label font-medium text-ink-soft">
                            {t('chat.people.group-name')}
                        </label>
                        <input
                            id={titleId}
                            value={groupTitle}
                            maxLength={CHAT_GROUP_TITLE_MAX_LENGTH}
                            onChange={(event) => {
                                setGroupTitle(event.target.value);
                            }}
                            className={TEXT_INPUT}
                        />
                    </div>
                )}

                {isMulti && selected.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <p className="text-caption font-semibold text-faint">
                            {t('chat.people.selected', { count: selected.length })}
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                            {selected.map((person) => (
                                <li key={person.userId}>
                                    <button
                                        type="button"
                                        aria-label={t('chat.people.deselect', { name: person.displayName })}
                                        onClick={() => {
                                            choose(person);
                                        }}
                                        className={cn(
                                            'flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft py-0.5 ps-0.5 pe-2 text-caption font-medium text-accent',
                                            FOCUS_RING,
                                        )}
                                    >
                                        <ChatAvatar name={person.displayName} image={person.avatar} size="xs" />
                                        {person.displayName}
                                        <CloseIcon className="h-3.5 w-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="relative">
                    <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-faint" />
                    <input
                        type="search"
                        value={query}
                        autoFocus
                        onChange={(event) => {
                            setQuery(event.target.value);
                        }}
                        aria-label={t('chat.people.search')}
                        placeholder={t('chat.people.search-placeholder')}
                        className={cn(TEXT_INPUT, 'ps-9')}
                    />
                </div>

                <section aria-label={search.isActive ? t('chat.people.results') : t('chat.people.contacts')}>
                    <h3 className="pb-1 text-caption font-semibold text-faint">
                        {search.isActive ? t('chat.people.results') : t('chat.people.contacts')}
                    </h3>
                    {query.trim().length > 0 && !search.isActive && (
                        <p className="py-3 text-small text-muted">{t('chat.people.search-hint')}</p>
                    )}
                    {search.isActive && !search.isFetching && people.length === 0 && (
                        <p className="py-3 text-small text-muted">{t('chat.people.empty', { query: search.query })}</p>
                    )}
                    <ul className="flex flex-col gap-0.5">
                        {people.map((person) => {
                            const chosen = isSelected(person);

                            return (
                                <li key={person.userId}>
                                    <button
                                        type="button"
                                        disabled={isWorking}
                                        aria-pressed={isMulti ? chosen : undefined}
                                        aria-label={
                                            isMulti
                                                ? t(chosen ? 'chat.people.deselect' : 'chat.people.select', {
                                                      name: person.displayName,
                                                  })
                                                : `${person.displayName}. ${t('chat.people.message')}`
                                        }
                                        onClick={() => {
                                            choose(person);
                                        }}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-card px-2.5 py-2 text-start transition-colors duration-fast hover:bg-raised',
                                            chosen && 'bg-accent-soft',
                                            FOCUS_RING,
                                        )}
                                    >
                                        <ChatAvatar
                                            name={person.displayName}
                                            image={person.avatar}
                                            size="sm"
                                            className="h-10 w-10"
                                        />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-body font-medium text-ink">
                                                {person.displayName}
                                            </span>
                                            {person.handle !== null && (
                                                <span className="truncate text-caption text-muted">
                                                    @{person.handle}
                                                </span>
                                            )}
                                        </span>
                                        {isMulti && (
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    'flex h-5 w-5 items-center justify-center rounded-full border',
                                                    chosen
                                                        ? 'border-accent bg-accent text-accent-ink'
                                                        : 'border-line-strong',
                                                )}
                                            >
                                                {chosen && <CheckIcon className="h-3.5 w-3.5" />}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>

                {problem !== null && (
                    <p role="alert" className="text-small text-critical">
                        {problem}
                    </p>
                )}
            </div>
        </ChatDialog>
    );
}
