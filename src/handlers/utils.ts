import { AbiCoder, ethers, keccak256, solidityPacked } from "ethers";
import { CATALYST_SETTLER_ADDRESS } from "src/common/constants";
import { CompactOrder, OutputDescription, StandardOrder } from "src/types";

export const abi = AbiCoder.defaultAbiCoder();

export const getOrderKeyHashV3 = (
  compactSettlerAddress: string,
  order: CompactOrder,
): string => {
  console.log("order", order.inputs);
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
        order.inputs.map((input) => [BigInt(input[0]), input[1]]),
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

// New function for StandardOrder hash calculation based on reference implementation
export const getStandardOrderHash = (
  compactSettlerAddress: string,
  order: StandardOrder,
): string => {
  return keccak256(
    solidityPacked(
      [
        "uint256",
        "address",
        "address",
        "uint256",
        "uint32",
        "uint32",
        "address",
        "uint256[2][]",
        "bytes",
      ],
      [
        order.originChainId,
        CATALYST_SETTLER_ADDRESS[Number(order.originChainId)],
        order.user,
        order.nonce,
        order.expires,
        order.fillDeadline,
        order.localOracle,
        order.inputs,
        abi.encode(
          [
            "(bytes32 oracle, bytes32 settler, uint256 chainId, bytes32 token, uint256 amount, bytes32 recipient, bytes call, bytes context)[]",
          ],
          [order.outputs],
        ),
      ],
    ),
  );
};

export const getEncodedFillDescription = (
  solver: string,
  orderId: string,
  timestamp: number,
  output: OutputDescription | any,
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
      output.remoteCall?.replace("0x", "")?.length / 2 || 0,
      output.remoteCall || "0x",
      output.fulfillmentContext?.replace("0x", "")?.length / 2 || 0,
      output.fulfillmentContext || "0x",
    ],
  );
};

export function getBytes32FromAddress(address: string) {
  // Validate input address
  if (!address || typeof address !== "string") {
    throw new Error("Invalid address: address must be a non-empty string");
  }

  // Remove 0x prefix if present
  const cleanAddress = address.startsWith("0x") ? address : `0x${address}`;

  // Validate address format (should be 42 characters with 0x prefix)
  if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  return ethers.zeroPadValue(cleanAddress, 32);
}

export function getAddressFromBytes32(bytes32String: string) {
  // Validate input
  if (!bytes32String || typeof bytes32String !== "string") {
    throw new Error("Invalid bytes32 string: must be a non-empty string");
  }

  // Remove 0x prefix if present for length calculation
  const cleanString = bytes32String.startsWith("0x")
    ? bytes32String.slice(2)
    : bytes32String;
  const dataLength = cleanString.length / 2; // Convert hex string length to byte length

  // If it's already a 20-byte address (40 hex characters), return as is
  if (dataLength === 20) {
    return bytes32String.startsWith("0x")
      ? bytes32String
      : `0x${bytes32String}`;
  }

  // If it's a 32-byte string (64 hex characters), extract the address part
  if (dataLength === 32) {
    try {
      // Method 1: Use ethers.dataSlice
      const slicedAddress = ethers.dataSlice(bytes32String, 12, 32);
      console.log(`DEBUG: Original bytes32: ${bytes32String}`);
      console.log(`DEBUG: Sliced address: ${slicedAddress}`);

      // Validate and normalize with ethers.getAddress
      const normalizedAddress = ethers.getAddress(slicedAddress);
      console.log(`DEBUG: Normalized address: ${normalizedAddress}`);
      return normalizedAddress;
    } catch (sliceError) {
      console.log(`DEBUG: dataSlice method failed: ${sliceError.message}`);

      // Method 2: Manual string extraction as fallback
      try {
        // Extract last 40 hex characters (20 bytes) manually
        const hexString = bytes32String.startsWith("0x")
          ? bytes32String.slice(2)
          : bytes32String;

        if (hexString.length !== 64) {
          throw new Error(
            `Expected 64 hex characters, got ${hexString.length}`,
          );
        }

        // Take the last 40 characters (20 bytes)
        const addressHex = hexString.slice(-40);
        const extractedAddress = `0x${addressHex}`;

        console.log(`DEBUG: Manual extraction result: ${extractedAddress}`);

        // Validate the manually extracted address
        const validatedAddress = ethers.getAddress(extractedAddress);
        console.log(`DEBUG: Validated manual address: ${validatedAddress}`);
        return validatedAddress;
      } catch (manualError) {
        throw new Error(
          `Failed to extract address from bytes32: ${bytes32String}. Slice error: ${sliceError.message}. Manual error: ${manualError.message}`,
        );
      }
    }
  }

  // If it's neither 20 nor 32 bytes, throw an error
  throw new Error(
    `Invalid data length: expected 20 or 32 bytes, got ${dataLength} bytes for ${bytes32String}`,
  );
}
