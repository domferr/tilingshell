/**
 * Chooses which layout dynamic tiling should follow for a given number of
 * windows.
 *
 * Pure: takes only the tile count of each candidate layout, in the user's
 * preferred order, and returns an index into that list.
 *
 * Order is preference. A layout that has exactly as many tiles as there are
 * windows is used as drawn, and the leftmost such layout wins. Failing that,
 * the smallest layout still large enough is collapsed to fit — collapsing as
 * little as possible — again leftmost among equals. Failing that, the
 * roomiest layout is subdivided.
 */
export function pickLayoutIndex(
    tileCounts: number[],
    windowCount: number,
): number {
    if (tileCounts.length === 0) return -1;

    const exact = tileCounts.indexOf(windowCount);
    if (exact >= 0) return exact;

    // Collapse as little as possible: the smallest tile count still large
    // enough, and the leftmost layout having it.
    let roomier = -1;
    for (let i = 0; i < tileCounts.length; i++) {
        if (tileCounts[i] <= windowCount) continue;
        if (roomier < 0 || tileCounts[i] < tileCounts[roomier]) roomier = i;
    }
    if (roomier >= 0) return roomier;

    let roomiest = 0;
    for (let i = 1; i < tileCounts.length; i++) {
        if (tileCounts[i] > tileCounts[roomiest]) roomiest = i;
    }
    return roomiest;
}

/**
 * Like `pickLayoutIndex`, but lets the caller step through every layout that
 * shares the picked one's tile count — a manual "use a different layout of
 * this size" override. `offset` is taken modulo the group size and may be
 * negative, so cycling forward and backward from any starting point always
 * lands on a member of the group. `offset` 0 always agrees with
 * `pickLayoutIndex`.
 */
export function pickLayoutIndexAt(
    tileCounts: number[],
    windowCount: number,
    offset: number,
): number {
    const picked = pickLayoutIndex(tileCounts, windowCount);
    if (picked < 0) return -1;

    const group = tileCounts
        .map((count, index) => ({ count, index }))
        .filter((entry) => entry.count === tileCounts[picked])
        .map((entry) => entry.index);

    const position = group.indexOf(picked);
    const wrapped = ((offset % group.length) + group.length) % group.length;
    return group[(position + wrapped) % group.length];
}
