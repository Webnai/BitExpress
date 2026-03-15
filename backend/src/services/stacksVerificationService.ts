import axios from "axios";

import { CONTRACT_ADDRESS, CONTRACT_NAME, STACKS_NETWORK } from "../config";

interface ContractCallInfo {
  contract_id?: string;
  function_name?: string;
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

function parseTransferIdFromTxResult(txResultRepr?: string): number | undefined {
  if (!txResultRepr) return undefined;
  const match = txResultRepr.match(/^\(ok u(\d+)\)$/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

const STACKS_API_BASE_URL =
  process.env.STACKS_API_URL ||
  (STACKS_NETWORK === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so");

const REMITTANCE_CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`;
const USDCX_ASSET_IDENTIFIER =
  process.env.USDCX_ASSET_IDENTIFIER || `${CONTRACT_ADDRESS}.usdcx::usdcx-token`;

function normalizePrincipal(value?: string): string {
  return (value || "").trim().toUpperCase();
}

function samePrincipal(a?: string, b?: string): boolean {
  return normalizePrincipal(a) === normalizePrincipal(b);
}

export async function verifySendRemittanceTx(
  input: SendRemittanceTxVerificationInput,
): Promise<SendRemittanceTxVerificationResult> {
  try {
    const txId = input.txId.trim();
    if (!txId) {
      return { ok: false, reason: "Missing stacks transaction ID." };
    }

    const response = await axios.get<StacksTxResponse>(
      `${STACKS_API_BASE_URL}/extended/v1/tx/${txId}`,
      { timeout: 10_000 },
    );

    const tx = response.data;

    if (tx.tx_status !== "success") {
      return { ok: false, reason: "Transaction is not successful yet." };
    }

    if (tx.tx_type !== "contract_call") {
      return { ok: false, reason: "Transaction is not a contract call." };
    }

    if (!samePrincipal(tx.sender_address, input.senderWallet)) {
      return { ok: false, reason: "On-chain sender does not match authenticated wallet." };
    }

    const calledContractId = tx.contract_call?.contract_id;
    if (!samePrincipal(calledContractId, REMITTANCE_CONTRACT_ID)) {
      return { ok: false, reason: "Transaction did not call the remittance contract." };
    }

    if (tx.contract_call?.function_name !== "send-remittance") {
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
        samePrincipal(assetId, USDCX_ASSET_IDENTIFIER) &&
        samePrincipal(sender, input.senderWallet) &&
        samePrincipal(recipient, REMITTANCE_CONTRACT_ID) &&
        amount === expectedAmount
      );
    });

    if (!hasExpectedEscrowTransfer) {
      return {
        ok: false,
        reason:
          "Transaction is missing expected USDCx escrow transfer event (sender -> remittance contract, exact amount).",
      };
    }

    const onChainTransferId = parseTransferIdFromTxResult(tx.tx_result?.repr);
    if (onChainTransferId === undefined) {
      return {
        ok: false,
        reason: "Unable to parse remittance transfer ID from transaction result.",
      };
    }

    return { ok: true, onChainTransferId };
  } catch {
    return { ok: false, reason: "Unable to fetch or verify transaction from Stacks API." };
  }
}
