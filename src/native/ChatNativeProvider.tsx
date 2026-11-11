import type { ReactNode } from 'react';
import { useMemo } from 'react';

import {
    ChatNativeContext,
    DEFAULT_CHAT_NATIVE_THEME,
    type ChatNativeCapabilities,
    type ChatNativeContextValue,
    type ChatNativeTheme,
} from './native-context.js';

export interface ChatNativeProviderProps {
    /** Colours the app overrides, merged over the fleet's palette. */
    theme?: { color?: Partial<ChatNativeTheme['color']>; radius?: Partial<ChatNativeTheme['radius']> };
    capabilities?: ChatNativeCapabilities;
    resolveFontFamily?: ChatNativeContextValue['resolveFontFamily'];
    children?: ReactNode;
}

/** The native components' look and the device capabilities they may use. Optional: without it they use the fleet's palette and offer no attachments. */
export function ChatNativeProvider({
    theme,
    capabilities,
    resolveFontFamily,
    children,
}: Readonly<ChatNativeProviderProps>): React.JSX.Element {
    const value = useMemo<ChatNativeContextValue>(
        () => ({
            theme: {
                color: { ...DEFAULT_CHAT_NATIVE_THEME.color, ...theme?.color },
                radius: { ...DEFAULT_CHAT_NATIVE_THEME.radius, ...theme?.radius },
            },
            capabilities: capabilities ?? {},
            resolveFontFamily,
        }),
        [theme, capabilities, resolveFontFamily],
    );

    return <ChatNativeContext.Provider value={value}>{children}</ChatNativeContext.Provider>;
}
