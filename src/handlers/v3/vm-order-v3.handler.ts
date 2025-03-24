import { CatalystEvent, CatalystOrderDataV3 } from "src/types";
import { ethers, TransactionReceipt } from "ethers";
import { WebSocket } from "ws";
import { abi as CoinFillerAbi } from "../../../abi/CoinFiller.json";
import { abi as WormholeOracleAbi } from "../../../abi/WormholeOracle.json";
import { abi as CompactSettlerAbi } from "../../../abi/CompactSettler.json";
import { ethSigner, baseSigner } from "src/common/signer";
import {
  compactSettlerAddress,
  usdcAddress,
  whOracleAddress,
} from "src/common/constants";
import {
  abi,
  getAddressFromBytes32,
  getBytes32FromAddress,
  getEncodedFillDescription,
  getOrderKeyHashV3,
} from "./utils";

// TODO: get this from the request
const sponsorSig =
  "0x23092378ccc2bc2cb33586f4620f1f44a41fc26b73e8e95356ff0d49418f040c69df82d3802593e5850efacd88ac751e2b93c63f2944bd284dba3a06b3b5787b1b";
const ALWAYS_YES_ORACLE = "0xada1de62be4f386346453a5b6f005bcdbe4515a1";

export async function handleVmOrder(
  orderRequest: CatalystEvent<CatalystOrderDataV3>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ws: WebSocket,
) {
  console.dir(orderRequest, {
    depth: 10,
  });

  const output = orderRequest.data.order.outputs[0];
  console.dir(
    {
      context: "output",
      output,
    },
    {
      depth: 10,
    },
  );
  const fillerAddress = getAddressFromBytes32(output.remoteFiller);

  const fillerContract = new ethers.Contract(
    fillerAddress,
    CoinFillerAbi,
    ethSigner,
  );
  const solverIdentifier = getBytes32FromAddress(output.recipient);
  const orderIdentifier = getOrderKeyHashV3(
    compactSettlerAddress[84532],
    orderRequest.data.order,
  );
  console.log({
    fillerAddress,
    solverIdentifier,
    orderIdentifier,
  });

  // approve coin filler to use usdc tokens
  const usdcContract = new ethers.Contract(
    usdcAddress[11155111],
    [
      {
        type: "function",
        name: "approve",
        inputs: [
          { name: "spender", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
        ],
        outputs: [{ name: "", type: "bool", internalType: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
    ethSigner,
  );
  console.log("approving...");
  await usdcContract.approve(fillerAddress, output.amount);
  console.log("filler approved");

  console.log("filling...");
  const filledTx = await fillerContract.fill(
    orderIdentifier,
    output,
    solverIdentifier,
  );
  console.log("filled tx", filledTx);

  const waitedFilledTx = (await filledTx.wait(1)) as TransactionReceipt;
  console.log("waitedTx", waitedFilledTx);

  const blockNumber = waitedFilledTx.blockNumber;
  const ethBlock = await ethSigner.provider.getBlock(blockNumber);
  const ethTxTimestamp = ethBlock.timestamp;
  console.log({
    ethBlock,
    ethTxTimestamp,
  });
  if (!ethTxTimestamp) throw new Error("ethTxTimestamp is undefined");

  const wormholeContract = new ethers.Contract(
    whOracleAddress[11155111],
    WormholeOracleAbi,
    ethSigner,
  );
  console.log("encoding bytes");
  const fillDescriptionBytes = getEncodedFillDescription(
    solverIdentifier,
    orderIdentifier,
    ethTxTimestamp,
    output,
  );
  console.log("fillDescriptionBytes", fillDescriptionBytes);
  const whTx = await wormholeContract.submit(fillerAddress, [
    fillDescriptionBytes,
  ]);
  console.log("whTx", whTx);
  const whTxAwaited = await whTx.wait(1);
  console.log("whTxAwaited", whTxAwaited);
  // console.log("fill tx", tx);
  // const txReceipt = await provider.getTransactionReceipt(tx.hash);
  // console.log("fill tx receipt", txReceipt);

  const compactOrder = {
    user: orderRequest.data.order.user,
    nonce: orderRequest.data.order.nonce,
    originChainId: orderRequest.data.order.originChainId,
    fillDeadline: orderRequest.data.order.fillDeadline,
    localOracle: ALWAYS_YES_ORACLE,
    inputs: orderRequest.data.order.inputs,
    outputs: orderRequest.data.order.outputs,
  };

  const compactSettler = new ethers.Contract(
    compactSettlerAddress[84532],
    CompactSettlerAbi,
    baseSigner,
  );
  console.log("finalizing...");
  const finalizeTx = await compactSettler.finaliseSelf(
    compactOrder,
    abi.encode(["bytes", "bytes"], [sponsorSig, "0x"]),
    // TODO: should be dynamic
    [ethTxTimestamp],
    // TODO: this should be correctly fetched
    getBytes32FromAddress(baseSigner.address),
  );
  console.log("finalizeTx", finalizeTx);
  const finalizeTxWaited = await finalizeTx.wait(1);
  console.log("finalizeTxWaited", finalizeTxWaited);
  return;
}
