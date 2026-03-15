import axios from "axios";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
  verifyClaimRemittanceTx,
  verifyRefundRemittanceTx,
  verifySendRemittanceTx,
} from "../services/stacksVerificationService";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

const CONTRACT_ADDRESS = "ST000000000000000000002AMW42H";
const CONTRACT_ID = `${CONTRACT_ADDRESS}.remittance`;
const USDCX_ASSET_IDENTIFIER = `${CONTRACT_ADDRESS}.usdcx::usdcx-token`;

describe("stacksVerificationService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("verifies send-remittance tx and parses transfer id", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        tx_status: "success",
        tx_type: "contract_call",
        sender_address: "SP1SENDER",
        contract_call: {
          contract_id: CONTRACT_ID,
          function_name: "send-remittance",
        },
        tx_result: {
          repr: "(ok u42)",
        },
        events: [
          {
            event_type: "fungible_token_asset",
            asset_identifier: USDCX_ASSET_IDENTIFIER,
            sender: "SP1SENDER",
            recipient: CONTRACT_ID,
            amount: "50000000",
          },
        ],
      },
    } as never);

    const result = await verifySendRemittanceTx({
      txId: "0xsend",
      senderWallet: "SP1SENDER",
      expectedAmount: 50_000_000,
    });

    expect(result.ok).toBe(true);
    expect(result.onChainTransferId).toBe(42);
  });

  it("rejects send tx when wrong contract function is called", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        tx_status: "success",
        tx_type: "contract_call",
        sender_address: "SP1SENDER",
        contract_call: {
          contract_id: CONTRACT_ID,
          function_name: "claim-remittance",
        },
        tx_result: {
          repr: "(ok u42)",
        },
        events: [],
      },
    } as never);

    const result = await verifySendRemittanceTx({
      txId: "0xwrongfn",
      senderWallet: "SP1SENDER",
      expectedAmount: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("send-remittance");
  });

  it("verifies claim-remittance tx against transfer id and claim secret", async () => {
    const claimSecret = "a".repeat(64);

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        tx_status: "success",
        tx_type: "contract_call",
        sender_address: "SP2RECEIVER",
        contract_call: {
          contract_id: CONTRACT_ID,
          function_name: "claim-remittance",
          function_args: [{ repr: "u42" }, { hex: claimSecret }],
        },
      },
    } as never);

    const result = await verifyClaimRemittanceTx({
      txId: "0xclaim",
      receiverWallet: "SP2RECEIVER",
      expectedOnChainTransferId: 42,
      expectedClaimSecretHex: claimSecret,
    });

    expect(result.ok).toBe(true);
  });

  it("verifies refund-remittance tx against on-chain transfer id", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        tx_status: "success",
        tx_type: "contract_call",
        sender_address: "SP1SENDER",
        contract_call: {
          contract_id: CONTRACT_ID,
          function_name: "refund-remittance",
          function_args: [{ repr: "u42" }],
        },
      },
    } as never);

    const result = await verifyRefundRemittanceTx({
      txId: "0xrefund",
      senderWallet: "SP1SENDER",
      expectedOnChainTransferId: 42,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects refund-remittance tx when transfer id mismatches", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        tx_status: "success",
        tx_type: "contract_call",
        sender_address: "SP1SENDER",
        contract_call: {
          contract_id: CONTRACT_ID,
          function_name: "refund-remittance",
          function_args: [{ repr: "u100" }],
        },
      },
    } as never);

    const result = await verifyRefundRemittanceTx({
      txId: "0xrefund-bad",
      senderWallet: "SP1SENDER",
      expectedOnChainTransferId: 42,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("transfer-id");
  });
});