export function mandatoryRepairsForPull(ledger, pull, repository) {
  if (!ledger || !Array.isArray(ledger.repairs)) {
    throw new Error('Shared repair ledger must contain a repairs array');
  }
  return ledger.repairs.filter((repair) => {
    if (repair?.status !== 'resolved' || repair?.mandatory_baseline !== true) return false;
    const scope = repair.scope ?? {};
    if (scope.repository && scope.repository !== repository) return false;
    if (scope.base_branch && scope.base_branch !== pull.base?.ref) return false;
    if (scope.applies_to_open_prs === false) return false;
    return typeof repair.canonical_repair_sha === 'string' &&
      /^[a-f0-9]{40}$/i.test(repair.canonical_repair_sha);
  });
}

export function compareSatisfiesRepair(compare) {
  return compare?.status === 'ahead' || compare?.status === 'identical';
}

export function decodeRepairLedger(file) {
  if (!file || file.type !== 'file' || file.encoding !== 'base64' || !file.content) {
    throw new Error('Shared repair ledger is not a normal base64 GitHub file');
  }
  const text = Buffer.from(file.content.replace(/
/g, ''), 'base64').toString('utf8');
  return JSON.parse(text);
}
