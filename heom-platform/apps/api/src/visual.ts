export function compareDifferenceHash(left: string, right: string): { distance: number; similarity: number } {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return { distance: 64, similarity: 0 };
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (value) { distance += Number(value & 1n); value >>= 1n; }
  return { distance, similarity: Math.max(0, 1 - distance / 64) };
}

export function similarityLabel(similarity: number): 'ALTA_SIMILARIDADE' | 'POSSIVEL_CORRESPONDENCIA' | 'BAIXA_SIMILARIDADE' | 'SEM_CORRESPONDENCIA' {
  if (similarity >= 0.85) return 'ALTA_SIMILARIDADE';
  if (similarity >= 0.70) return 'POSSIVEL_CORRESPONDENCIA';
  if (similarity >= 0.55) return 'BAIXA_SIMILARIDADE';
  return 'SEM_CORRESPONDENCIA';
}
