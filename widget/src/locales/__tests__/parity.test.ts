import { describe, it, expect } from "vitest";
import { locales, type LocaleCode } from "../index";
import { en } from "../en";

const expectedKeys = Object.keys(en).sort();
const localeCodes = Object.keys(locales) as LocaleCode[];

describe("locale key parity", () => {
  for (const code of localeCodes) {
    it(`${code} has exactly the English key set (no missing or extra keys)`, () => {
      expect(Object.keys(locales[code]).sort()).toEqual(expectedKeys);
    });

    it(`${code} has no empty string values`, () => {
      for (const [key, value] of Object.entries(locales[code])) {
        expect(typeof value, `${code}.${key} should be a string`).toBe(
          "string",
        );
        expect(value, `${code}.${key} should not be empty`).not.toBe("");
      }
    });
  }
});
