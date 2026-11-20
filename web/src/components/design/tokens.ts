// The shared names in app.css, read from the file itself for the design page (DesignPage.tsx), so the
// page never falls behind it: each name, what it's for (its comment), and which set it's in.

export type Group = 'colour' | 'space' | 'text' | 'weight' | 'leading' | 'tap' | 'radius' | 'shadow' | 'layer';
export interface Token {
	name: string;
	group: Group;
	/** Its value as written in app.css (the light one, for a colour). */
	value: string;
	/** What it's for: its own comment, or the comment above a set of colours. */
	note: string;
}

const PREFIXES: [string, Group][] = [
	['--space-', 'space'],
	['--text-', 'text'],
	['--weight-', 'weight'],
	['--leading-', 'leading'],
	['--tap', 'tap'],
	['--radius', 'radius'],
	['--shadow-', 'shadow'],
	['--layer-', 'layer'],
];
/** Not shown: the phone's edges and the pastel's strength, which aren't picked from. */
const SKIP = new Set(['--inset-left', '--inset-right', '--top-room', '--pastel']);

const tidy = (comment: string) =>
	comment
		.replace(/^\/\*+|\*+\/$/g, '')
		.replace(/\s*\n\s*\*?\s*/g, ' ')
		.trim();

/** Every shared name in `css` (app.css), once each, in the order written. */
export function readTokens(css: string): Token[] {
	const out = new Map<string, Token>();
	// The last comment above, for names without one of their own (a set of colours shares one).
	let above = '';
	const parts = css.matchAll(/(\/\*[\s*][\s\S]*?\*\/)|(--[a-z0-9-]+)\s*:\s*([^;]+);[ \t]*(\/\*[\s\S]*?\*\/)?/g);
	for (const [, comment, name, value, own] of parts) {
		if (comment) {
			above = tidy(comment);
			continue;
		}
		if (SKIP.has(name) || out.has(name)) continue;
		const group = PREFIXES.find(([p]) => name.startsWith(p))?.[1] ?? (/^#|^rgb/.test(value) ? 'colour' : null);
		if (!group) continue;
		out.set(name, { name, group, value: value.trim(), note: own ? tidy(own) : group === 'colour' ? above : '' });
	}
	return [...out.values()];
}
