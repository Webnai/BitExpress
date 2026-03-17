;; Test/local sBTC mock with SIP-010-like transfer semantics.
;; This contract exposes an FT named `sbtc`, so balances appear in:
;; /extended/v1/address/<principal>/balances as <deployer>.sbtc-token-v3::sbtc

(define-fungible-token sbtc)

(define-constant ERR-NON-POSITIVE-AMOUNT u1)
(define-constant ERR-NOT-TOKEN-SENDER u2)
(define-constant ERR-FAUCET-ALREADY-USED u3)
(define-constant ERR-INVALID-SENDER u4)
(define-constant ERR-INVALID-RECIPIENT u5)

;; 10 sBTC in satoshis.
(define-constant FAUCET-AMOUNT u1000000000)

(define-map faucet-claimed
  { user: principal }
  { claimed: bool }
)

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! (> amount u0) (err ERR-NON-POSITIVE-AMOUNT))
    (asserts! (match memo memo-bytes true true) (err ERR-NON-POSITIVE-AMOUNT))
    ;; Keep tx-sender based auth so remittance can escrow from caller.
    (asserts! (is-eq tx-sender sender) (err ERR-NOT-TOKEN-SENDER))
    (asserts! (is-standard sender) (err ERR-INVALID-SENDER))
    ;; Recipient may be a contract principal (e.g. remittance escrow). Do not
    ;; restrict with is-standard here - any valid principal is an acceptable recipient.
    (try! (ft-transfer? sbtc amount sender recipient))
    (ok true)
  )
)

;; Test helper: mint once per wallet.
(define-public (faucet)
  (let (
    (already-claimed (default-to false (get claimed (map-get? faucet-claimed { user: tx-sender }))))
  )
    (asserts! (not already-claimed) (err ERR-FAUCET-ALREADY-USED))
    (map-set faucet-claimed { user: tx-sender } { claimed: true })
    (try! (ft-mint? sbtc FAUCET-AMOUNT tx-sender))
    (ok true)
  )
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance sbtc account))
)
