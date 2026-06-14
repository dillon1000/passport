import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

/**
 * Segmented one-time-code input. Renders `length` single-character cells that
 * behave as one field: typing advances, backspace retreats, arrows move, and a
 * pasted code fills across cells. The value is owned by the parent as a plain
 * string so it drops into existing forms without ceremony.
 */
export function OTPInput({
	value,
	onChange,
	length = 6,
	disabled,
	autoFocus,
	"aria-label": ariaLabel = "Verification code",
	inputMode = "numeric",
	onComplete,
}: {
	value: string;
	onChange: (value: string) => void;
	length?: number;
	disabled?: boolean;
	autoFocus?: boolean;
	"aria-label"?: string;
	inputMode?: "numeric" | "text";
	onComplete?: (value: string) => void;
}) {
	const refs = useRef<(HTMLInputElement | null)[]>([]);
	const chars = Array.from({ length }, (_, index) => value[index] ?? "");

	function focusCell(index: number) {
		const clamped = Math.max(0, Math.min(length - 1, index));
		refs.current[clamped]?.focus();
		refs.current[clamped]?.select();
	}

	function commit(next: string) {
		const trimmed = next.slice(0, length);
		onChange(trimmed);
		if (trimmed.length === length) onComplete?.(trimmed);
	}

	function handleChange(index: number, raw: string) {
		const sanitized = inputMode === "numeric" ? raw.replace(/\D/g, "") : raw.replace(/\s/g, "");
		if (!sanitized) {
			// Clearing the current cell.
			commit(chars.map((char, position) => (position === index ? "" : char)).join(""));
			return;
		}
		const incoming = sanitized.split("");
		const nextChars = [...chars];
		let cursor = index;
		for (const char of incoming) {
			if (cursor >= length) break;
			nextChars[cursor] = char;
			cursor += 1;
		}
		commit(nextChars.join("").replace(/\s+$/, ""));
		focusCell(cursor);
	}

	function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Backspace") {
			event.preventDefault();
			if (chars[index]) {
				commit(chars.map((char, position) => (position === index ? "" : char)).join(""));
			} else {
				focusCell(index - 1);
				commit(chars.map((char, position) => (position === index - 1 ? "" : char)).join(""));
			}
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			focusCell(index - 1);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			focusCell(index + 1);
		}
	}

	function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
		event.preventDefault();
		const pasted = event.clipboardData.getData("text");
		handleChange(0, pasted);
	}

	return (
		<div className="flex items-center gap-1.5 sm:gap-2" role="group" aria-label={ariaLabel}>
			{chars.map((char, index) => (
				<input
					key={index}
					ref={(node) => {
						refs.current[index] = node;
					}}
					type="text"
					inputMode={inputMode}
					autoComplete={index === 0 ? "one-time-code" : "off"}
					autoFocus={autoFocus && index === 0}
					disabled={disabled}
					value={char}
					maxLength={length}
					aria-label={`${ariaLabel} digit ${index + 1}`}
					onChange={(event) => handleChange(index, event.target.value)}
					onKeyDown={(event) => handleKeyDown(index, event)}
					onPaste={handlePaste}
					onFocus={(event) => event.target.select()}
					className={cn(
						"h-11 w-full min-w-0 rounded-lg border border-input bg-background text-center font-mono text-base tabular-nums shadow-xs transition-[color,box-shadow,border-color] outline-none",
						"hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35",
						"disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50",
						"dark:bg-input/30 dark:hover:bg-input/40",
						char && "border-ring/50",
					)}
				/>
			))}
		</div>
	);
}
