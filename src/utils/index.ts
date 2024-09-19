import { bech32, bech32m } from 'bech32';
import bs58check from 'bs58check';
import { AddressType } from 'bitcoin-address-validation';
import { BTC_TOKEN_ADDRESS_PREFIX } from 'src/common/constants';

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isFromBTCToEvm(asset: string) {
  // Check if the first 30 bytes are the bitcoin identifier.
  // The last 2 bytes signify number of confirmations & address type.
  return (
    asset.toLowerCase().slice(0, 60 + 2) ===
    BTC_TOKEN_ADDRESS_PREFIX.toLowerCase()
  );
}

export function formatRemoteOracleAddress(remoteOracle: string): string {
  const noPrefix = remoteOracle.replace('0x', '').toLowerCase();
  return `0x${noPrefix.padStart(64, '0')}`;
}

export function getBitcoinAddressVersion(
  addressType: AddressType,
): 1 | 2 | 3 | 4 | 5 {
  switch (addressType) {
    case AddressType.p2pkh:
      return 1;
    case AddressType.p2sh:
      return 2;
    case AddressType.p2wpkh:
      return 3;
    case AddressType.p2wsh:
      return 4;
    case AddressType.p2tr:
      return 5;
    default:
      throw new Error(`Unsupported address type: ${addressType}`);
  }
}

export function getBitcoinAddressType(
  addressVersion: 1 | 2 | 3 | 4 | 5,
): AddressType {
  switch (addressVersion) {
    case 1:
      return AddressType.p2pkh;
    case 2:
      return AddressType.p2sh;
    case 3:
      return AddressType.p2wpkh;
    case 4:
      return AddressType.p2wsh;
    case 5:
      return AddressType.p2tr;
    default:
      throw new Error(`Unsupported address type: ${addressVersion}`);
  }
}

export function getSwapRecipientFromAddress(
  address: string,
  type: AddressType,
): string {
  switch (type) {
    case AddressType.p2pkh:
    case AddressType.p2sh: {
      const decodedData = bs58check.decode(address);
      const unPaddedRecipient = decodedData
        .slice(1)
        .reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');
      const paddedRecipient = unPaddedRecipient.padEnd(64, '0');
      return '0x' + paddedRecipient;
    }

    case AddressType.p2wpkh:
    case AddressType.p2wsh: {
      const decodedData = bech32.decode(address);
      const unPaddedRecipient = bech32
        .fromWords(decodedData.words.slice(1))
        .reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');
      const paddedRecipient = unPaddedRecipient.padEnd(64, '0');
      return '0x' + paddedRecipient;
    }

    case AddressType.p2tr: {
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
