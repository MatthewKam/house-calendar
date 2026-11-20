import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, IconButton } from './Button';
import { Card, SectionHead } from './Card';
import { Chip, Tag } from './Chip';
import { Field, Input, TextArea } from './Field';
import { List, ListRow } from './ListRow';

// The shared components (styles/README.md "Components"): what they put on the page for screen readers
// and forms, which is easy to lose when a component changes.
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('Button', () => {
	it("never submits a form unless asked, and keeps its icon out of what's read", () => {
		const b = html(h(Button, { icon: '📅' }, 'Pick a cook day'));
		expect(b).toMatch(/^<button type="button"/);
		expect(b).toMatch(/<span class="[^"]*" aria-hidden="true">📅<\/span>/);
		expect(b).toContain('Pick a cook day</span>');
		expect(html(h(Button, { type: 'submit' }, 'Save'))).toMatch(/^<button type="submit"/);
	});

	it('names a picture-only button for screen readers', () => {
		const b = html(h(IconButton, { label: 'Close', icon: '×' }));
		expect(b).toContain('aria-label="Close"');
		expect(b).toContain('<span aria-hidden="true">×</span>');
	});
});

describe('Card and SectionHead', () => {
	it('is named by its heading', () => {
		const c = html(h(Card, { title: 'The kids today', children: 'Mia' }));
		const id = c.match(/aria-labelledby="([^"]+)"/)?.[1];
		expect(id).toBeTruthy();
		expect(c).toContain(`<h2 id="${id}"`);
		// No heading: no name pointing at nothing.
		expect(html(h(Card, { children: 'Mia' }))).not.toContain('aria-labelledby');
	});

	it('keeps headings in order', () => {
		expect(html(h(SectionHead, { children: 'Groceries' }))).toContain('<h2');
		expect(html(h(SectionHead, { level: 3, children: 'This week' }))).toContain('<h3');
	});
});

describe('Field', () => {
	it('ties its label, and its hint or error, to the box inside it', () => {
		const f = html(
			h(Field, { label: 'Title', hint: "What it's called", children: h(Input, { defaultValue: 'Swim' }) }),
		);
		const id = f.match(/<label for="([^"]+)"/)?.[1];
		expect(f).toContain(`id="${id}"`);
		expect(f).toContain(`aria-describedby="${id}-note"`);
		expect(f).toContain(`<p id="${id}-note"`);
		expect(f).not.toContain('aria-invalid');

		const wrong = html(h(Field, { label: 'Notes', hint: 'Optional', error: 'Too long', children: h(TextArea) }));
		expect(wrong).toContain('aria-invalid="true"');
		expect(wrong).toContain('role="alert">Too long</p>');
		expect(wrong).not.toContain('Optional');
	});

	it('works as a plain box outside a Field', () => {
		expect(html(h(Input, { 'aria-label': 'Search' }))).not.toContain('aria-describedby');
	});
});

describe('Chip, Tag and ListRow', () => {
	it('says whether a chip is picked, and only when it can be', () => {
		expect(html(h(Chip, { pressed: true }, 'Mia'))).toContain('aria-pressed="true"');
		expect(html(h(Chip, { pressed: false }, 'Leo'))).toContain('aria-pressed="false"');
		expect(html(h(Chip, null, 'Add'))).not.toContain('aria-pressed');
		expect(html(h(Tag, { tone: 'good', children: 'Done' }))).toMatch(/^<span/);
	});

	it('makes a row a button only when tapping it does something', () => {
		const still = html(h(List, null, h(ListRow, { title: 'Mia', detail: 'Age 4' })));
		expect(still).not.toContain('<button');
		const tappable = html(h(List, null, h(ListRow, { title: 'Mia', onClick: () => {}, trailing: 'x' })));
		expect(tappable).toContain('<button type="button"');
		// What's on the right isn't inside the row's button.
		expect(tappable.indexOf('</button>')).toBeLessThan(tappable.indexOf('x</div>'));
	});
});
