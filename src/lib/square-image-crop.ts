/**
 * Square crop geometry shared by the browser image editor. The source image
 * dimensions and editor edge produce a contained square preview; callers
 * render or export the result with the returned dimensions and constrained
 * offsets.
 */
export type SquareCropGeometry = {
	drawHeight: number;
	drawWidth: number;
	maxOffsetX: number;
	maxOffsetY: number;
};

/**
 * Calculates a contained crop that shows the entire image at the initial zoom.
 * Higher zoom values preserve the image aspect ratio. The image can move
 * within either its empty space or its overflow past the square's bounds.
 */
export function squareCropGeometry(sourceWidth: number, sourceHeight: number, edge: number, zoom: number): SquareCropGeometry {
	const scale = Math.min(edge / sourceWidth, edge / sourceHeight) * zoom;
	const drawWidth = sourceWidth * scale;
	const drawHeight = sourceHeight * scale;

	return {
		drawWidth,
		drawHeight,
		maxOffsetX: Math.abs(drawWidth - edge) / 2,
		maxOffsetY: Math.abs(drawHeight - edge) / 2,
	};
}

/** Keeps a drag position inside the image area that can fill the crop square. */
export function constrainSquareCropOffset(offset: number, maximum: number) {
	return Math.min(maximum, Math.max(-maximum, offset));
}
