import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';

interface ExtendedWindow extends Meta.Window {
    originalSize: Mtk.Rectangle | undefined;
    isTiled: boolean;
}

export default ExtendedWindow;
