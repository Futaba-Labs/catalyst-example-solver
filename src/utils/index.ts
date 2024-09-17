export function formatRemoteOracleAddress(remoteOracle: string): string {
  const noPrefix = remoteOracle.replace('0x', '').toLowerCase();
  return `0x${noPrefix.padStart(64, '0')}`;
}
