export const STACKS_NETWORK: "mainnet" | "testnet" =
  process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet";
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "ST000000000000000000002AMW42H";
export const CONTRACT_NAME = process.env.NEXT_PUBLIC_CONTRACT_NAME || "remittance";
export const CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as `${string}.${string}`;

export function usdToUsdcxBaseUnits(amountUsd: number): number {
  return Math.round(amountUsd * 1_000_000);
}

export function generateClaimSecretHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSendRemittanceTx(input: {
  receiverWallet: string;
  amountBaseUnits: number;
  sourceCountry: string;
  destCountry: string;
  claimSecretHex: string;
}): Promise<{ txid: string }> {
  const [{ request }, { Cl }] = await Promise.all([
    import("@stacks/connect"),
    import("@stacks/transactions"),
  ]);

  const response = (await request("stx_callContract", {
    contract: CONTRACT_ID,
    functionName: "send-remittance",
    functionArgs: [
      Cl.principal(input.receiverWallet),
      Cl.uint(input.amountBaseUnits),
      Cl.stringAscii(input.sourceCountry),
      Cl.stringAscii(input.destCountry),
      Cl.bufferFromHex(input.claimSecretHex),
    ],
    network: STACKS_NETWORK,
  })) as { txid?: string };

  if (!response?.txid) {
    throw new Error("Wallet did not return a transaction ID for the contract call.");
  }

  return { txid: response.txid };
}

export function getStacksTxExplorerUrl(txid: string): string {
  const normalizedTxid = txid.startsWith("0x") ? txid : `0x${txid}`;
  const baseUrl = STACKS_NETWORK === "mainnet"
    ? "https://explorer.stacks.co/txid"
    : "https://explorer.hiro.so/txid";

  return `${baseUrl}/${normalizedTxid}?chain=${STACKS_NETWORK}`;
}