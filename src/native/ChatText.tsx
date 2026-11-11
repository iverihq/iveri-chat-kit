import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useChatNative, type ChatTextWeight } from './native-context.js';

function textOf(children: ReactNode): string {
    if (typeof children === 'string') return children;
    if (typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(textOf).join('');

    return '';
}

function weightOf(value: unknown): ChatTextWeight {
    const weight = typeof value === 'number' ? String(value) : value;
    if (weight === 'bold' || weight === '700' || weight === '800' || weight === '900') return '700';
    if (weight === '600' || weight === '500') return weight;

    return '400';
}

/**
 * Every piece of text the native components draw, set in the face the app's rule picks for that run
 * (`resolveFontFamily`), because React Native names one face per run and has no fallback for a script
 * the face lacks. When the rule picks a face, the weight is cleared: a static face already is its
 * weight, and leaving it lets Android synthesise a bold on top of one.
 */
export function ChatText({
    style,
    children,
    ...rest
}: Readonly<TextProps & { children?: ReactNode }>): React.JSX.Element {
    const { resolveFontFamily, theme } = useChatNative();
    const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
    const fontFamily = resolveFontFamily?.(textOf(children), weightOf(flattened?.fontWeight));

    return (
        <Text
            {...rest}
            style={[
                { color: theme.color.ink },
                style,
                fontFamily === undefined ? null : { fontFamily, fontWeight: undefined },
            ]}
        >
            {children}
        </Text>
    );
}
