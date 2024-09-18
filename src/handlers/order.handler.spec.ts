import { CrossChainOrder } from 'src/types';
import { handleSignNonEVMToEVMOrder } from './order.handler';

const btcToEVMOrder: CrossChainOrder = {
  swapper: null,
  nonce: null,
  settlementContract: '0x211EA943c29C3680e0A9c6990596bd5460228a0c',
  originChainId: 84532,
  initiateDeadline: 1726549073,
  fillDeadline: 1726855073,
  orderData: {
    type: 'LimitOrder',
    inputs: [
      {
        token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        amount: BigInt(56370),
      },
    ],
    outputs: [
      {
        token:
          '0x000000000000000000000000BC00000000000000000000000000000000000101',
        amount: BigInt(1),
        chainId: 84532,
        recipient:
          '0x338ca326c0a06f574ffae404f67e5189affb8257000000000000000000000000',
        remoteCall: '0x',
        remoteOracle:
          '0x0000000000000000000000004A698444A0982d8C954C94eC18C00c8c1Ce10939',
      },
    ],
    localOracle: '0x4A698444A0982d8C954C94eC18C00c8c1Ce10939',
    proofDeadline: 1726999073,
    collateralToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    challengeDeadline: 1726891073,
    fillerCollateralAmount: BigInt(0),
    challengerCollateralAmount: BigInt(0),
  },
};

describe('handleSignNonEVMToEVMOrder', () => {
  it('should pass', async () => {
    await handleSignNonEVMToEVMOrder(btcToEVMOrder, '', {} as any);
  });
});
