import { readFile } from 'node:fs/promises';

export function extractJSON(text: string): string {
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {}

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    const fenced = fenceMatch[1].trim();
    try {
      JSON.parse(fenced);
      return fenced;
    } catch {}
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return trimmed.substring(start, i + 1);
      }
    }
  }

  return trimmed;
}

function collectFileUris(prompt: string): string[] {
  const matches = prompt.match(/file:\/\/[^\s]+/g) || [];
  return [...new Set(matches)];
}

export async function hydratePromptWithFiles(prompt: string): Promise<string> {
  const uris = collectFileUris(prompt);
  if (uris.length === 0) return prompt;

  const sections: string[] = [];
  for (const uri of uris.slice(0, 6)) {
    try {
      const url = new URL(uri);
      const filePath = decodeURIComponent(url.pathname);
      const content = await readFile(filePath, 'utf8');
      sections.push(
        [
          '## FILE CONTEXT',
          `Source: ${filePath}`,
          content.slice(0, 24000),
        ].join('\n'),
      );
    } catch (error: any) {
      sections.push(
        [
          '## FILE CONTEXT',
          `Source: ${uri}`,
          `ERROR: failed to read file (${error.message || 'unknown error'})`,
        ].join('\n'),
      );
    }
  }

  return `${prompt}\n\n--- ATTACHED FILE CONTENT ---\n\n${sections.join('\n\n---\n\n')}`;
}
