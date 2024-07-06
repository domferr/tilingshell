import Tile from '@components/layout/Tile';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';

interface ExtendedWindow extends Meta.Window {
    originalSize: Mtk.Rectangle | undefined;
    assignedTile: Tile | undefined;
}

export default ExtendedWindow;
