import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The phone app or a browser, as each test needs; Capacitor's Haptics, recorded.
const app = vi.hoisted(() => ({ isApp: false }));
vi.mock('./native', () => ({
	get isApp() {
		return app.isApp;
	},
}));
const plugin = vi.hoisted(() => ({
	impact: vi.fn(async () => {}),
	notification: vi.fn(async () => {}),
	selectionStart: vi.fn(async () => {}),
	selectionChanged: vi.fn(async () => {}),
}));
vi.mock('@capacitor/haptics', () => ({
	Haptics: plugin,
	ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
	NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

const store = new Map<string, string>();
const vibrate = vi.fn(() => true);

async function load() {
	vi.resetModules();
	return import('./haptics');
}
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	store.clear();
	vibrate.mockClear();
	Object.values(plugin).forEach((f) => f.mockClear());
	app.isApp = false;
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => store.set(k, v),
		removeItem: (k: string) => store.delete(k),
	});
	vi.stubGlobal('navigator', { vibrate });
});
afterEach(() => vi.unstubAllGlobals());

describe('haptics', () => {
	it('is on to start, and stays off on this device once turned off', async () => {
		const h = await load();
		expect(h.hapticsOn()).toBe(true);
		store.set('sprig:haptics', 'off');
		expect(h.hapticsOn()).toBe(false);
		h.feel('tap');
		expect(vibrate).not.toHaveBeenCalled();
	});

	it('buzzes briefly in a browser that can, and does nothing in one that can’t', async () => {
		let h = await load();
		h.feel('tap');
		expect(vibrate).toHaveBeenCalledWith(10);
		vi.stubGlobal('navigator', {});
		h = await load();
		expect(h.canFeel()).toBe(false);
		expect(() => h.feel('success')).not.toThrow();
	});

	it('uses the Taptic Engine in the phone app, by kind', async () => {
		app.isApp = true;
		const h = await load();
		h.feel('tap');
		h.feel('done');
		h.feel('success');
		h.feel('warn');
		await settle();
		expect(plugin.impact.mock.calls).toEqual([[{ style: 'LIGHT' }], [{ style: 'MEDIUM' }]]);
		expect(plugin.notification.mock.calls).toEqual([[{ type: 'SUCCESS' }], [{ type: 'WARNING' }]]);
		expect(vibrate).not.toHaveBeenCalled();
	});

	it('gets the picker tick ready once, then ticks each change', async () => {
		app.isApp = true;
		const h = await load();
		h.feel('select');
		await settle();
		h.feel('select');
		await settle();
		expect(plugin.selectionStart).toHaveBeenCalledTimes(1);
		expect(plugin.selectionChanged).toHaveBeenCalledTimes(2);
	});

	it('never throws when the plugin fails', async () => {
		app.isApp = true;
		plugin.impact.mockRejectedValueOnce(new Error('no engine'));
		const h = await load();
		expect(() => h.feel('tap')).not.toThrow();
		await settle();
	});
});
