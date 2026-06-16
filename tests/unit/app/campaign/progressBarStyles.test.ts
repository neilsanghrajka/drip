import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/campaign/page.tsx"),
  "utf8",
);

describe("campaign header progress bar styles", () => {
  it("uses a black track with a white fill so completed progress reads as filled", () => {
    expect(pageSource).toContain('role="progressbar"');
    expect(pageSource).toContain(
      'className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full border-[2px] border-black bg-black"',
    );
    expect(pageSource).toContain(
      'className="h-full rounded-full bg-white transition-all duration-500"',
    );
  });
});
