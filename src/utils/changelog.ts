import fs from 'node:fs';
import path from 'node:path';

export type ChangelogGroup = {
  date: string;
  commits: { hash: string; message: string }[];
};

export function getChangelog(): ChangelogGroup[] {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf-8');
  } catch {
    return [];
  }

  const groups: ChangelogGroup[] = [];
  let current: ChangelogGroup | null = null;

  for (const line of raw.split('\n')) {
    const dateMatch = line.match(/^## (.+)$/);
    if (dateMatch) {
      current = { date: dateMatch[1], commits: [] };
      groups.push(current);
      continue;
    }
    const commitMatch = line.match(/^- `([0-9a-f]+)` (.+)$/);
    if (commitMatch && current) {
      current.commits.push({ hash: commitMatch[1], message: commitMatch[2] });
    }
  }

  return groups;
}
