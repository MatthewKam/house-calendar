// Pages of a long list (the recipes): which page numbers to offer in the menu.

/** The pages to offer: all of them when few, else the first, the last and those around this one, with gaps. */
export function pageNumbers(count: number, current: number): (number | null)[] {
	if (count <= 7) return Array.from({ length: count }, (_, i) => i);
	const near = [current - 1, current, current + 1].filter((p) => p > 0 && p < count - 1);
	const out: (number | null)[] = [0];
	if (near[0] > 1) out.push(null);
	out.push(...near);
	if (near[near.length - 1] < count - 2) out.push(null);
	out.push(count - 1);
	return out;
}
