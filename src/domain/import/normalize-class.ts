// Class and name normalization so "L.K.G-B", "LKG B" and "Lower KG (B)" are one class.

const clean = (s: string) =>
  s
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/[-_/\\()\[\],:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CANONICAL: Array<[RegExp, string]> = [
  [/^(PLAYGROUP|PLAYGRP|PLAYWAY|PLAYSCHOOL|PLAY|PG)$/, "Playgroup"],
  [/^(PRENURSERY|PRENUR|PRENRY)$/, "Pre-Nursery"],
  [/^(NURSERY|NUR|NRY|NURS)$/, "Nursery"],
  [/^(LKG|LOWERKG|LOWERKINDERGARTEN|KG1|KGI|JRKG|JUNIORKG)$/, "LKG"],
  [/^(UKG|UPPERKG|UPPERKINDERGARTEN|KG2|KGII|SRKG|SENIORKG)$/, "UKG"],
];

/** Order used when a class is first created. */
export const CLASS_ORDER = ["Playgroup", "Pre-Nursery", "Nursery", "LKG", "UKG"];

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export type NormalClass = { key: string; className: string; section: string; label: string };

export function normalizeClass(classRaw: unknown, sectionRaw: unknown): NormalClass | null {
  let cls = clean(String(classRaw ?? ""));
  let section = clean(String(sectionRaw ?? "")).replace(/^(SECTION|SEC)\s*/, "").replace(/\s/g, "");
  if (!cls) return null;
  cls = cls.replace(/^(CLASS|STD|GRADE)\s+/, "");
  // "LKG B" in the class column with no section column.
  if (!section) {
    const m = /^(.*\S)\s+([A-Z])$/.exec(cls);
    if (m) {
      cls = m[1];
      section = m[2];
    }
  }
  const compact = cls.replace(/\s/g, "");
  const canonical = CANONICAL.find(([re]) => re.test(compact));
  const className = canonical ? canonical[1] : titleCase(cls);
  const key = `${className.toUpperCase().replace(/[\s-]/g, "")}|${section}`;
  return { key, className, section, label: section ? `${className} ${section}` : className };
}

/** Key for matching a person's name: case, dots and spacing ignored. */
export function nameKey(name: unknown): string {
  return String(name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Teacher names also ignore honorifics: "Ms. Kaur" = "Mrs Kaur" = "Kaur Ma'am". */
export function teacherKey(name: unknown): string {
  return nameKey(name)
    .replace(/['’]/g, "")
    .split(" ")
    .filter((w) => !/^(ms|mrs|miss|mr|mam|maam|madam|mdm|smt|km|kumari|sh|shri|sir|teacher)$/.test(w))
    .join(" ");
}

export function tidyName(name: unknown): string {
  return String(name ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function tidyAdmissionNo(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(Math.trunc(v)) : String(v);
  return s.normalize("NFKC").toUpperCase().replace(/\s+/g, "").replace(/\.0+$/, "");
}
