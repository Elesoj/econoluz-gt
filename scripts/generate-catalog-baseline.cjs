/* eslint-disable @typescript-eslint/no-require-imports -- The script registers a CommonJS TypeScript loader before loading the catalog modules. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const root = path.resolve(__dirname, "..");
const fixturePath = path.join(root, "tests", "fixtures", "catalog-baseline.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const { products } = require(path.join(root, "app", "data", "products.ts"));
const { createCatalogBaseline } = require(path.join(root, "tests", "helpers", "catalog-baseline.ts"));
const generated = createCatalogBaseline(products);

fs.writeFileSync(
  fixturePath,
  `${JSON.stringify({ ...generated, ...fixture, references: generated.references, products: generated.products }, null, 2)}\n`,
);
