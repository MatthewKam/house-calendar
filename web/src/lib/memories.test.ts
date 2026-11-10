import { describe, expect, it } from "vitest";
import { memoriesFor } from "./memories";
import type { Photo } from "./types";

/** A photo taken at noon (local) on a day. */
const photo = (id: string, day: string): Photo => ({
	id, width: 1, height: 1, takenAt: new Date(`${day}T12:00:00`).toISOString(), memberId: null, source: "upload",
	inSlideshow: true, createdAt: "", url: "", thumbUrl: "", kind: "photo", seconds: null, ready: true, progress: null,
});
const notes = (m: ReturnType<typeof memoriesFor>) => m && { title: m.title, items: m.items.map((i) => `${i.photo.id}: ${i.note}`) };

describe("memories", () => {
	it("finds this day a year or more ago, or the nearest day before it", () => {
		const photos = [photo("lastYear", "2025-11-10"), photo("twoYears", "2024-11-03"), photo("tooEarly", "2023-09-01"), photo("recent", "2026-11-08")];
		expect(notes(memoriesFor(photos, "2026-11-10"))).toEqual({
			title: "On this day",
			items: ["lastYear: 1 year ago", "twoYears: 2 years ago · Nov 3"],
		});
	});

	it("without any from a year back: the past week, else the past month", () => {
		expect(notes(memoriesFor([photo("a", "2026-11-08"), photo("b", "2026-10-08")], "2026-11-10"))).toEqual({
			title: "This past week",
			items: ["a: Nov 8"],
		});
		// Since the start of last month (not today's own).
		expect(notes(memoriesFor([photo("b", "2026-10-08"), photo("c", "2026-10-01"), photo("d", "2026-09-30"), photo("e", "2026-11-10")], "2026-11-10"))).toEqual({
			title: "This past month",
			items: ["b: Oct 8", "c: Oct 1"],
		});
		expect(memoriesFor([photo("d", "2026-09-30")], "2026-11-10")).toBeNull();
	});
});
