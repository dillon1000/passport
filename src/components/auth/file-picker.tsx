/**
 * Shared image picker for Passport forms. It accepts an image through browse or
 * drag-and-drop, reports the selected file to its caller, and keeps native file
 * inputs hidden so every upload flow shares the same accessible surface.
 */
import { useId, useState, type ChangeEvent, type DragEvent } from "react";
import { Image as ImageIcon, Upload } from "@/lib/icons";

import { Label } from "@/components/kumo/primitives/label";
import { cn } from "@/lib/utils";
import { SquareImageEditor } from "./square-image-editor";

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";

type FilePickerProps = {
	label: string;
	onFileSelect: (file: File) => void | Promise<void>;
	disabled?: boolean;
	compact?: boolean;
	className?: string;
};

export function FilePicker({ label, onFileSelect, disabled = false, compact = false, className }: FilePickerProps) {
	const inputId = useId();
	const descriptionId = `${inputId}-description`;
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [fileToCrop, setFileToCrop] = useState<File | null>(null);

	/** Opens the square editor before any caller receives an image for upload. */
	function selectFile(file: File | null) {
		if (!file || disabled) return;
		setFileToCrop(file);
	}

	/** Stores the edited file locally, then starts the existing caller-owned upload workflow. */
	function completeCrop(file: File) {
		setFileToCrop(null);
		setSelectedFile(file);
		void onFileSelect(file);
	}

	function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
		selectFile(event.target.files?.[0] ?? null);
		event.target.value = "";
	}

	function handleDrop(event: DragEvent<HTMLLabelElement>) {
		event.preventDefault();
		selectFile(event.dataTransfer.files?.[0] ?? null);
	}

	if (compact) {
		return (
			<>
			<label
				htmlFor={inputId}
				onDragOver={(event) => event.preventDefault()}
				onDrop={handleDrop}
				className={cn(
					"inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground shadow-xs transition-[border-color,background-color,transform] duration-150 ease-out hover:border-ring/70 hover:bg-muted active:scale-[0.96] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/35",
					disabled && "pointer-events-none cursor-not-allowed opacity-50",
					className,
				)}
			>
				<input
					id={inputId}
					type="file"
					className="sr-only"
					accept={ACCEPTED_IMAGE_TYPES}
					disabled={disabled}
					onChange={handleInputChange}
				/>
				<Upload className="size-3.5" aria-hidden="true" />
				{selectedFile ? "Replace logo" : label}
			</label>
			<SquareImageEditor file={fileToCrop} onCancel={() => setFileToCrop(null)} onComplete={completeCrop} />
			</>
		);
	}

	return (
		<>
		<div className={cn("space-y-1.5", className)}>
			<Label htmlFor={inputId}>{label}</Label>
			<input
				id={inputId}
				type="file"
				className="sr-only"
				accept={ACCEPTED_IMAGE_TYPES}
				aria-describedby={descriptionId}
				disabled={disabled}
				onChange={handleInputChange}
			/>
			<label
				htmlFor={inputId}
				onDragOver={(event) => event.preventDefault()}
				onDrop={handleDrop}
				className={cn(
					"group flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 p-3 transition-[border-color,background-color,transform] duration-150 ease-out hover:border-ring/70 hover:bg-muted/50 active:scale-[0.96] focus-within:border-ring focus-within:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/35",
					disabled && "pointer-events-none cursor-not-allowed opacity-50",
				)}
			>
				<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground shadow-xs transition-[color,background-color] duration-150 group-hover:bg-primary/10 group-hover:text-primary">
					<ImageIcon className="size-5" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium text-foreground">
						{selectedFile ? selectedFile.name : "Choose an image"}
					</span>
					<span id={descriptionId} className="mt-0.5 block text-xs text-muted-foreground" aria-live="polite">
						{selectedFile ? "Ready to upload" : "Drop an image here or browse your files"}
					</span>
				</span>
				<span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground shadow-xs transition-[background-color,transform] duration-150 group-hover:bg-muted group-active:scale-[0.96]">
					<Upload className="size-3.5" aria-hidden="true" />
					Browse
				</span>
			</label>
		</div>
		<SquareImageEditor file={fileToCrop} onCancel={() => setFileToCrop(null)} onComplete={completeCrop} />
		</>
	);
}
