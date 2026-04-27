export type OmxOwnershipClass = 'exclusive' | 'shared-owner' | 'merge-only' | 'system' | 'forbidden';

export interface OmxOwnershipRule {
  pathPattern: string;
  classification: OmxOwnershipClass;
  ownerTaskId: string | 'system';
}

export interface OmxOwnershipManifest {
  ledgerVersion: 1;
  rules: OmxOwnershipRule[];
}

interface TaskShape {
  taskId: string;
  writeSet: string[];
  sharedArtifacts: string[];
}

interface OwnershipCheckResult {
  allowedPaths: string[];
  rejectedPaths: string[];
  violations: string[];
}

function matchesPattern(pathValue: string, pattern: string) {
  const normalizedPath = pathValue.replace(/^\.\//, '');
  const normalizedPattern = pattern.replace(/^\.\//, '');
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  return normalizedPath === normalizedPattern;
}

export function deriveOmxOwnershipManifest(tasks: TaskShape[]): OmxOwnershipManifest {
  const rules: OmxOwnershipRule[] = [
    { pathPattern: '.omx/**', classification: 'system', ownerTaskId: 'system' },
    { pathPattern: 'README.md', classification: 'system', ownerTaskId: 'system' },
  ];

  for (const task of tasks) {
    for (const writePattern of task.writeSet) {
      rules.push({
        pathPattern: writePattern,
        classification: 'exclusive',
        ownerTaskId: task.taskId,
      });
    }

  }

  const sharedArtifactOwners = new Map<string, string[]>();
  for (const task of tasks) {
    for (const sharedPattern of task.sharedArtifacts) {
      const current = sharedArtifactOwners.get(sharedPattern) || [];
      current.push(task.taskId);
      sharedArtifactOwners.set(sharedPattern, current);
    }
  }

  for (const [sharedPattern, owners] of sharedArtifactOwners) {
    const sortedOwners = [...owners].sort();
    sortedOwners.forEach((ownerTaskId, index) => {
      rules.push({
        pathPattern: sharedPattern,
        classification: index === 0 ? 'shared-owner' : 'merge-only',
        ownerTaskId,
      });
    });
  }

  return {
    ledgerVersion: 1,
    rules,
  };
}

export function assertTaskOwnership(
  manifest: OmxOwnershipManifest,
  taskId: string,
  relativePaths: string[],
): OwnershipCheckResult {
  const result: OwnershipCheckResult = {
    allowedPaths: [],
    rejectedPaths: [],
    violations: [],
  };

  for (const relativePath of relativePaths) {
    const matchingRules = manifest.rules.filter((rule) => matchesPattern(relativePath, rule.pathPattern));
    if (matchingRules.length === 0) {
      result.rejectedPaths.push(relativePath);
      result.violations.push(`${relativePath} has no ownership rule.`);
      continue;
    }

    if (matchingRules.some((rule) => rule.classification === 'forbidden')) {
      result.rejectedPaths.push(relativePath);
      result.violations.push(`${relativePath} is forbidden.`);
      continue;
    }

    const matchingOwner = matchingRules.find((rule) => rule.classification === 'system' || (rule.ownerTaskId === taskId && rule.classification !== 'merge-only'));
    if (!matchingOwner) {
      const owners = [...new Set(matchingRules.map((rule) => `${rule.ownerTaskId} (${rule.classification})`))];
      result.rejectedPaths.push(relativePath);
      result.violations.push(`${relativePath} is owned by ${owners.join(', ')}, not ${taskId}.`);
      continue;
    }

    result.allowedPaths.push(relativePath);
  }

  return result;
}

export function suggestOwnerCandidates(
  manifest: OmxOwnershipManifest,
  taskId: string,
  relativePaths: string[],
): string[] {
  const owners = new Set<string>();

  for (const relativePath of relativePaths) {
    const matchingRules = manifest.rules.filter((rule) => matchesPattern(relativePath, rule.pathPattern));
    for (const rule of matchingRules) {
      if (rule.ownerTaskId !== 'system' && rule.ownerTaskId !== taskId) {
        owners.add(rule.ownerTaskId);
      }
    }
  }

  return [...owners];
}

export function reassignOwnershipForPaths(
  manifest: OmxOwnershipManifest,
  targetTaskId: string,
  relativePaths: string[],
): number {
  let updated = 0;

  for (const rule of manifest.rules) {
    if (rule.classification !== 'shared-owner' && rule.classification !== 'merge-only') {
      continue;
    }

    if (!relativePaths.some((relativePath) => matchesPattern(relativePath, rule.pathPattern))) {
      continue;
    }

    if (rule.classification === 'shared-owner' && rule.ownerTaskId !== targetTaskId) {
      rule.classification = 'merge-only';
      updated += 1;
      continue;
    }

    if (rule.classification === 'merge-only' && rule.ownerTaskId === targetTaskId) {
      rule.classification = 'shared-owner';
      updated += 1;
    }
  }

  return updated;
}
