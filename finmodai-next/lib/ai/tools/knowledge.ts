import 'server-only';

import fs from "fs";
import path from "path";

const SEARCH_DIRS = ['.', 'docs', 'README.md', 'FINMODAI_README.md'];

export async function searchKnowledge(query: string) {
  const results: { file: string; snippet: string }[] = [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  for (const dir of SEARCH_DIRS) {
    const fullPath = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(fullPath);
      for (const f of files) {
        const filePath = path.join(fullPath, f);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();
          if (terms.every((t) => content.includes(t))) {
            results.push({ file: filePath, snippet: content.slice(0, 300) });
          }
        }
      }
    } else {
      const content = fs.readFileSync(fullPath, 'utf-8').toLowerCase();
      if (terms.every((t) => content.includes(t))) {
        results.push({ file: fullPath, snippet: content.slice(0, 300) });
      }
    }
  }

  return { ok: true, data: results.slice(0, 10) };
}
