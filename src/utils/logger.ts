export function rect_to_string(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
}) {
    return `{x: ${rect.x}, y: ${rect.y}, width: ${rect.width}, height: ${rect.height}}`;
}

export const logger =
    (prefix: string) =>
    (...content: unknown[]): void =>
        console.log('[tilingshell]', `[${prefix}]`, ...content);
