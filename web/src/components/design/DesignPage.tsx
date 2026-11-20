import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import appCss from '../../styles/app.css?raw';
import { ACCENTS, accentCss, DEFAULT_ACCENT, type Accent } from '../../lib/accent';
import { BackButton } from '../ui/BackButton';
import { Button, IconButton } from '../ui/Button';
import { Card, SectionHead } from '../ui/Card';
import { Chip, Tag } from '../ui/Chip';
import { Field, Fieldset, Input, Select, TextArea } from '../ui/Field';
import { List, ListRow } from '../ui/ListRow';
import Switch from '../ui/Switch';
import { readTokens, type Group, type Token } from './tokens';
import s from './Design.module.css';

// The design page (/design, only while developing: main.tsx): every shared name in app.css and every
// shared component, live, in light or dark and each accent, so anyone building a screen can see what to
// use. The names are read from app.css itself (tokens.ts), so the page is never behind it.

const TOKENS = readTokens(appCss);
const of = (group: Group) => TOKENS.filter((t) => t.group === group);

const SECTIONS = [
	['colours', 'Colours'],
	['text', 'Text'],
	['space', 'Space'],
	['corners', 'Corners and shadows'],
	['tap', 'Touch sizes'],
	['layers', 'Layers'],
	['textures', 'Textures'],
	['buttons', 'Buttons'],
	['cards', 'Cards'],
	['fields', 'Fields'],
	['chips', 'Chips and tags'],
	['rows', 'Lists'],
] as const;

/** Counts each time the page's theme or accent is put on, so the values shown are read again. */
const Applied = createContext(0);

/** A name, its value right now (light or dark), and what it's for. */
function Name({ token }: { token: Token }) {
	const applied = useContext(Applied);
	const [now, setNow] = useState('');
	useEffect(() => {
		setNow(getComputedStyle(document.documentElement).getPropertyValue(token.name).trim());
	}, [token.name, applied]);
	return (
		<span className={s.name}>
			<code>{token.name}</code>
			<span className={s.value}>{now || token.value}</span>
			{token.note && <span className={s.note}>{token.note}</span>}
		</span>
	);
}

function Section({
	id,
	title,
	intro,
	children,
}: {
	id: string;
	title: string;
	intro?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section id={id} className={s.section}>
			<SectionHead>{title}</SectionHead>
			{intro && <p className={s.intro}>{intro}</p>}
			{children}
		</section>
	);
}

/** The background textures in public/textures/ (no screen uses them yet; a feature to pick one comes later). */
const TEXTURES = [
	['bark', 'dense sideways grain'],
	['brushed', 'soft sideways streaks'],
	['canvas', 'an even grid of fine dots'],
	['cloud', 'big soft clouds'],
	['flecks', 'scattered short flecks'],
	['linen', 'sideways streaks, like linen'],
	['paper', 'fine speckle, like paper'],
	['stone', 'scratchy speckle, like stone'],
	['canvas-soft', 'a fainter canvas'],
	['linen-soft', 'a fainter linen'],
	['paper-soft', 'a fainter paper'],
] as const;

const v = (name: string, value: string) => ({ [name]: value }) as CSSProperties;

