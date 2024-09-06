import { ethers } from 'ethers';

const MINUTES = 60000;
const UNDERWRITING_DURATION = 5 * MINUTES;

export function createFillerData(
  payTo: string,
  accelerationOffer: number,
  execData = '',
): string {
  const now = Date.now();
  const underwriteBy = now + UNDERWRITING_DURATION;
  if (execData.length === 0) {
    const fillerDataVersion = '0x01';
    const fillerAddress = payTo.replace('0x', '');
    const orderPurchaseDeadline = Number(underwriteBy)
      .toString(16)
      .padStart(4 * 2, '0');
    const orderDiscount = Math.floor(accelerationOffer * (2 ** 16 - 1))
      .toString(16)
      .padStart(2 * 2, '0');
    return (
      fillerDataVersion + fillerAddress + orderPurchaseDeadline + orderDiscount
    );
  } else {
    const fillerDataVersion = '0x02';
    const fillerAddress = payTo.replace('0x', '');
    const orderPurchaseDeadline = Number(underwriteBy)
      .toString(16)
      .padStart(4 * 2, '0');
    const orderDiscount = Math.floor(accelerationOffer * (2 ** 16 - 1))
      .toString(16)
      .padStart(2 * 2, '0');
    return (
      fillerDataVersion +
      fillerAddress +
      orderPurchaseDeadline +
      orderDiscount +
      ethers.keccak256(execData).replace('0x', '')
    );
  }
}
