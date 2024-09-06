import { bech32, bech32m } from 'bech32';
import bs58check from 'bs58check';

enum AddressType {
  Unknown,
  P2PKH,
  P2SH,
  P2WPKH,
  P2WSH,
  P2TR,
}

export function decodeBitcoinAddress(
  version: AddressType,
  recipientHash: string,
  testnet = false,
): string {
  if (version === AddressType.P2PKH) {
    const prefix = !testnet ? '00' : '6F';
    const bytes = Buffer.from(
      prefix + recipientHash.replace('0x', '').slice(0, 40), // Select the first 20 bytes.
      'hex',
    );
    return bs58check.encode(bytes);
  }
  if (version === AddressType.P2SH) {
    const prefix = !testnet ? '05' : 'C4';
    const bytes = Buffer.from(
      prefix + recipientHash.replace('0x', '').slice(0, 40), // Select the first 20 bytes.
      'hex',
    );
    return bs58check.encode(bytes);
  }
  let prefix = !testnet ? 'bc1' : 'tb1';
  if (version === AddressType.P2WPKH) {
    const bytes = Buffer.from(
      recipientHash.replace('0x', '').slice(0, 40),
      'hex',
    );
    prefix += 'q';
    return bech32.encode(prefix, bech32.toWords(bytes));
  }
  const bytes = Buffer.from(
    recipientHash.replace('0x', '').slice(0, 64),
    'hex',
  );
  if (version === AddressType.P2WSH) {
    prefix += 'q';
    return bech32.encode(prefix, bech32.toWords(bytes));
  }
  if (version === AddressType.P2TR) {
    prefix += 'p';
    return bech32m.encode(prefix, bech32.toWords(bytes));
  }

  throw Error(`Unsupported Address Type ${version}`);
}
