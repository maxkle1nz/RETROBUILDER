import { realpathSync, type Stats } from 'node:fs';
import { lstat, realpath, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

export type LocalPathKind = 'codebase' | 'document' | 'file' | 'directory';

export class LocalPathAccessError extends Error {
  readonly statusCode: number;
  readonly code: 'missing' | 'not_directory' | 'not_file' | 'denied';

  constructor(message: string, code: LocalPathAccessError['code'], statusCode: number) {
    super(message);
    this.name = 'LocalPathAccessError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface GuardedLocalPath {
  inputPath: string;
  requestedPath: string;
  realPath: string;
  stats: Stats;
}

export function isLocalPathAccessError(error: unknown): error is LocalPathAccessError {
  return error instanceof LocalPathAccessError;
}

function parseExtraAllowedRoots() {
  const raw = process.env.RETROBUILDER_ALLOWED_LOCAL_ROOTS || '';
  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeRoot(rootPath: string) {
  const resolved = path.resolve(rootPath);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function isPathInside(rootPath: string, targetPath: string) {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function defaultAllowedRoots() {
  return [process.cwd(), homedir(), tmpdir(), ...parseExtraAllowedRoots()].map(normalizeRoot);
}

function deniedRoots() {
  return [
    '.ssh',
    '.gnupg',
    '.aws',
    '.azure',
    '.config',
    '.codex',
    '.openclaw',
    '.npmrc',
    '.netrc',
    '.pypirc',
  ].map((entry) => path.join(homedir(), entry));
}

export function explainLocalPathPolicy() {
  return {
    allowedRoots: defaultAllowedRoots(),
    deniedRoots: deniedRoots(),
  };
}

export async function guardLocalPath(inputPath: string, options: {
  kind?: LocalPathKind;
  requireDirectory?: boolean;
  requireFile?: boolean;
} = {}): Promise<GuardedLocalPath> {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new LocalPathAccessError('Missing local path.', 'missing', 400);
  }

  const requestedPath = path.resolve(inputPath);
  if (deniedRoots().some((root) => isPathInside(root, requestedPath))) {
    throw new LocalPathAccessError(
      `Local ${options.kind || 'path'} is outside the Retrobuilder import policy.`,
      'denied',
      403,
    );
  }

  let requestedStats: Stats;
  try {
    requestedStats = await lstat(requestedPath);
  } catch {
    throw new LocalPathAccessError('Local path does not exist.', 'missing', 404);
  }

  let resolvedPath: string;
  try {
    resolvedPath = await realpath(requestedPath);
  } catch {
    throw new LocalPathAccessError('Local path could not be resolved safely.', 'denied', 403);
  }

  const allowed = defaultAllowedRoots().some((root) => isPathInside(root, resolvedPath));
  const denied = deniedRoots().some((root) => isPathInside(root, resolvedPath));

  if (!allowed || denied) {
    throw new LocalPathAccessError(
      `Local ${options.kind || 'path'} is outside the Retrobuilder import policy.`,
      'denied',
      403,
    );
  }

  const resolvedStats = requestedStats.isSymbolicLink() ? await stat(resolvedPath) : requestedStats;
  if (options.requireDirectory && !resolvedStats.isDirectory()) {
    throw new LocalPathAccessError('The provided local path must be a directory.', 'not_directory', 400);
  }
  if (options.requireFile && !resolvedStats.isFile()) {
    throw new LocalPathAccessError('The provided local path must be a file.', 'not_file', 400);
  }

  return {
    inputPath,
    requestedPath,
    realPath: resolvedPath,
    stats: resolvedStats,
  };
}
