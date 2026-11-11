import { describe, expect, it } from "vitest";
import { firstName, isKid } from "./people";
import { listOf } from "./useCheer";
import { dueLabel, isDue, isLate } from "./lists";

describe("people", () => {
	it("tells kids from grown-ups and people not set up", () => {
		expect(isKid({ stage: "little" })).toBe(true);
		expect(isKid({ stage: "teen" })).toBe(true);
		expect(isKid({ stage: "adult" })).toBe(false);
		expect(isKid({ stage: null })).toBe(false);
	});

	it("uses first names, and lists them like a sentence", () => {
		expect(firstName("Tayen Kam")).toBe("Tayen");
		expect(firstName("Nolan")).toBe("Nolan");
		expect(listOf(["Ice cream"])).toBe("Ice cream");
		expect(listOf(["Ice cream", "Zoo trip"])).toBe("Ice cream and Zoo trip");
		expect(listOf(["A", "B", "C"])).toBe("A, B and C");
	});
});

describe("list reminders", () => {
	const now = new Date(2026, 10, 10, 15, 0);
	it("is due on its day, or once its time has passed, and late after", () => {
		expect(isDue("2026-11-10", now)).toBe(true);
		expect(isDue("2026-11-11", now)).toBe(false);
		expect(isLate("2026-11-10", now)).toBe(false);
		expect(isLate("2026-11-09", now)).toBe(true);
		expect(isDue(new Date(2026, 10, 10, 14, 0).toISOString(), now)).toBe(true);
		expect(isLate(new Date(2026, 10, 10, 16, 0).toISOString(), now)).toBe(false);
	});

	it("says when in words", () => {
		expect(dueLabel("2026-11-10", now)).toBe("Today");
		expect(dueLabel("2026-11-11", now)).toBe("Tomorrow");
		expect(dueLabel("2026-11-09", now)).toBe("Yesterday");
		expect(dueLabel(new Date(2026, 10, 11, 9, 30).toISOString(), now)).toMatch(/^Tomorrow 9:30/);
	});
});
