import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

export const CharacterRoleSchema = z.enum([
  'president',
  'pm',
  'engineer',
  'reviewer',
]);

export type CharacterRole = z.infer<typeof CharacterRoleSchema>;

export interface Character {
  role: CharacterRole;
  name: string;
  description: string;
}

const CHARACTER_HEADING_PATTERN = /^#\s+(.+?)\s*—\s*.+$/u;

function parseCharacter(
  role: CharacterRole,
  contents: string,
  filePath: string,
): Character {
  const [heading = '', ...descriptionLines] = contents.split(/\r?\n/u);
  const headingMatch = CHARACTER_HEADING_PATTERN.exec(heading);

  if (headingMatch === null) {
    throw new Error(
      `Invalid character heading in ${filePath}: expected "# <name> — <role>"`,
    );
  }

  const name = headingMatch[1]?.trim();
  const description = descriptionLines.join('\n').trim();

  if (name === undefined || name.length === 0 || description.length === 0) {
    throw new Error(`Invalid character definition in ${filePath}`);
  }

  return { role, name, description };
}

export async function loadCharacters(
  charactersDirectory = 'characters',
): Promise<Character[]> {
  const entries = await readdir(charactersDirectory, { withFileTypes: true });
  const characterFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        path.extname(entry.name) === '.md' &&
        entry.name !== 'README.md',
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  return Promise.all(
    characterFiles.map(async (entry) => {
      const filePath = path.join(charactersDirectory, entry.name);
      const role = CharacterRoleSchema.parse(path.basename(entry.name, '.md'));
      const contents = await readFile(filePath, 'utf8');

      return parseCharacter(role, contents, filePath);
    }),
  );
}
