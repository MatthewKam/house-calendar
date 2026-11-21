import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackButton } from './BackButton';
import { Button, IconButton } from './Button';
import { Card, SectionHead } from './Card';
import { Chip, Tag } from './Chip';
import { Field, Fieldset, Input, TextArea } from './Field';
import { List, ListRow } from './ListRow';
import { Segmented } from './Segmented';
import { Notice } from './Notice';

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

describe('Notice', () => {
	it('is one line, read out as a status, with the rest a tap away', () => {
		const n = html(
			h(Notice, { tone: 'danger', title: 'Calendar sync failed', details: 'iCloud refused the password' }),
		);
		expect(n).toMatch(/^<details[^>]*role="status"/);
		expect(n).toContain('<summary');
		expect(n).toContain('Calendar sync failed');
		expect(n).toContain('iCloud refused the password');
		expect(html(h(Notice, { title: 'Saved' }))).toMatch(/^<div[^>]*role="status"/);
	});
});

describe('Segmented', () => {
	it('says which one is picked, as a group or as tabs', () => {
		const options = [
			{ id: 'week', label: 'Week' },
			{ id: 'month', label: 'Month' },
		];
		const group = html(h(Segmented, { label: 'Period', options, value: 'week', onChange: () => {} }));
		expect(group).toContain('role="group" aria-label="Period"');
		expect(group).toMatch(/aria-pressed="true"[^>]*>Week/);
		const tabs = html(h(Segmented, { label: 'Period', options, value: 'month', onChange: () => {}, tabs: true }));
		expect(tabs).toContain('role="tablist"');
		expect(tabs).toMatch(/role="tab" aria-selected="true"[^>]*>Month/);
	});
});

describe('Fieldset', () => {
	it('names its group of choices by its label', () => {
		const f = html(
			h(Fieldset, {
				label: 'Who',
				labelHint: 'pick more than one',
				hint: 'Together',
				children: h(Chip, { pressed: true }, 'Mia'),
			}),
		);
		expect(f).toMatch(/^<fieldset/);
		expect(f).toMatch(/<legend[^>]*>Who<span[^>]*> · pick more than one<\/span><\/legend>/);
		expect(f).toContain('aria-pressed="true"');
		expect(f).toContain('>Together</p>');
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

describe('BackButton', () => {
	it('says where it goes back to, and keeps its chevron out of what is read', () => {
		const out = html(h(BackButton, { to: 'today', onBack: () => {} }));
		expect(out).toContain('<button type="button"');
		expect(out).toContain('aria-label="Back to Today"');
		expect(out).toContain('<svg viewBox="0 0 24 24" aria-hidden="true"');
		expect(out).toContain('<span>Today</span>');
	});
});
