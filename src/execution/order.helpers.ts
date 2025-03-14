import { AbiCoder } from "ethers";
import {
  CrossChainOrder,
  Input,
  OutputDescription,
} from "src/types/cross-chain-order.types";

const abi = new AbiCoder();

export function flattenInputs(inputs: Input[]) {
  return inputs.map((input) => [input.token, input.amount]);
}

export function flattenOutputs(outputs: OutputDescription[]) {
  return outputs.map((output) => [
    output.remoteOracle,
    output.token,
    output.amount,
    output.recipient,
    output.chainId,
    output.remoteCall,
  ]);
}

export function encodeOrderData(
  orderData: CrossChainOrder["orderData"],
): string {
  if (orderData.type === "LimitOrder") {
    return abi.encode(
      [
        "tuple(uint32,uint32,address,uint256,uint256,address,tuple(address,uint256)[],tuple(bytes32,bytes32,uint256,bytes32,uint32,bytes)[])",
      ],
      [
        [
          orderData.proofDeadline,
          orderData.challengeDeadline,
          orderData.collateralToken,
          orderData.fillerCollateralAmount,
          orderData.challengerCollateralAmount,
          orderData.localOracle,
          flattenInputs(orderData.inputs),
          flattenOutputs(orderData.outputs),
        ],
      ],
    );
  } else if (orderData.type === "DutchAuction") {
    return abi.encode(
      [
        "tuple(bytes32,address,uint32,uint32,address,uint256,uint256,address,uint32,int256[],int256[],tuple(address,uint256)[],tuple(bytes32,bytes32,uint256,bytes32,uint32,bytes)[])",
      ],
      [
        [
          orderData.verificationContext,
          orderData.verificationContract,
          orderData.proofDeadline,
          orderData.challengeDeadline,
          orderData.collateralToken,
          orderData.fillerCollateralAmount,
          orderData.challengerCollateralAmount,
          orderData.localOracle,
          orderData.slopeStartingTime,
          orderData.inputSlopes,
          orderData.outputSlopes,
          flattenInputs(orderData.inputs),
          flattenOutputs(orderData.outputs),
        ],
      ],
    );
  } else {
    throw Error(`Order type not implemented ${(orderData as any).type}`);
  }
}
