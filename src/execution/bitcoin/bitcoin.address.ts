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
  const prefix = !testnet ? 'bc' : 'tb';
  if (version === AddressType.P2WPKH) {
    const bytes = Buffer.from(
      recipientHash.replace('0x', '').slice(0, 40),
      'hex',
    );
    const words = bech32.toWords(bytes);
    words.unshift(0x00);
    return bech32.encode(prefix, words);
  }
  const bytes = Buffer.from(
    recipientHash.replace('0x', '').slice(0, 64),
    'hex',
  );
  if (version === AddressType.P2WSH) {
    const words = bech32.toWords(bytes);
    words.unshift(0x00);
    return bech32.encode(prefix, words);
  }
  if (version === AddressType.P2TR) {
    const words = bech32m.toWords(bytes);
    words.unshift(0x01);
    return bech32m.encode(prefix, words);
  }

  throw Error(`Unsupported Address Type ${version}`);
}
