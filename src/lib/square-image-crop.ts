/**
 * Square crop geometry shared by the browser image editor. The source image
 * dimensions and editor edge produce a cover crop; callers render or export
 * the result with the returned dimensions and constrained offsets.
 */
export type SquareCropGeometry = {
	drawHeight: number;
	drawWidth: number;
	maxOffsetX: number;
	maxOffsetY: number;
};

/**
 * Calculates a cover crop that always fills a square editor. Zoom starts at
 * one so the whole square is covered, then increases while retaining the
 * image aspect ratio.
 */
export function squareCropGeometry(sourceWidth: number, sourceHeight: number, edge: number, zoom: number): SquareCropGeometry {
	const scale = Math.max(edge / sourceWidth, edge / sourceHeight) * zoom;
	const drawWidth = sourceWidth * scale;
	const drawHeight = sourceHeight * scale;

	return {
		drawWidth,
		drawHeight,
		maxOffsetX: Math.max(0, (drawWidth - edge) / 2),
		maxOffsetY: Math.max(0, (drawHeight - edge) / 2),
	};
}

/** Keeps a drag position inside the image area that can fill the crop square. */
export function constrainSquareCropOffset(offset: number, maximum: number) {
	return Math.min(maximum, Math.max(-maximum, offset));
}
