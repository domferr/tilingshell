import Meta from "gi://Meta";
import Mtk from "gi://Mtk";

export default interface ExtendedWindow extends Meta.Window {
    originalSize: Mtk.Rectangle | undefined;
}