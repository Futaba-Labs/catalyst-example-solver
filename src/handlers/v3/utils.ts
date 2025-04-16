import { AbiCoder, ethers, keccak256, solidityPacked } from "ethers";
import { CrossChainOrderV3, OutputDescription_v3 } from "src/types";

export const abi = AbiCoder.defaultAbiCoder();

export const getOrderKeyHashV3 = (
  compactSettlerAddress: string,
  order: CrossChainOrderV3,
): string => {
  return keccak256(
    solidityPacked(
      [
        "uint256",
        "address",
        "address",
        "uint256",
        "uint32",
        "address",
        "uint256[2][]",
        "bytes",
      ],
      [
        order.originChainId,
        compactSettlerAddress,
        order.user,
        order.nonce,
        order.fillDeadline,
        order.localOracle,
        order.inputs,
        abi.encode(
          ["(bytes32,bytes32,uint256,bytes32,uint256,bytes32,bytes,bytes)[]"],
          [
            order.outputs.map((output) => [
              output.remoteOracle,
              output.remoteFiller,
              output.chainId,
              output.token,
              output.amount,
              output.recipient,
              output.remoteCall,
              output.fulfillmentContext,
            ]),
          ],
        ),
      ],
    ),
  );
};

export const getEncodedFillDescription = (
  solver: string,
  orderId: string,
  timestamp: number,
  output: OutputDescription_v3,
) => {
  console.log({
    solver,
    orderId,
    timestamp,
    output,
  });
  return solidityPacked(
    [
      "bytes32",
      "bytes32",
      "uint32",
      "bytes32",
      "uint256",
      "bytes32",
      "uint16",
      "bytes",
      "uint16",
      "bytes",
    ],
    [
      solver,
      orderId,
      timestamp,
      output.token,
      output.amount,
      output.recipient,
      output.remoteCall.replace("0x", "").length / 2,
      output.remoteCall,
      output.fulfillmentContext.replace("0x", "").length / 2,
      output.fulfillmentContext,
    ],
  );
};

export function getBytes32FromAddress(address: string) {
  return ethers.zeroPadValue(address, 32);
}

export function getAddressFromBytes32(bytes32String: string) {
  return ethers.dataSlice(bytes32String, 12, 32);
}
