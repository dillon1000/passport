/**
 * Compact progress indicator for focused authentication interstitials. It has
 * no state or side effects; callers provide the accessible status text around
 * it so the same visual can represent each authentication operation.
 */
export function FastAuthSpinner({ className = "size-8" }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={`${className} animate-spin [animation-duration:550ms] motion-reduce:animate-none`}
			viewBox="0 0 24 24"
		>
			<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.1" />
			<circle
				cx="12"
				cy="12"
				r="9.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray="42 60"
			/>
		</svg>
	);
}
