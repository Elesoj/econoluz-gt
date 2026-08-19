import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const collectFiles = (path: string): string[] => {
  if (!existsSync(path)) {
    return [];
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(path, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
};

test("keeps supplier facts and physical catalog paths out of public production payloads", () => {
  const publicPayloadFiles = [
    ...collectFiles(join(process.cwd(), ".next", "static", "chunks")),
    join(process.cwd(), ".next", "server", "app", "catalogo.html"),
    join(process.cwd(), ".next", "server", "app", "catalogo.rsc"),
    ...collectFiles(join(process.cwd(), ".next", "server", "app", "catalogo.segments")),
  ].filter(
    (path) =>
      existsSync(path) && [".js", ".html", ".rsc"].includes(extname(path)),
  );
  const forbidden =
    /supplierCode|supplierBrand|productCode|availability|warranty|APL-001|Artlite|Construlita|Highlum|\/catalogos\/(?:artlite|construlita|highlum)|["']sku["']/gi;
  const findings = publicPayloadFiles.flatMap((path) => {
    const matches = readFileSync(path, "utf8").match(forbidden) ?? [];
    return matches.length
      ? [
          {
            file: relative(process.cwd(), path),
            matches: [...new Set(matches.map((match) => match.toLowerCase()))],
          },
        ]
      : [];
  });

  expect(publicPayloadFiles.length).toBeGreaterThan(0);
  expect(findings).toEqual([]);
});
