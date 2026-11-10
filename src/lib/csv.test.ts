import { describe, expect, it } from "vitest";
import { formatCsvCell } from "./csv";

describe("csv utilities", () => {
  it("formats plain alphanumeric cells without quotes", () => {
    expect(formatCsvCell("RM-WOOD-001")).toBe("RM-WOOD-001");
    expect(formatCsvCell(125000)).toBe("125000");
  });

  it("escapes cells containing commas, quotes, and newlines", () => {
    expect(formatCsvCell("Board, Oak 2x4")).toBe('"Board, Oak 2x4"');
    expect(formatCsvCell('Board "Grade A"')).toBe('"Board ""Grade A"""');
    expect(formatCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
  });

  it("handles null, undefined, and boolean values cleanly", () => {
    expect(formatCsvCell(null)).toBe("");
    expect(formatCsvCell(undefined)).toBe("");
    expect(formatCsvCell(true)).toBe("true");
    expect(formatCsvCell(false)).toBe("false");
  });
});
