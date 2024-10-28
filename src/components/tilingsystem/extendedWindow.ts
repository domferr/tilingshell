import Tile from '@components/layout/Tile';
import { Mtk, Meta } from '@gi';

interface ExtendedWindow extends Meta.Window {
    originalSize: Mtk.Rectangle | undefined;
    assignedTile: Tile | undefined;
}

export default ExtendedWindow;
