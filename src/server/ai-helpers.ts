import { readFile } from 'node:fs/promises';

function canParseJson(candidate: string) {
  try {
    JSON.parse(candidate);
    return true;
  } catch {
    return false;
  }
}

function candidateScore(candidate: string) {
  let score = candidate.length;
  if (candidate.includes('"graph"')) score += 1_000_000;
  if (candidate.includes('"nodes"')) score += 500_000;
  if (candidate.includes('"links"')) score += 250_000;
  if (canParseJson(candidate)) score += 2_000_000;
  return score;
}

function collectBalancedJsonCandidates(text: string) {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

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
      if (depth > 0) depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.substring(start, i + 1).trim());
        start = -1;
      }
    }
  }

  return candidates;
}

export function extractJSONCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates: string[] = [];

  try {
    JSON.parse(trimmed);
    return [trimmed];
  } catch {}

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    const fenced = fenceMatch[1].trim();
    candidates.push(fenced);
  }

  candidates.push(...collectBalancedJsonCandidates(trimmed));

  const uniqueCandidates = [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
  return uniqueCandidates.sort((left, right) => candidateScore(right) - candidateScore(left));
}

export function extractJSON(text: string): string {
  const candidates = extractJSONCandidates(text);
  if (candidates.length > 0) {
    return candidates[0];
  }

  return text.trim();
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
