interface Point { x: number; y: number; }

/** Keep the same routing corridor and endpoints; only round its corners. */
export function polylinePath(points: Point[], rightAngles: boolean): string {
    const clean = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
    if (!clean.length) return "";
    let path = `M ${clean[0].x} ${clean[0].y}`;
    for (let index = 1; index < clean.length; index++) {
        const current = clean[index];
        const next = clean[index + 1];
        const previous = clean[index - 1];
        const inX = current.x - previous.x;
        const inY = current.y - previous.y;
        const outX = next ? next.x - current.x : 0;
        const outY = next ? next.y - current.y : 0;
        if (rightAngles || !next || inX * outY === inY * outX) {
            path += ` L ${current.x} ${current.y}`;
            continue;
        }
        const inLength = Math.hypot(inX, inY);
        const outLength = Math.hypot(outX, outY);
        const radius = Math.min(12, inLength / 2, outLength / 2);
        path += ` L ${current.x - inX / inLength * radius} ${current.y - inY / inLength * radius}`;
        path += ` Q ${current.x} ${current.y} ${current.x + outX / outLength * radius} ${current.y + outY / outLength * radius}`;
    }
    return path;
}

/** Existing exterior routes contain absolute M/L coordinates only. */
export function stylePolyline(path: string, rightAngles: boolean): string {
    if (rightAngles || !path.includes(" L ")) return path;
    const values = path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
    const points = Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
    return polylinePath(points, false);
}
