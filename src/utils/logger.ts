export const logger =
    (prefix: string) =>
    (...content: unknown[]): void =>
        console.log('[tilingshell]', `[${prefix}]`, ...content);
