import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "./locales/en";
import es from "./locales/es";
import fr from "./locales/fr";
import de from "./locales/de";
import pt from "./locales/pt";
import zh from "./locales/zh";
import { LANGUAGES } from "./languages";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}|<\/?(\w+)>/g)].map((m) => m[0]).sort();

const english = flatten(en);
const locales: Record<string, Tree> = { es, fr, de, pt, zh };

describe("locales", () => {
  it("ships a dictionary for every listed language", () => {
    const shipped = ["en", ...Object.keys(locales)].sort();
    expect(LANGUAGES.map((language) => language.code).sort()).toEqual(shipped);
  });

  for (const [code, tree] of Object.entries(locales)) {
    const translated = flatten(tree);

    it(`${code} has exactly the English keys`, () => {
      expect(Object.keys(translated).sort()).toEqual(
        Object.keys(english).sort(),
      );
    });

    it(`${code} keeps every placeholder and tag`, () => {
      for (const [key, text] of Object.entries(english)) {
        expect(placeholders(translated[key] ?? ""), `${code}:${key}`).toEqual(
          placeholders(text),
        );
      }
    });
  }
});

describe("source", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== "ui" && name !== "locales") walk(path);
      } else if (/\.tsx?$/.test(name) && !name.endsWith(".spec.ts")) {
        files.push(path);
      }
    }
  };
  walk(root);

  // A key resolves if it exists directly or as a plural/context variant.
  const resolves = (key: string) =>
    key in english ||
    Object.keys(english).some((known) => known.startsWith(`${key}_`));

  it("only uses keys that exist in the English dictionary", () => {
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /\bt\(\s*"([\w.]+)"|i18nKey="([\w.]+)"/g,
      )) {
        const key = match[1] ?? match[2];
        if (!resolves(key)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
