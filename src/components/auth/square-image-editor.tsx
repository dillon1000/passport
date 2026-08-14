/**
 * Browser-only square image editor for Passport uploads. It receives a local
 * File, lets a person position and zoom the visible square, then returns a
 * compact JPEG File for the existing Worker and R2 upload route.
 */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/kumo/primitives/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/kumo/primitives/dialog";
import { constrainSquareCropOffset, squareCropGeometry } from "@/lib/square-image-crop";

const EDITOR_EDGE = 320;
const OUTPUT_EDGE = 512;
const MAX_ZOOM = 3;

type ImageDimensions = { height: number; width: number };
type CropOffset = { x: number; y: number };

type SquareImageEditorProps = {
	file: File | null;
	onCancel: () => void;
	onComplete: (file: File) => void;
};

type SquareImageEditorSessionProps = Omit<SquareImageEditorProps, "file"> & { file: File };

/** Converts the square preview into the uploaded JPEG while retaining its crop. */
async function createCroppedFile(image: HTMLImageElement, file: File, zoom: number, offset: CropOffset) {
	const canvas = document.createElement("canvas");
	canvas.width = OUTPUT_EDGE;
	canvas.height = OUTPUT_EDGE;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Your browser cannot prepare this image.");

	// JPEG has no transparency, so letterboxed images need a stable background.
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, OUTPUT_EDGE, OUTPUT_EDGE);
	const geometry = squareCropGeometry(image.naturalWidth, image.naturalHeight, OUTPUT_EDGE, zoom);
	const offsetScale = OUTPUT_EDGE / EDITOR_EDGE;
	context.drawImage(
		image,
		(OUTPUT_EDGE - geometry.drawWidth) / 2 + offset.x * offsetScale,
		(OUTPUT_EDGE - geometry.drawHeight) / 2 + offset.y * offsetScale,
		geometry.drawWidth,
		geometry.drawHeight,
	);

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
	if (!blob) throw new Error("Could not prepare this image.");
	const stem = file.name.replace(/\.[^.]+$/, "") || "image";
	return new File([blob], `${stem}-square.jpg`, { type: "image/jpeg" });
}

function SquareImageEditorSession({ file, onCancel, onComplete }: SquareImageEditorSessionProps) {
	const imageRef = useRef<HTMLImageElement>(null);
	const dragStart = useRef<{ offset: CropOffset; pointerX: number; pointerY: number } | null>(null);
	const [imageURL] = useState(() => URL.createObjectURL(file));
	const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
	const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		return () => URL.revokeObjectURL(imageURL);
	}, [imageURL]);

	const geometry = dimensions ? squareCropGeometry(dimensions.width, dimensions.height, EDITOR_EDGE, zoom) : null;

	/** Re-clamps the pan after zoom changes because the image bounds also change. */
	function updateZoom(nextZoom: number) {
		setZoom(nextZoom);
		if (!dimensions) return;
		const nextGeometry = squareCropGeometry(dimensions.width, dimensions.height, EDITOR_EDGE, nextZoom);
		setOffset((current) => ({
			x: constrainSquareCropOffset(current.x, nextGeometry.maxOffsetX),
			y: constrainSquareCropOffset(current.y, nextGeometry.maxOffsetY),
		}));
	}

	function startDrag(event: PointerEvent<HTMLDivElement>) {
		if (!geometry) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragStart.current = { offset, pointerX: event.clientX, pointerY: event.clientY };
	}

	function moveDrag(event: PointerEvent<HTMLDivElement>) {
		if (!dragStart.current || !geometry) return;
		setOffset({
			x: constrainSquareCropOffset(dragStart.current.offset.x + event.clientX - dragStart.current.pointerX, geometry.maxOffsetX),
			y: constrainSquareCropOffset(dragStart.current.offset.y + event.clientY - dragStart.current.pointerY, geometry.maxOffsetY),
		});
	}

	function endDrag() {
		dragStart.current = null;
	}

	async function saveCrop() {
		if (!file || !imageRef.current || !dimensions) return;
		setIsSaving(true);
		setError(null);
		try {
			onComplete(await createCroppedFile(imageRef.current, file, zoom, offset));
		} catch (cropError) {
			setError(cropError instanceof Error ? cropError.message : "Could not prepare this image.");
			setIsSaving(false);
		}
	}

	return (
		<Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
			<DialogContent className="w-[calc(100vw-2rem)] max-w-md" showCloseButton={!isSaving}>
				<DialogHeader>
					<DialogTitle>Adjust image</DialogTitle>
					<DialogDescription>The whole image starts in view. Drag to position it, then use the slider to zoom.</DialogDescription>
				</DialogHeader>
				<div
					className="relative mx-auto mt-5 size-80 max-w-full touch-none overflow-hidden rounded-lg bg-muted select-none"
					onPointerDown={startDrag}
					onPointerMove={moveDrag}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
				>
					<img
						ref={imageRef}
						src={imageURL}
						alt="Image crop preview"
						draggable={false}
						onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
						onError={() => setError("This image could not be opened.")}
						className="pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-1/2"
						style={geometry ? { height: geometry.drawHeight, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`, width: geometry.drawWidth } : undefined}
					/>
				</div>
				<label className="mt-5 grid gap-2 text-sm font-medium">
					Zoom
					<input
						type="range"
						min="1"
						max={MAX_ZOOM}
						step="0.01"
						value={zoom}
						disabled={!dimensions || isSaving}
						onChange={(event) => updateZoom(Number(event.target.value))}
						className="accent-primary"
					/>
				</label>
				{error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
					<Button type="button" onClick={() => void saveCrop()} disabled={!dimensions || isSaving}>
						{isSaving ? "Preparing…" : "Use image"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Mounts a fresh editor session for each selected file so its object URL and crop state have one owner. */
export function SquareImageEditor({ file, onCancel, onComplete }: SquareImageEditorProps) {
	if (!file) return null;
	return (
		<SquareImageEditorSession
			key={`${file.name}:${file.lastModified}:${file.size}`}
			file={file}
			onCancel={onCancel}
			onComplete={onComplete}
		/>
	);
}