export default function DesignPage() {
	const [theme, setTheme] = useState<'light' | 'dark'>('light');
	const [accent, setAccent] = useState<Accent>(DEFAULT_ACCENT);
	// The page's own picks, on the page only (not this device's settings).
	const [applied, setApplied] = useState(0);
	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		document.title = 'Sprig design';
		const style = document.createElement('style');
		style.textContent = accent === DEFAULT_ACCENT ? '' : accentCss(accent);
		document.head.append(style);
		setApplied((n) => n + 1);
		return () => style.remove();
	}, [theme, accent]);

	const [picked, setPicked] = useState<string[]>(['Mia']);
	const [on, setOn] = useState(true);
	const [title, setTitle] = useState('');

	return (
		<Applied.Provider value={applied}>
			<div className={s.page}>
				<header className={s.bar}>
					<strong className={s.brand}>Sprig design</strong>
					<div className={s.controls}>
						<Chip pressed={theme === 'light'} onClick={() => setTheme('light')} icon="☀️">
							Light
						</Chip>
						<Chip pressed={theme === 'dark'} onClick={() => setTheme('dark')} icon="🌙">
							Dark
						</Chip>
						{ACCENTS.map((a) => (
							<button
								key={a.id}
								type="button"
								className={s.accent}
								style={v('--swatch', a[theme].accent)}
								aria-label={a.name}
								aria-pressed={a === accent}
								title={a.name}
								onClick={() => setAccent(a)}
							/>
						))}
					</div>
				</header>

				<div className={s.layout}>
					<nav className={s.nav} aria-label="Sections">
						{SECTIONS.map(([id, name]) => (
							<a key={id} href={`#${id}`}>
								{name}
							</a>
						))}
					</nav>

					<main className={s.main}>
						<p className={s.lead}>
							The shared names in <code>styles/app.css</code> and the components in <code>components/ui/</code>. Use
							these instead of values and looks of your own; <code>styles/README.md</code> says how.
						</p>

						<Section id="colours" title="Colours" intro="Each has a light and a dark value: switch above to see both.">
							<ul className={s.grid}>
								{of('colour').map((t) => (
									<li key={t.name} className={s.colour}>
										<span className={s.swatch} style={v('--swatch', `var(${t.name})`)} />
										<Name token={t} />
									</li>
								))}
							</ul>
						</Section>

						<Section id="text" title="Text" intro="Sizes, weights and line heights of Aleo.">
							<ul className={s.stack}>
								{of('text').map((t) => (
									<li key={t.name} className={s.sample}>
										<span style={{ fontSize: `var(${t.name})` }}>Mia brushed her teeth</span>
										<Name token={t} />
									</li>
								))}
								{of('weight').map((t) => (
									<li key={t.name} className={s.sample}>
										<span style={{ fontWeight: `var(${t.name})`, fontSize: 'var(--text-lg)' }}>
											Swim lesson at 4:00
										</span>
										<Name token={t} />
									</li>
								))}
								{of('leading').map((t) => (
									<li key={t.name} className={s.sample}>
										<span className={s.para} style={{ lineHeight: `var(${t.name})` }}>
											Leo tried the big slide today, all by himself, and wanted to go again and again.
										</span>
										<Name token={t} />
									</li>
								))}
							</ul>
						</Section>

						<Section
							id="space"
							title="Space"
							intro="Gaps, padding and margins: closer for things that belong together."
						>
							<ul className={s.stack}>
								{of('space').map((t) => (
									<li key={t.name} className={s.sample}>
										<span className={s.spaceBar} style={{ width: `var(${t.name})` }} />
										<Name token={t} />
									</li>
								))}
							</ul>
						</Section>

						<Section id="corners" title="Corners and shadows">
							<ul className={s.grid}>
								{of('radius').map((t) => (
									<li key={t.name} className={s.shape}>
										<span className={s.box} style={{ borderRadius: `var(${t.name})` }} />
										<Name token={t} />
									</li>
								))}
								{of('shadow').map((t) => (
									<li key={t.name} className={s.shape}>
										<span className={s.box} style={{ boxShadow: `var(${t.name})` }} />
										<Name token={t} />
									</li>
								))}
							</ul>
						</Section>

						<Section id="tap" title="Touch sizes" intro="How big a thing you press is, at least.">
							<ul className={s.grid}>
								{of('tap').map((t) => (
									<li key={t.name} className={s.shape}>
										<span className={s.tap} style={{ width: `var(${t.name})`, height: `var(${t.name})` }} />
										<Name token={t} />
									</li>
								))}
							</ul>
						</Section>

						<Section id="layers" title="Layers" intro="What sits over what, bottom to top. Use the role, not a number.">
							<List divided>
								{of('layer').map((t) => (
									<ListRow key={t.name} title={<code>{t.name}</code>} detail={t.note} trailing={t.value} />
								))}
							</List>
						</Section>

						<Section
							id="textures"
							title="Textures"
							intro="Tiling grain in public/textures/, see-through, over any colour: switch to dark to see them there. Not on any screen yet."
						>
							<ul className={s.grid}>
								{TEXTURES.map(([name, what]) => (
									<li key={name} className={s.shape}>
										<span className={s.texture} style={v('--texture', `url('/textures/${name}.png')`)} />
										<span className={s.name}>
											<code>/textures/{name}.png</code>
											<span className={s.note}>{what}</span>
										</span>
									</li>
								))}
							</ul>
						</Section>

						<Section id="buttons" title="Buttons" intro="One look per job. Kid mode's are size lg.">
							{(['primary', 'secondary', 'destructive', 'danger', 'link', 'quiet'] as const).map((variant) => (
								<div key={variant} className={s.row}>
									<span className={s.label}>{variant}</span>
									<Button variant={variant} size="sm">
										Small
									</Button>
									<Button variant={variant}>Save</Button>
									<Button variant={variant} size="lg" icon="⭐">
										Big
									</Button>
									<Button variant={variant} disabled>
										Off
									</Button>
								</div>
							))}
							<div className={s.row}>
								<span className={s.label}>IconButton</span>
								<IconButton label="Close" icon="×" />
								<IconButton label="More" icon="⋯" variant="secondary" />
								<IconButton label="Add" icon="+" variant="primary" />
								<IconButton label="Add" icon="+" variant="primary" size="lg" />
							</div>
							<div className={s.row}>
								<span className={s.label}>BackButton</span>
								<BackButton to="today" onBack={() => {}} />
							</div>
							<Button variant="primary" block icon="📅">
								A whole-width button (block)
							</Button>
						</Section>

						<Section id="cards" title="Cards" intro="A box of one thing, with a small heading and an action.">
							<div className={s.cards}>
								<Card title="The kids today" action={<Button variant="link">Hide</Button>}>
									<p className={s.flat}>Mia: 3 of 4 done</p>
								</Card>
								{(['info', 'warn', 'good', 'danger'] as const).map((tone) => (
									<Card key={tone} tone={tone} title={tone}>
										<p className={s.flat}>A {tone} note.</p>
									</Card>
								))}
							</div>
							<SectionHead action={<Button size="sm">Edit</Button>}>A section heading</SectionHead>
							<SectionHead level={3}>A smaller one inside it</SectionHead>
						</Section>

						<Section id="fields" title="Fields" intro="Leave the title empty to see an error.">
							<div className={s.fields}>
								<Field
									label="Title"
									hint="What it's called on the calendar"
									error={title.trim() ? undefined : 'Give it a name'}
								>
									<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Swim lesson" />
								</Field>
								<Field label="Meal">
									<Select defaultValue="dinner">
										<option value="breakfast">Breakfast</option>
										<option value="lunch">Lunch</option>
										<option value="dinner">Dinner</option>
									</Select>
								</Field>
								<Field label="Notes" hint="Optional">
									<TextArea rows={3} placeholder="Bring a towel" />
								</Field>
								<Fieldset label="Who" labelHint="pick more than one" hint="A group of choices: Fieldset">
									{['Mia', 'Leo'].map((name) => (
										<Chip
											key={name}
											pressed={picked.includes(name)}
											onClick={() =>
												setPicked(picked.includes(name) ? picked.filter((p) => p !== name) : [...picked, name])
											}
										>
											{name}
										</Chip>
									))}
								</Fieldset>
							</div>
						</Section>

						<Section id="chips" title="Chips and tags" intro="Tap the chips: picked ones fill.">
							<div className={s.row}>
								{['Mia', 'Leo', 'Sam'].map((name) => (
									<Chip
										key={name}
										pressed={picked.includes(name)}
										onClick={() =>
											setPicked(picked.includes(name) ? picked.filter((p) => p !== name) : [...picked, name])
										}
									>
										{name}
									</Chip>
								))}
								<Chip icon="+">Add</Chip>
							</div>
							<div className={s.row}>
								{(['plain', 'accent', 'info', 'warn', 'good', 'danger', 'soon'] as const).map((tone) => (
									<Tag key={tone} tone={tone}>
										{tone}
									</Tag>
								))}
							</div>
						</Section>

						<Section id="rows" title="Lists">
							<Card>
								<List divided>
									<ListRow
										leading={<span className={s.dot} style={v('--c', '#e8590c')} />}
										title="Mia"
										detail="Age 4 · kid"
										trailing={<Button size="sm">Edit</Button>}
									/>
									<ListRow
										leading="🔔"
										title="Alerts"
										detail={on ? 'On for this phone' : 'Off'}
										trailing={<Switch on={on} onChange={setOn} label="Alerts" />}
									/>
									<ListRow leading="📅" title="Tap the whole row" detail="It's a button" onClick={() => {}} />
									<ListRow leading="🌙" title="Turned off" detail="muted" muted />
								</List>
							</Card>
						</Section>
					</main>
				</div>
			</div>
		</Applied.Provider>
	);
}
