import axios from "axios";

import { CONTRACT_ADDRESS, CONTRACT_NAME, STACKS_NETWORK } from "../config";
import { logError, logInfo } from "../utils/logging";

interface ContractCallInfo {
  contract_id?: string;
  function_name?: string;
  function_args?: Array<{
    repr?: string;
    hex?: string;
  }>;
}

interface FungibleAssetDetails {
  asset_id?: string;
  sender?: string;
  recipient?: string;
  amount?: string;
}

interface TxEvent {
  event_type?: string;
  asset?: FungibleAssetDetails;
  asset_identifier?: string;
  sender?: string;
  recipient?: string;
  amount?: string;
}

interface StacksTxResponse {
  tx_status?: string;
  tx_type?: string;
  sender_address?: string;
  contract_call?: ContractCallInfo;
  events?: TxEvent[];
  tx_result?: {
    repr?: string;
  };
}

export interface SendRemittanceTxVerificationInput {
  txId: string;
  senderWallet: string;
  expectedAmount: number;
}

export interface SendRemittanceTxVerificationResult {
  ok: boolean;
  reason?: string;
  onChainTransferId?: number;
}

export interface ClaimRemittanceTxVerificationInput {
  txId: string;
  receiverWallet: string;
  expectedOnChainTransferId: number;
  expectedClaimSecretHex: string;
}

export interface ClaimRemittanceTxVerificationResult {
  ok: boolean;
  reason?: string;
}

export interface RefundRemittanceTxVerificationInput {
  txId: string;
  senderWallet: string;
  expectedOnChainTransferId: number;
}

export interface RefundRemittanceTxVerificationResult {
  ok: boolean;
  reason?: string;
}

