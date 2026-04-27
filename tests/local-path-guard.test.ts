#!/usr/bin/env tsx
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import {
  guardLocalPath,
  isLocalPathAccessError,
} from '../src/server/local-path-guard.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function expectPathError(
  run: () => Promise<unknown>,
  statusCode: number,
  code: string,
  message: string,
) {
  try {
    await run();
  } catch (error) {
    expect(isLocalPathAccessError(error), `${message}: expected LocalPathAccessError`);
    expect(error.statusCode === statusCode, `${message}: expected status ${statusCode}, got ${error.statusCode}`);
    expect(error.code === code, `${message}: expected code ${code}, got ${error.code}`);
    return;
  }
  throw new Error(`${message}: expected path guard to reject`);
}

async function test_allows_repo_and_tmp_roots() {
  const repoPath = await guardLocalPath(process.cwd(), { kind: 'codebase', requireDirectory: true });
  expect(repoPath.realPath === await realpath(process.cwd()), 'Expected cwd to be allowed.');

  const tempDir = await mkdtemp(path.join(tmpdir(), 'retrobuilder-path-guard-'));
  try {
    const guarded = await guardLocalPath(tempDir, { kind: 'codebase', requireDirectory: true });
    expect(guarded.realPath === await realpath(tempDir), 'Expected tmpdir fixture to be allowed.');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function test_rejects_denied_roots_and_outside_roots() {
  await expectPathError(
    () => guardLocalPath('/etc', { kind: 'codebase', requireDirectory: true }),
    403,
    'denied',
    'outside-root directory',
  );
  await expectPathError(
    () => guardLocalPath(path.join(homedir(), '.ssh', 'id_rsa'), { kind: 'file' }),
    403,
    'denied',
    'secret home root',
  );
}

async function test_rejects_non_directory_when_required() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'retrobuilder-path-guard-'));
  const tempFile = path.join(tempDir, 'README.md');
  try {
    await writeFile(tempFile, '# fixture\n', 'utf8');
    await expectPathError(
      () => guardLocalPath(tempFile, { kind: 'codebase', requireDirectory: true }),
      400,
      'not_directory',
      'non-directory codebase',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function test_rejects_symlink_escape() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'retrobuilder-path-guard-'));
  const linked = path.join(tempDir, 'outside');
  try {
    await mkdir(tempDir, { recursive: true });
    await symlink('/etc', linked);
    await expectPathError(
      () => guardLocalPath(linked, { kind: 'codebase', requireDirectory: true }),
      403,
      'denied',
      'symlink escape',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function run() {
  await test_allows_repo_and_tmp_roots();
  await test_rejects_denied_roots_and_outside_roots();
  await test_rejects_non_directory_when_required();
  await test_rejects_symlink_escape();
  console.log('PASS local path guard contract');
}

run().catch((error) => {
  console.error('FAIL local path guard contract');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
