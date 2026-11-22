import { Raw, type FindOperator } from 'typeorm';

let parameterSequence = 0;

/**
 * Substring match for `find({ where })`: `LIKE '%value%'` with `%`, `_` and `\`
 * in the input escaped, so a search for "50%" matches that text literally.
 * SQLite's LIKE ignores ASCII case, so the match is case-insensitive.
 */
export function Contains(value: string): FindOperator<string> {
  const parameter = `contains_${(parameterSequence += 1)}`;
  const pattern = `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return Raw((column) => `${column} LIKE :${parameter} ESCAPE '\\'`, { [parameter]: pattern });
}