function parseTransferIdFromTxResult(txResultRepr?: string): number | undefined {
  if (!txResultRepr) return undefined;
  const match = txResultRepr.match(/^\(ok u(\d+)\)$/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function parseUintRepr(repr?: string): number | undefined {
  if (!repr) return undefined;
  const match = repr.match(/^u(\d+)$/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function normalizeHexBuffer(value?: string): string {
  return (value || "").trim().toLowerCase().replace(/^0x/, "");
}

const STACKS_API_BASE_URL =
  process.env.STACKS_API_URL ||
  (STACKS_NETWORK === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so");

const REMITTANCE_CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`;
// The sBTC asset identifier used to verify escrow events on-chain.
// Testnet default: same-namespace .sbtc-token-v3 (deploy a SIP-010 mock).
// Mainnet: set SBTC_ASSET_IDENTIFIER=SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc
const SBTC_ASSET_IDENTIFIER =
  process.env.SBTC_ASSET_IDENTIFIER || `${CONTRACT_ADDRESS}.sbtc-token-v3::sbtc`;

function normalizePrincipal(value?: string): string {
  return (value || "").trim().toUpperCase();
}

function samePrincipal(a?: string, b?: string): boolean {
  return normalizePrincipal(a) === normalizePrincipal(b);
}

function buildTxStatusFailureReason(
  status: string | undefined,
  txResultRepr: string | undefined,
  actionLabel: string,
): string {
  const normalized = (status || "").toLowerCase();
  if (normalized === "success") {
    return "";
  }

  if (normalized.startsWith("abort") || normalized.startsWith("failed")) {
    return txResultRepr
      ? `${actionLabel} failed on-chain (${status}): ${txResultRepr}`
      : `${actionLabel} failed on-chain (${status}).`;
  }

  return `${actionLabel} is not successful yet.`;
}

export async function verifySendRemittanceTx(
  input: SendRemittanceTxVerificationInput,
): Promise<SendRemittanceTxVerificationResult> {
  const txId = input.txId.trim();

  logInfo("stacks.verify_send.start", {
    txId,
    senderWallet: input.senderWallet,
    expectedAmount: input.expectedAmount,
  });

  try {
    if (!txId) {
      logInfo("stacks.verify_send.failed", {
        txId,
        reason: "Missing stacks transaction ID.",
      });
      return { ok: false, reason: "Missing stacks transaction ID." };
    }

    const response = await axios.get<StacksTxResponse>(
      `${STACKS_API_BASE_URL}/extended/v1/tx/${txId}`,
      { timeout: 10_000 },
    );

    const tx = response.data;

    logInfo("stacks.verify_send.tx", {
      txId,
      txStatus: tx.tx_status,
      txType: tx.tx_type,
      senderAddress: tx.sender_address,
      contractId: tx.contract_call?.contract_id,
      functionName: tx.contract_call?.function_name,
      eventCount: tx.events?.length ?? 0,
    });

    if (tx.tx_status !== "success") {
      const reason = buildTxStatusFailureReason(
        tx.tx_status,
        tx.tx_result?.repr,
        "Transaction",
      );
      logInfo("stacks.verify_send.failed", {
        txId,
        reason,
        txStatus: tx.tx_status,
        txResultRepr: tx.tx_result?.repr,
      });
      return { ok: false, reason };
    }

    if (tx.tx_type !== "contract_call") {
      logInfo("stacks.verify_send.failed", {
        txId,
        reason: "Transaction is not a contract call.",
        txType: tx.tx_type,
      });
      return { ok: false, reason: "Transaction is not a contract call." };
    }

    if (!samePrincipal(tx.sender_address, input.senderWallet)) {
      logInfo("stacks.verify_send.failed", {
        txId,
        reason: "On-chain sender does not match authenticated wallet.",
        senderAddress: tx.sender_address,
        expectedSender: input.senderWallet,
      });
      return { ok: false, reason: "On-chain sender does not match authenticated wallet." };
    }

    const calledContractId = tx.contract_call?.contract_id;
    if (!samePrincipal(calledContractId, REMITTANCE_CONTRACT_ID)) {
      logInfo("stacks.verify_send.failed", {
        txId,
        reason: "Transaction did not call the remittance contract.",
        calledContractId,
        expectedContractId: REMITTANCE_CONTRACT_ID,
      });
      return { ok: false, reason: "Transaction did not call the remittance contract." };
    }

    if (tx.contract_call?.function_name !== "send-remittance") {
      logInfo("stacks.verify_send.failed", {
        txId,
        reason: "Transaction did not call send-remittance.",
        functionName: tx.contract_call?.function_name,
      });
      return { ok: false, reason: "Transaction did not call send-remittance." };
    }

    const expectedAmount = String(input.expectedAmount);
    const hasExpectedEscrowTransfer = (tx.events || []).some((event) => {
      if (event.event_type !== "fungible_token_asset") {
        return false;
      }

      const assetId = event.asset?.asset_id || event.asset_identifier;
      const sender = event.asset?.sender || event.sender;
      const recipient = event.asset?.recipient || event.recipient;
      const amount = event.asset?.amount || event.amount;

      return (
        samePrincipal(assetId, SBTC_ASSET_IDENTIFIER) &&
        samePrincipal(sender, input.senderWallet) &&
        samePrincipal(recipient, REMITTANCE_CONTRACT_ID) &&
        amount === expectedAmount
      );
    });

    if (!hasExpectedEscrowTransfer) {
      logInfo("stacks.verify_send.failed", {
        txId,
        reason:
          "Transaction is missing expected sBTC escrow transfer event (sender -> remittance contract, exact amount).",
        expectedAssetId: SBTC_ASSET_IDENTIFIER,
        expectedSender: input.senderWallet,
        expectedRecipient: REMITTANCE_CONTRACT_ID,
        expectedAmount,
      });
      return {
        ok: false,
        reason:
          "Transaction is missing expected sBTC escrow transfer event (sender -> remittance contract, exact amount).",
      };
    }

    const onChainTransferId = parseTransferIdFromTxResult(tx.tx_result?.repr);
    if (onChainTransferId === undefined) {
      logInfo("stacks.verify_send.failed", {
        txId,
        reason: "Unable to parse remittance transfer ID from transaction result.",
        txResultRepr: tx.tx_result?.repr,
      });
      return {
        ok: false,
        reason: "Unable to parse remittance transfer ID from transaction result.",
      };
    }

    logInfo("stacks.verify_send.succeeded", {
      txId,
      onChainTransferId,
    });

    return { ok: true, onChainTransferId };
  } catch (error) {
    logError("stacks.verify_send.error", {
      txId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, reason: "Unable to fetch or verify transaction from Stacks API." };
  }
}

export async function verifyClaimRemittanceTx(
  input: ClaimRemittanceTxVerificationInput,
): Promise<ClaimRemittanceTxVerificationResult> {
  const txId = input.txId.trim();

  logInfo("stacks.verify_claim.start", {
    txId,
    receiverWallet: input.receiverWallet,
    expectedOnChainTransferId: input.expectedOnChainTransferId,
  });

  try {
    if (!txId) {
      logInfo("stacks.verify_claim.failed", {
        txId,
        reason: "Missing stacks transaction ID.",
      });
      return { ok: false, reason: "Missing stacks transaction ID." };
    }

    const response = await axios.get<StacksTxResponse>(
      `${STACKS_API_BASE_URL}/extended/v1/tx/${txId}`,
      { timeout: 10_000 },
    );

    const tx = response.data;

    logInfo("stacks.verify_claim.tx", {
      txId,
      txStatus: tx.tx_status,
      txType: tx.tx_type,
      senderAddress: tx.sender_address,
      contractId: tx.contract_call?.contract_id,
      functionName: tx.contract_call?.function_name,
    });

    if (tx.tx_status !== "success") {
      const reason = buildTxStatusFailureReason(
        tx.tx_status,
        tx.tx_result?.repr,
        "Claim transaction",
      );
      logInfo("stacks.verify_claim.failed", {
        txId,
        reason,
        txStatus: tx.tx_status,
        txResultRepr: tx.tx_result?.repr,
      });
      return { ok: false, reason };
    }

    if (tx.tx_type !== "contract_call") {
      logInfo("stacks.verify_claim.failed", {
        txId,
        reason: "Claim transaction is not a contract call.",
        txType: tx.tx_type,
      });
      return { ok: false, reason: "Claim transaction is not a contract call." };
    }

    if (!samePrincipal(tx.sender_address, input.receiverWallet)) {
      logInfo("stacks.verify_claim.failed", {
        txId,
        reason: "On-chain claimer does not match authenticated receiver wallet.",
        senderAddress: tx.sender_address,
        expectedReceiver: input.receiverWallet,
      });
      return { ok: false, reason: "On-chain claimer does not match authenticated receiver wallet." };
    }

    const calledContractId = tx.contract_call?.contract_id;
    if (!samePrincipal(calledContractId, REMITTANCE_CONTRACT_ID)) {
      logInfo("stacks.verify_claim.failed", {
        txId,
        reason: "Claim transaction did not call the remittance contract.",
        calledContractId,
        expectedContractId: REMITTANCE_CONTRACT_ID,
      });
      return { ok: false, reason: "Claim transaction did not call the remittance contract." };
    }

    if (tx.contract_call?.function_name !== "claim-remittance") {
      logInfo("stacks.verify_claim.failed", {
        txId,
        reason: "Transaction did not call claim-remittance.",
        functionName: tx.contract_call?.function_name,
      });
      return { ok: false, reason: "Transaction did not call claim-remittance." };
    }

    const transferIdArg = tx.contract_call?.function_args?.[0];
    const claimSecretArg = tx.contract_call?.function_args?.[1];

    const transferIdFromTx = parseUintRepr(transferIdArg?.repr);
    if (transferIdFromTx === undefined || transferIdFromTx !== input.expectedOnChainTransferId) {
      logInfo("stacks.verify_claim.failed", {
        txId,
        reason: "Claim transaction transfer-id does not match transfer record.",
        transferIdFromTx,
        expectedTransferId: input.expectedOnChainTransferId,
      });
      return { ok: false, reason: "Claim transaction transfer-id does not match transfer record." };
    }

    const claimSecretFromTx = normalizeHexBuffer(claimSecretArg?.repr || claimSecretArg?.hex);
    const expectedClaimSecret = normalizeHexBuffer(input.expectedClaimSecretHex);

    if (!claimSecretFromTx || claimSecretFromTx !== expectedClaimSecret) {
      logInfo("stacks.verify_claim.failed", {
        txId,
        reason: "Claim transaction claim secret does not match provided claim secret.",
      });
      return { ok: false, reason: "Claim transaction claim secret does not match provided claim secret." };
    }

    logInfo("stacks.verify_claim.succeeded", {
      txId,
      transferId: transferIdFromTx,
    });

    return { ok: true };
  } catch (error) {
    logError("stacks.verify_claim.error", {
      txId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, reason: "Unable to fetch or verify claim transaction from Stacks API." };
  }
}

export async function verifyRefundRemittanceTx(
  input: RefundRemittanceTxVerificationInput,
): Promise<RefundRemittanceTxVerificationResult> {
  const txId = input.txId.trim();

  logInfo("stacks.verify_refund.start", {
    txId,
    senderWallet: input.senderWallet,
    expectedOnChainTransferId: input.expectedOnChainTransferId,
  });

  try {
    if (!txId) {
      logInfo("stacks.verify_refund.failed", {
        txId,
        reason: "Missing stacks transaction ID.",
      });
      return { ok: false, reason: "Missing stacks transaction ID." };
    }

    const response = await axios.get<StacksTxResponse>(
      `${STACKS_API_BASE_URL}/extended/v1/tx/${txId}`,
      { timeout: 10_000 },
    );

    const tx = response.data;

    logInfo("stacks.verify_refund.tx", {
      txId,
      txStatus: tx.tx_status,
      txType: tx.tx_type,
      senderAddress: tx.sender_address,
      contractId: tx.contract_call?.contract_id,
      functionName: tx.contract_call?.function_name,
    });

    if (tx.tx_status !== "success") {
      const reason = buildTxStatusFailureReason(
        tx.tx_status,
        tx.tx_result?.repr,
        "Refund transaction",
      );
      logInfo("stacks.verify_refund.failed", {
        txId,
        reason,
        txStatus: tx.tx_status,
        txResultRepr: tx.tx_result?.repr,
      });
      return { ok: false, reason };
    }

    if (tx.tx_type !== "contract_call") {
      logInfo("stacks.verify_refund.failed", {
        txId,
        reason: "Refund transaction is not a contract call.",
        txType: tx.tx_type,
      });
      return { ok: false, reason: "Refund transaction is not a contract call." };
    }

    if (!samePrincipal(tx.sender_address, input.senderWallet)) {
      logInfo("stacks.verify_refund.failed", {
        txId,
        reason: "On-chain refunder does not match authenticated sender wallet.",
        senderAddress: tx.sender_address,
        expectedSender: input.senderWallet,
      });
      return { ok: false, reason: "On-chain refunder does not match authenticated sender wallet." };
    }

    const calledContractId = tx.contract_call?.contract_id;
    if (!samePrincipal(calledContractId, REMITTANCE_CONTRACT_ID)) {
      logInfo("stacks.verify_refund.failed", {
        txId,
        reason: "Refund transaction did not call the remittance contract.",
        calledContractId,
        expectedContractId: REMITTANCE_CONTRACT_ID,
      });
      return { ok: false, reason: "Refund transaction did not call the remittance contract." };
    }

    if (tx.contract_call?.function_name !== "refund-remittance") {
      logInfo("stacks.verify_refund.failed", {
        txId,
        reason: "Transaction did not call refund-remittance.",
        functionName: tx.contract_call?.function_name,
      });
      return { ok: false, reason: "Transaction did not call refund-remittance." };
    }

    const transferIdArg = tx.contract_call?.function_args?.[0];
    const transferIdFromTx = parseUintRepr(transferIdArg?.repr);
    if (transferIdFromTx === undefined || transferIdFromTx !== input.expectedOnChainTransferId) {
      logInfo("stacks.verify_refund.failed", {
        txId,
        reason: "Refund transaction transfer-id does not match transfer record.",
        transferIdFromTx,
        expectedTransferId: input.expectedOnChainTransferId,
      });
      return { ok: false, reason: "Refund transaction transfer-id does not match transfer record." };
    }

    logInfo("stacks.verify_refund.succeeded", {
      txId,
      transferId: transferIdFromTx,
    });

    return { ok: true };
  } catch (error) {
    logError("stacks.verify_refund.error", {
      txId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, reason: "Unable to fetch or verify refund transaction from Stacks API." };
  }
}
