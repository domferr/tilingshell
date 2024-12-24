import { registerGObjectClass } from '@utils/gjs';
import { Clutter } from '@gi.ext';

const MASONRY_ROW_MIN_HEIGHT_PERCENTAGE = 0.15;

interface ContainerWithAllocationCache extends Clutter.Actor {
    _allocationCache:
        | Map<
              Clutter.Actor,
              { x: number; y: number; width: number; height: number }
          >
        | undefined;
}

@registerGObjectClass
export default class MasonryLayoutManager extends Clutter.LayoutManager {
    private _rowCount: number;
    private _spacing: number;
    private _maxRowHeight: number;
    private _rowHeight: number;

    constructor(spacing: number, rowHeight: number, maxRowHeight: number) {
        super();
        this._rowCount = 0; // Number of rows
        this._spacing = spacing; // Spacing between items
        this._maxRowHeight = maxRowHeight;
        this._rowHeight = rowHeight;
    }

    vfunc_allocate(container: Clutter.Actor, box: Clutter.ActorBox) {
        const children = container.get_children();
        if (children.length === 0) return;

        this._rowCount = Math.ceil(Math.sqrt(children.length)) + 1;
        let rowHeight = 0;
        while (
            this._rowCount > 1 &&
            rowHeight < box.get_height() * MASONRY_ROW_MIN_HEIGHT_PERCENTAGE
        ) {
            this._rowCount--;
            rowHeight =
                (box.get_height() - this._spacing * (this._rowCount - 1)) /
                this._rowCount;
        }
        rowHeight = Math.min(rowHeight, this._maxRowHeight);
        rowHeight = this._rowHeight;
        const rowWidths = Array(this._rowCount).fill(0); // Tracks the width of each row

        // Calculate total content height and width
        const contentHeight =
            rowHeight * this._rowCount + this._spacing * (this._rowCount - 1);

        // Store placements and cache
        const placements = [];
        const allocationCache =
            (container as ContainerWithAllocationCache)._allocationCache ??
            new Map();

        for (const child of children) {
            // Retrieve the preferred height and width to calculate the aspect ratio
            const [minHeight, naturalHeight] = child.get_preferred_height(-1);
            const [minWidth, naturalWidth] =
                child.get_preferred_width(naturalHeight);

            // Maintain the aspect ratio
            const aspectRatio = naturalWidth / naturalHeight;
            const width = rowHeight * aspectRatio;

            // Find the shortest row
            // This might not look efficient, but the number of rows is
            // very low so is not going to affect performance
            let shortestRow = rowWidths.indexOf(Math.min(...rowWidths));
            if (
                rowWidths[shortestRow] + width > container.width &&
                rowWidths[shortestRow] !== 0
            ) {
                shortestRow = rowWidths.length;
                rowWidths.push(0);
                this._rowCount++;
            }

            placements.push({
                child,
                row: shortestRow,
                width,
                x: rowWidths[shortestRow],
                rowWidth: 0,
            });

            // Update row height
            rowWidths[shortestRow] += width + this._spacing;
        }
        for (const placement of placements)
            placement.rowWidth = rowWidths[placement.row];

        const sortedRowWidths: number[][] = [...rowWidths].map((v, i) => [
            v,
            i,
        ]);
        sortedRowWidths.sort((a, b) => b[0] - a[0]);
        const rowsOrdering = new Map<number, number>();
        sortedRowWidths.forEach((row, newIndex) => {
            const index = row[1];
            rowsOrdering.set(
                index,
                (newIndex + Math.floor(this._rowCount / 2)) % this._rowCount,
            );
        });
        for (const placement of placements)
            placement.row = rowsOrdering.get(placement.row) ?? placement.row;

        // Calculate offsets for centering the entire grid within the available space
        const verticalOffset = Math.max(
            this._spacing,
            (box.get_height() - contentHeight) / 2,
        );
        // Determine the largest row and center the content around it
        const largestRowWidth = sortedRowWidths[0][0];
        const horizontalOffset = (box.get_width() - largestRowWidth) / 2;

        // Reset row heights for actual allocation
        rowWidths.fill(0);

        // Allocate children with preserved proportions
        for (const placement of placements) {
            const { child, row, width, x, rowWidth } = placement;
            const y =
                box.y1 + row * (rowHeight + this._spacing) + verticalOffset;
            const rowOffset = (largestRowWidth - rowWidth) / 2;
            const xPosition =
                box.x1 + x + horizontalOffset + rowOffset + this._spacing / 2;

            // if the element has a width higher than the container
            // clamp its width and change its height preserving
            // aspect ratio
            let realHeight = rowHeight;
            let realWidth = width;
            if (width > container.width) {
                realHeight = (realHeight * container.width) / realWidth;
                realWidth = container.width;
            }

            // Check if this child has a cached allocation
            const cachedAlloc = allocationCache.get(child);
            if (cachedAlloc) {
                child.allocate(
                    new Clutter.ActorBox({
                        x1: cachedAlloc.x,
                        y1: cachedAlloc.y,
                        x2: cachedAlloc.x + realWidth,
                        y2: cachedAlloc.y + realHeight,
                    }),
                );
                continue; // Skip reallocation
            }

            // If the allocation has changed or no cache exists, perform new allocation
            child.allocate(
                new Clutter.ActorBox({
                    x1: xPosition,
                    y1: y,
                    x2: xPosition + realWidth,
                    y2: y + realHeight,
                }),
            );

            // Update cache with the new allocation
            allocationCache.set(child, {
                x: xPosition,
                y,
                height: realHeight,
                width: realWidth,
            });
        }

        // Store the updated cache for future allocation passes
        (container as ContainerWithAllocationCache)._allocationCache =
            allocationCache;
    }

    vfunc_get_preferred_width(
        container: Clutter.Actor,
        forHeight: number,
    ): [number, number] {
        let maxX = 0;
        container.get_children().forEach((ch) => {
            maxX = Math.max(maxX, ch.x + ch.width);
        });
        // add this._spacing because we want some right padding
        return [maxX + this._spacing, maxX + this._spacing];
    }

    vfunc_get_preferred_height(
        container: Clutter.Actor,
        forWidth: number,
    ): [number, number] {
        let maxY = 0;
        container.get_children().forEach((ch) => {
            maxY = Math.max(maxY, ch.y + ch.height);
        });
        // add this._spacing because we want some bottom padding
        return [maxY + this._spacing, maxY + this._spacing];
    }
}
