import { getE2EMockTxId } from "@/lib/e2e";
import { logClientError, logClientInfo } from "@/lib/debug";

export const STACKS_NETWORK: "mainnet" | "testnet" =
  process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet";
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
export const CONTRACT_NAME = process.env.NEXT_PUBLIC_CONTRACT_NAME || "remittance";
export const CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as `${string}.${string}`;
const STACKS_API_BASE_URL =
  process.env.NEXT_PUBLIC_STACKS_API_URL ||
  (STACKS_NETWORK === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so");

interface StacksTxLookup {
  tx_status?: string;
  tx_result?: {
    repr?: string;
  };
}

function formatOnChainFailureMessage(status: string, txResult?: string): string {
  if (!txResult) {
    return `On-chain transaction failed (${status}).`;
  }

  if (txResult.includes("(err none)")) {
    return "On-chain transaction failed: sBTC transfer into escrow was rejected (err none). This usually means insufficient sBTC balance, wrong network, or unsupported token setup for the connected wallet.";
  }

  return `On-chain transaction failed (${status}): ${txResult}`;
}

export function usdToSbtcSatoshis(amountUsd: number, btcUsdPrice: number): number {
  if (btcUsdPrice <= 0) return 0;
  return Math.round((amountUsd / btcUsdPrice) * 100_000_000);
}

export function generateClaimSecretHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSendRemittanceTx(input: {
  receiverWallet: string;
  amountSatoshis: number;
  sourceCountry: string;
  destCountry: string;
  claimSecretHex: string;
}): Promise<{ txid: string }> {
  const mockTxId = getE2EMockTxId("send");
  if (mockTxId) {
    logClientInfo("stacks.send.mock_response", {
      contract: CONTRACT_ID,
      txid: mockTxId,
    });
    return { txid: mockTxId };
  }

  const [{ request }, { Cl }] = await Promise.all([
    import("@stacks/connect"),
    import("@stacks/transactions"),
  ]);

  logClientInfo("stacks.send.request", {
    contract: CONTRACT_ID,
    network: STACKS_NETWORK,
    receiverWallet: input.receiverWallet,
    amountSatoshis: input.amountSatoshis,
    sourceCountry: input.sourceCountry,
    destCountry: input.destCountry,
  });

  try {
    const response = (await request("stx_callContract", {
      contract: CONTRACT_ID,
      functionName: "send-remittance",
      functionArgs: [
        Cl.principal(input.receiverWallet),
        Cl.uint(input.amountSatoshis),
        Cl.stringAscii(input.sourceCountry),
        Cl.stringAscii(input.destCountry),
        Cl.bufferFromHex(input.claimSecretHex),
      ],
      network: STACKS_NETWORK,
    })) as { txid?: string };

    logClientInfo("stacks.send.response", {
      contract: CONTRACT_ID,
      response,
    });

    if (!response?.txid) {
      throw new Error("Wallet did not return a transaction ID for the contract call.");
    }

    return { txid: response.txid };
  } catch (error) {
    logClientError("stacks.send.failed", {
      contract: CONTRACT_ID,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

export function normalizeClaimSecretHex(claimSecret: string): string {
  const sanitized = claimSecret.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(sanitized)) {
    throw new Error("Claim secret must be a 32-byte hex string.");
  }
  return sanitized;
}

export async function createClaimRemittanceTx(input: {
  transferId: number;
  claimSecretHex: string;
}): Promise<{ txid: string }> {
  const mockTxId = getE2EMockTxId("claim");
  if (mockTxId) {
    logClientInfo("stacks.claim.mock_response", {
      contract: CONTRACT_ID,
      txid: mockTxId,
    });
    return { txid: mockTxId };
  }

  const [{ request }, { Cl }] = await Promise.all([
    import("@stacks/connect"),
    import("@stacks/transactions"),
  ]);

  logClientInfo("stacks.claim.request", {
    contract: CONTRACT_ID,
    network: STACKS_NETWORK,
    transferId: input.transferId,
  });

  try {
    const response = (await request("stx_callContract", {
      contract: CONTRACT_ID,
      functionName: "claim-remittance",
      functionArgs: [
        Cl.uint(input.transferId),
        Cl.bufferFromHex(input.claimSecretHex),
      ],
      network: STACKS_NETWORK,
    })) as { txid?: string };

    logClientInfo("stacks.claim.response", {
      contract: CONTRACT_ID,
      response,
    });

    if (!response?.txid) {
      throw new Error("Wallet did not return a transaction ID for claim-remittance.");
    }

    return { txid: response.txid };
  } catch (error) {
    logClientError("stacks.claim.failed", {
      contract: CONTRACT_ID,
      transferId: input.transferId,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

export async function createRefundRemittanceTx(input: {
  transferId: number;
}): Promise<{ txid: string }> {
  const mockTxId = getE2EMockTxId("refund");
  if (mockTxId) {
    logClientInfo("stacks.refund.mock_response", {
      contract: CONTRACT_ID,
      txid: mockTxId,
    });
    return { txid: mockTxId };
  }

  const [{ request }, { Cl }] = await Promise.all([
    import("@stacks/connect"),
    import("@stacks/transactions"),
  ]);

  logClientInfo("stacks.refund.request", {
    contract: CONTRACT_ID,
    network: STACKS_NETWORK,
    transferId: input.transferId,
  });

  try {
    const response = (await request("stx_callContract", {
      contract: CONTRACT_ID,
      functionName: "refund-remittance",
      functionArgs: [Cl.uint(input.transferId)],
      network: STACKS_NETWORK,
    })) as { txid?: string };

    logClientInfo("stacks.refund.response", {
      contract: CONTRACT_ID,
      response,
    });

    if (!response?.txid) {
      throw new Error("Wallet did not return a transaction ID for refund-remittance.");
    }

    return { txid: response.txid };
  } catch (error) {
    logClientError("stacks.refund.failed", {
      contract: CONTRACT_ID,
      transferId: input.transferId,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

export function getStacksTxExplorerUrl(txid: string): string {
  const normalizedTxid = txid.startsWith("0x") ? txid : `0x${txid}`;
  const baseUrl = STACKS_NETWORK === "mainnet"
    ? "https://explorer.stacks.co/txid"
    : "https://explorer.hiro.so/txid";

  return `${baseUrl}/${normalizedTxid}?chain=${STACKS_NETWORK}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForStacksTxSuccess(
  txid: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const normalizedTxid = txid.replace(/^0x/, "");
  const mockTxIds = [getE2EMockTxId("send"), getE2EMockTxId("claim"), getE2EMockTxId("refund")]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/^0x/, ""));
  const deadline = Date.now() + timeoutMs;

  if (mockTxIds.includes(normalizedTxid)) {
    logClientInfo("stacks.tx.wait_mock_succeeded", {
      txid: normalizedTxid,
    });
    return;
  }

  logClientInfo("stacks.tx.wait_started", {
    txid: normalizedTxid,
    timeoutMs,
    pollIntervalMs,
    network: STACKS_NETWORK,
  });

  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${STACKS_API_BASE_URL}/extended/v1/tx/${normalizedTxid}`,
        { cache: "no-store" },
      );

      if (response.ok) {
        const data = (await response.json()) as StacksTxLookup;
        const status = data.tx_status || "unknown";

        if (status === "success") {
          logClientInfo("stacks.tx.wait_succeeded", {
            txid: normalizedTxid,
            status,
          });
          return;
        }

        if (status.startsWith("abort") || status.startsWith("failed")) {
          const txResult = data.tx_result?.repr;
          const message = formatOnChainFailureMessage(status, txResult);

          logClientError("stacks.tx.wait_failed", {
            txid: normalizedTxid,
            status,
            txResult,
          });
          throw new Error(message);
        }

        logClientInfo("stacks.tx.wait_pending", {
          txid: normalizedTxid,
          status,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (message.startsWith("On-chain transaction failed")) {
        throw error;
      }

      logClientError("stacks.tx.wait_poll_error", {
        txid: normalizedTxid,
        message,
      });
    }

    await sleep(pollIntervalMs);
  }

  throw new Error("Transaction is still pending on-chain. Please retry in a few seconds.");
}