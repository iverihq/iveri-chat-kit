import type { ChatParticipant } from '@iveri/contracts/chat';

import { useChatText } from '../provider/index.js';

import { ChatAvatar } from './ChatAvatar.js';
import { cn } from './style.js';

export interface MentionPickerProps {
    id: string;
    people: readonly ChatParticipant[];
    activeIndex: number;
    onPick: (person: ChatParticipant) => void;
}

/**
 * The people an `@` being typed could name, over the composer. The field keeps focus and drives it (arrows, Enter or
 * Tab to pick, Escape to close) through `aria-activedescendant`, so typing never stops to reach a list.
 */
export function MentionPicker({ id, people, activeIndex, onPick }: Readonly<MentionPickerProps>): React.JSX.Element {
    const t = useChatText();

    return (
        <ul
            id={id}
            role="listbox"
            aria-label={t('chat.mention.picker')}
            className="mb-2 max-h-56 overflow-y-auto rounded-chat-panel border border-chat-line bg-chat-surface py-1 shadow-md"
        >
            {people.map((person, index) => (
                <li
                    key={person.userId}
                    id={`${id}-${person.userId}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    // Down rather than click, so the field does not lose focus first.
                    onMouseDown={(event) => {
                        event.preventDefault();
                        onPick(person);
                    }}
                    className={cn(
                        'flex cursor-pointer items-center gap-3 px-3 py-2 text-small text-chat-ink',
                        index === activeIndex ? 'bg-chat-accent-soft' : 'hover:bg-chat-canvas',
                    )}
                >
                    <ChatAvatar name={person.displayName} image={person.avatar} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-medium">{person.displayName}</span>
                    {person.handle !== null && <span className="truncate text-chat-muted">@{person.handle}</span>}
                </li>
            ))}
        </ul>
    );
}
