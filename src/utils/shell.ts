export const logger =
  (prefix: string) =>
  (...content: any[]): void =>
    console.log('[tilingshell]', `[${prefix}]`, ...content);
