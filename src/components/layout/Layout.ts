export const LAYOUT_HORIZONTAL_TYPE = 0;
export const LAYOUT_VERTICAL_TYPE   = 1;

export interface Layout {
    type: number // 0 means horizontal, 1 means vertical
    length: number
    items: Layout[]
}