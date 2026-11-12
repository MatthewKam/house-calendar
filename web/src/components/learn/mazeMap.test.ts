import { describe, expect, it } from 'vitest';
import { makeMap } from './mazeMap';

/** Walks the map like the kid would: any step onto a square, a gate only with a key in hand. */
function solvable(grid: string[][], start: [number, number]) {
	// Search over (square, keys held, gates opened), picking up keys as they're reached.
	const seen = new Set<string>();
	const queue: { at: [number, number]; held: number; taken: string[]; opened: string[] }[] = [
		{ at: start, held: 0, taken: [], opened: [] },
	];
	while (queue.length) {
		const {
			at: [r, c],
			held,
			taken,
			opened,
		} = queue.shift()!;
		const id = `${r},${c}|${held}|${taken.sort()}|${opened.sort()}`;
		if (seen.has(id)) continue;
		seen.add(id);
		if (grid[r][c] === 'H') return true;
		for (const [nr, nc] of [
			[r - 1, c],
			[r + 1, c],
			[r, c - 1],
			[r, c + 1],
		]) {
			const cell = grid[nr]?.[nc];
			const key = `${nr},${nc}`;
			if (!cell || cell === '#') continue;
			let h = held;
			let t = taken;
			let o = opened;
			if (cell === 'G' && !o.includes(key)) {
				if (h === 0) continue;
				h -= 1;
				o = [...o, key];
			}
			if (cell === 'K' && !t.includes(key)) {
				h += 1;
				t = [...t, key];
			}
			queue.push({ at: [nr, nc], held: h, taken: t, opened: o });
		}
	}
	return false;
}

describe("Bear's way home maps", () => {
	it('can always be finished, with a key for every gate', () => {
		for (const [rows, cols, keys] of [
			[3, 4, 0],
			[4, 5, 1],
			[4, 6, 1],
			[5, 6, 2],
			[5, 7, 2],
		] as const) {
			for (let i = 0; i < 200; i++) {
				const { grid, start } = makeMap(rows, cols, keys);
				const flat = grid.flat();
				expect(flat.filter((c) => c === 'H')).toHaveLength(1);
				expect(flat.filter((c) => c === 'G')).toHaveLength(keys);
				expect(flat.filter((c) => c === 'K')).toHaveLength(keys);
				expect(solvable(grid, start)).toBe(true);
				// Without keys, the gates really do block the way.
				if (keys)
					expect(
						solvable(
							grid.map((row) => row.map((c) => (c === 'K' ? '.' : c))),
							start,
						),
					).toBe(false);
			}
		}
	});
});
