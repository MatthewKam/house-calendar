import {
	createContext,
	useContext,
	useId,
	type InputHTMLAttributes,
	type ReactNode,
	type SelectHTMLAttributes,
	type TextareaHTMLAttributes,
} from 'react';
import s from './styles/Field.module.css';

// A form's fields: Field is the label, the hint under it and what's wrong; inside it goes one Input,
// TextArea or Select, which Field ties to its label, hint and error (for screen readers) by itself.
//
//   <Field label="Title" hint="What it's called on the calendar" error={error}>
//     <Input value={title} onChange={…} />
//   </Field>

/** The field around an input: its id, what describes it, and whether it's wrong. */
const FieldContext = createContext<{ id: string; describedBy?: string; invalid: boolean } | null>(null);

interface FieldProps {
	/** What to type here, above the box. */
	label: ReactNode;
	/** A word on what goes in it, under the box. */
	hint?: ReactNode;
	/** What's wrong with what's in it, under the box in red (instead of the hint). */
	error?: ReactNode;
	/** One Input, TextArea or Select. */
	children: ReactNode;
	className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
	const id = useId();
	const note = error || hint;
	const describedBy = note ? `${id}-note` : undefined;
	return (
		<div className={[s.field, className].filter(Boolean).join(' ')}>
			<label htmlFor={id} className={s.label}>
				{label}
			</label>
			<FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>{children}</FieldContext.Provider>
			{note && (
				<p id={describedBy} className={error ? s.error : s.hint} role={error ? 'alert' : undefined}>
					{note}
				</p>
			)}
		</div>
	);
}

/** What an input inside a Field takes from it (its own props win). A box of its own (DateInput) uses it too. */
export function useField() {
	const f = useContext(FieldContext);
	return f ? { id: f.id, 'aria-describedby': f.describedBy, 'aria-invalid': f.invalid || undefined } : {};
}

/** A one-line box to type in. */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
	const field = useField();
	return <input className={[s.box, className].filter(Boolean).join(' ')} {...field} {...rest} />;
}

/** A box for a few lines (notes, steps); it can be pulled taller. */
export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	const field = useField();
	return <textarea className={[s.box, s.area, className].filter(Boolean).join(' ')} {...field} {...rest} />;
}

/** A pick from a list (a meal, a unit). */
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
	const field = useField();
	return <select className={[s.box, className].filter(Boolean).join(' ')} {...field} {...rest} />;
}

interface FieldsetProps {
	/** What the choices are for ("Who", "Deadline"), above them. */
	label: ReactNode;
	/** A quieter word beside the label ("pick more than one to earn it together"). */
	labelHint?: ReactNode;
	/** A word on the choice made, under them. */
	hint?: ReactNode;
	/** Chips, or a few small controls, in a row that wraps. */
	children: ReactNode;
	className?: string;
}

/**
 * A labelled group of choices: chips to pick from (Who, Deadline, Times of day), where Field is for one
 * box. Read out as a group named by its label.
 */
export function Fieldset({ label, labelHint, hint, children, className }: FieldsetProps) {
	return (
		<fieldset className={[s.fieldset, className].filter(Boolean).join(' ')}>
			<legend className={s.label}>
				{label}
				{labelHint && <span className={s.labelHint}> · {labelHint}</span>}
			</legend>
			<div className={s.choices}>{children}</div>
			{hint && <p className={s.hint}>{hint}</p>}
		</fieldset>
	);
}
