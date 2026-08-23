import { parseCsv } from "./csv.util";

describe("parseCsv", () => {
  it("parses plain rows keyed by lower-cased header", () => {
    const rows = parseCsv("Name,Price\nShampoo,590\n");
    expect(rows).toEqual([{ name: "Shampoo", price: "590" }]);
  });

  it("handles a quoted field containing a comma", () => {
    const rows = parseCsv('name,brand\n"Face Cream, 60g",F&H\n');
    expect(rows).toEqual([{ name: "Face Cream, 60g", brand: "F&H" }]);
  });

  it("handles a doubled quote inside a quoted field", () => {
    const rows = parseCsv('name,notes\n"A ""premium"" shampoo",-\n');
    expect(rows).toEqual([{ name: 'A "premium" shampoo', notes: "-" }]);
  });

  it("skips blank trailing lines", () => {
    const rows = parseCsv("name,price\nShampoo,590\n\n");
    expect(rows).toHaveLength(1);
  });

  it("returns an empty array for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
