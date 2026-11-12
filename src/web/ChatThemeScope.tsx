import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';

import { useChatContext } from '../provider/index.js';
import { chatThemeVariables } from '../theme/index.js';

/**
 * Puts the `ChatProvider` theme's `--baasi-*` custom properties on an element every kit component inside
 * it inherits them from. `ChatInbox`, `ChatThread` and every dialog wrap themselves in one, so an app needs
 * it only for a kit component it mounts on its own.
 *
 * `display: contents`, so it adds no box and no layout: a `h-full` child still measures against the app's
 * container. **With no theme it renders nothing of its own**, which is what keeps today's look byte for byte.
 */
export function ChatThemeScope({ children }: Readonly<{ children?: ReactNode }>): React.JSX.Element {
    const { theme } = useChatContext();
    const style = useMemo<CSSProperties | null>(() => {
        const variables = chatThemeVariables(theme);
        if (Object.keys(variables).length === 0) return null;

        return {
            ...variables,
            display: 'contents',
            ...('--baasi-font-family' in variables ? { fontFamily: 'var(--baasi-font-family)' } : {}),
        };
    }, [theme]);

    if (style === null) return <>{children}</>;

    return (
        <div data-baasi-theme="" style={style}>
            {children}
        </div>
    );
}
