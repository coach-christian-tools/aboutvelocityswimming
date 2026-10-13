import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) return nextLoad(url, context);
  const source = await readFile(new URL(url), "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return { format: "module", source: result.outputText, shortCircuit: true };
}

// Resolve extensionless relative imports in the domain helpers used by database tests.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error.code !== "ERR_MODULE_NOT_FOUND" ||
      !specifier.startsWith(".") ||
      /\.(?:[cm]?js|tsx?|json)$/.test(specifier)
    )
      throw error;
    return nextResolve(specifier + ".ts", context);
  }
}
