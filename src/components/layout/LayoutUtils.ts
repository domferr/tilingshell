import { St } from '@gi.ext';
import { getScalingFactorOf } from '@utils/ui';
export default class LayoutUtils {
    static calc_size(
        widget: St.Widget,
        monitorIndex: number,
        smallEdgeSize: number,
    ): [number, number] {
        const monitorGeometry =
            global.display.get_monitor_geometry(monitorIndex);

        const aspectRatio = monitorGeometry.width / monitorGeometry.height;
        const [, scalingFactor] = getScalingFactorOf(widget);

        if (aspectRatio === 1) {
            return [
                smallEdgeSize * scalingFactor,
                smallEdgeSize * scalingFactor,
            ];
        }

        return [
            (aspectRatio > 1.0
                ? Math.round(smallEdgeSize * aspectRatio)
                : smallEdgeSize) * scalingFactor,
            (aspectRatio < 1.0
                ? Math.round(smallEdgeSize / aspectRatio)
                : smallEdgeSize) * scalingFactor,
        ];
    }
}
