import { bech32, bech32m } from 'bech32';
import bs58check from 'bs58check';

export enum AddressType {
  UNKNOWN = 0,
  P2PKH = 1,
  P2SH = 2,
  P2WPKH = 3,
  P2WSH = 4,
  P2TR = 5
}

// TODO_QOL: move into constant file.
export const BTC_TOKEN_ADDRESS_PREFIX =
  '0x000000000000000000000000BC0000000000000000000000000000000000';

export function getSwapRecipientFromAddress(
  address: string,
  type: AddressType,
): string {
  switch (type) {
    case AddressType.P2PKH:
    case AddressType.P2SH: {
      const decodedData = bs58check.decode(address);
      const unPaddedRecipient = decodedData
        .slice(1)
        .reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');
      const paddedRecipient = unPaddedRecipient.padEnd(64, '0');
      return '0x' + paddedRecipient;
    }

    case AddressType.P2WPKH:
    case AddressType.P2WSH: {
      const decodedData = bech32.decode(address);
      const unPaddedRecipient = bech32
        .fromWords(decodedData.words.slice(1))
        .reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');
      const paddedRecipient = unPaddedRecipient.padEnd(64, '0');
      return '0x' + paddedRecipient;
    }

    case AddressType.P2TR: {
      const decodedData = bech32m.decode(address);
      const recipient = bech32
        .fromWords(decodedData.words.slice(1))
        .reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');
      return '0x' + recipient;
    }

    default:
      throw new Error('Unsupported address type');
  }
}

export const hexStringToUint8Array = (hexString: string) =>
    Uint8Array.from(hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));


export function decodeBitcoinAddress(
  version: AddressType,
  recipientHash: string,
  testnet = false,
): string {
  if (version === AddressType.P2PKH) {
    const prefix = !testnet ? '00' : '6F';
    const bytes = hexStringToUint8Array(prefix + recipientHash.replace('0x', '').slice(0, 40));
    return bs58check.encode(bytes);
  }
  if (version === AddressType.P2SH) {
    const prefix = !testnet ? '05' : 'C4';
    const bytes = hexStringToUint8Array(prefix + recipientHash.replace('0x', '').slice(0, 40));
    return bs58check.encode(bytes);
  }
  const prefix = !testnet ? 'bc' : 'tb';
  if (version === AddressType.P2WPKH) {
    const bytes = hexStringToUint8Array(recipientHash.replace('0x', '').slice(0, 40));
    const words = bech32.toWords(bytes);
    words.unshift(0x00);
    return bech32.encode(prefix, words);
  }
  const bytes = hexStringToUint8Array(recipientHash.replace('0x', '').slice(0, 64));
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
