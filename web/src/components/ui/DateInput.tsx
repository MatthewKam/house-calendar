import { useRef, type InputHTMLAttributes } from "react";
import d from "./DateInput.module.css";

/**
 * A date field with its calendar button beside it, not inside. Password managers (LastPass,
 * 1Password, Bitwarden) are told to leave it alone, since their icon lands on the browser's own.
 * `className` styles the input.
 */
export default function DateInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
	const input = useRef<HTMLInputElement>(null);
	function pick() {
		const el = input.current;
		if (!el) return;
		try {
			el.showPicker();
		} catch {
			// Older browsers: focusing it is the next best thing.
			el.focus();
		}
	}
	return (
		<span className={d.wrap}>
			<input ref={input} type="date" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"
				data-form-type="other" {...props} className={`${d.input} ${props.className ?? ""}`} />
			<button type="button" className={d.pick} onClick={pick} disabled={props.disabled}
				aria-label={props["aria-label"] ? `Pick ${props["aria-label"].toLowerCase()}` : "Pick a date"}>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<rect x="3.5" y="5" width="17" height="15" rx="2.5" />
					<path d="M3.5 10h17M8 3v4M16 3v4" />
				</svg>
			</button>
		</span>
	);
}
