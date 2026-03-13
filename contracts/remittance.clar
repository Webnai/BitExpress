;; BitExpress Remittance Smart Contract
;; A low-fee cross-border payment network built on Stacks + sBTC
;; Enables people to send money across African countries with ~1% fees

;; ============================================================
;; Constants
;; ============================================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-AMOUNT (err u101))
(define-constant ERR-TRANSFER-NOT-FOUND (err u102))
(define-constant ERR-ALREADY-CLAIMED (err u103))
(define-constant ERR-ALREADY-REFUNDED (err u104))
(define-constant ERR-NOT-RECEIVER (err u105))
(define-constant ERR-NOT-SENDER (err u106))
(define-constant ERR-TRANSFER-EXPIRED (err u107))
(define-constant ERR-TRANSFER-NOT-EXPIRED (err u108))
(define-constant ERR-INVALID-CLAIM-CODE (err u109))
(define-constant ERR-TRANSFER-LIMIT-EXCEEDED (err u110))

;; Fee is 100 basis points = 1%
(define-constant FEE-BASIS-POINTS u100)
(define-constant BASIS-POINTS-DENOMINATOR u10000)

;; Transfer timeout: ~144 Stacks blocks (Stacks produces ~1 block per ~10 minutes,
;; so 144 Stacks blocks ≈ 24 hours of Stacks block time)
(define-constant TRANSFER-TIMEOUT-BLOCKS u144)

;; Maximum transfer: 1 BTC in satoshis
(define-constant MAX-TRANSFER-AMOUNT u100000000)

;; Minimum transfer: 0.001 BTC in satoshis
(define-constant MIN-TRANSFER-AMOUNT u100000)

;; ============================================================
;; Data Variables
;; ============================================================

(define-data-var transfer-nonce uint u0)
(define-data-var total-fees-collected uint u0)
(define-data-var total-volume uint u0)

;; ============================================================
;; Data Maps
;; ============================================================

(define-map transfers
  { transfer-id: uint }
  {
    sender: principal,
    receiver: principal,
    amount: uint,
    fee: uint,
    net-amount: uint,
    source-country: (string-ascii 3),
    dest-country: (string-ascii 3),
    claim-code-hash: (buff 32),
    status: (string-ascii 10),
    created-at: uint,
    claimed-at: (optional uint),
    refunded-at: (optional uint)
  }
)

(define-map sender-transfers
  { sender: principal }
  { transfer-ids: (list 20 uint) }
)

(define-map receiver-transfers
  { receiver: principal }
  { transfer-ids: (list 20 uint) }
)

(define-map reputation
  { user: principal }
  {
    successful-transfers: uint,
    failed-transfers: uint,
    total-sent: uint,
    total-received: uint
  }
)

;; ============================================================
;; Private Helper Functions
;; ============================================================

(define-private (calculate-fee (amount uint))
  (/ (* amount FEE-BASIS-POINTS) BASIS-POINTS-DENOMINATOR)
)

(define-private (hash-claim-code (code (buff 32)))
  (sha256 code)
)

(define-private (get-next-transfer-id)
  (let ((current-nonce (var-get transfer-nonce)))
    (var-set transfer-nonce (+ current-nonce u1))
    (+ current-nonce u1)
  )
)

(define-private (update-sender-list (sender principal) (transfer-id uint))
  (let (
    (existing (default-to { transfer-ids: (list) } (map-get? sender-transfers { sender: sender })))
    (current-list (get transfer-ids existing))
  )
    (map-set sender-transfers
      { sender: sender }
      { transfer-ids: (unwrap-panic (as-max-len? (append current-list transfer-id) u20)) }
    )
  )
)

(define-private (update-receiver-list (receiver principal) (transfer-id uint))
  (let (
    (existing (default-to { transfer-ids: (list) } (map-get? receiver-transfers { receiver: receiver })))
    (current-list (get transfer-ids existing))
  )
    (map-set receiver-transfers
      { receiver: receiver }
      { transfer-ids: (unwrap-panic (as-max-len? (append current-list transfer-id) u20)) }
    )
  )
)

(define-private (update-reputation-sent (user principal) (amount uint) (success bool))
  (let ((rep (default-to { successful-transfers: u0, failed-transfers: u0, total-sent: u0, total-received: u0 }
                          (map-get? reputation { user: user }))))
    (if success
      (map-set reputation { user: user }
        (merge rep {
          successful-transfers: (+ (get successful-transfers rep) u1),
          total-sent: (+ (get total-sent rep) amount)
        })
      )
      (map-set reputation { user: user }
        (merge rep {
          failed-transfers: (+ (get failed-transfers rep) u1)
        })
      )
    )
  )
)

(define-private (update-reputation-received (user principal) (amount uint))
  (let ((rep (default-to { successful-transfers: u0, failed-transfers: u0, total-sent: u0, total-received: u0 }
                          (map-get? reputation { user: user }))))
    (map-set reputation { user: user }
      (merge rep {
        total-received: (+ (get total-received rep) amount)
      })
    )
  )
)

;; ============================================================
;; Public Functions
;; ============================================================

;; Send a remittance transfer
;; Parameters:
;;   receiver       - recipient's Stacks address
;;   amount         - amount in microSTX (or sBTC satoshis)
;;   source-country - ISO 3166-1 alpha-3 country code for sender (e.g. "GHA")
;;   dest-country   - ISO 3166-1 alpha-3 country code for receiver (e.g. "NGA")
;;   claim-code     - 32-byte hash of the claim secret
(define-public (send-remittance
    (receiver principal)
    (amount uint)
    (source-country (string-ascii 3))
    (dest-country (string-ascii 3))
    (claim-code (buff 32))
  )
  (let (
    (fee (calculate-fee amount))
    (net-amount (- amount fee))
    (transfer-id (get-next-transfer-id))
    (code-hash (hash-claim-code claim-code))
  )
    ;; Validate amount
    (asserts! (>= amount MIN-TRANSFER-AMOUNT) ERR-INVALID-AMOUNT)
    (asserts! (<= amount MAX-TRANSFER-AMOUNT) ERR-TRANSFER-LIMIT-EXCEEDED)

    ;; Transfer tokens from sender to contract (escrow)
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))

    ;; Store the transfer record
    (map-set transfers
      { transfer-id: transfer-id }
      {
        sender: tx-sender,
        receiver: receiver,
        amount: amount,
        fee: fee,
        net-amount: net-amount,
        source-country: source-country,
        dest-country: dest-country,
        claim-code-hash: code-hash,
        status: "pending",
        created-at: block-height,
        claimed-at: none,
        refunded-at: none
      }
    )

    ;; Update index maps
    (update-sender-list tx-sender transfer-id)
    (update-receiver-list receiver transfer-id)

    ;; Update global stats
    (var-set total-volume (+ (var-get total-volume) amount))
    (var-set total-fees-collected (+ (var-get total-fees-collected) fee))

    ;; Update reputation
    (update-reputation-sent tx-sender amount true)

    (ok transfer-id)
  )
)

;; Claim a pending remittance
;; Parameters:
;;   transfer-id  - the ID of the transfer to claim
;;   claim-secret - the original 32-byte secret (pre-image of stored hash)
(define-public (claim-remittance (transfer-id uint) (claim-secret (buff 32)))
  (let (
    (transfer (unwrap! (map-get? transfers { transfer-id: transfer-id }) ERR-TRANSFER-NOT-FOUND))
    (code-hash (hash-claim-code claim-secret))
  )
    ;; Verify status is pending
    (asserts! (is-eq (get status transfer) "pending") ERR-ALREADY-CLAIMED)

    ;; Verify receiver
    (asserts! (is-eq tx-sender (get receiver transfer)) ERR-NOT-RECEIVER)

    ;; Verify claim code
    (asserts! (is-eq code-hash (get claim-code-hash transfer)) ERR-INVALID-CLAIM-CODE)

    ;; Verify transfer has not expired
    (asserts! (<= block-height (+ (get created-at transfer) TRANSFER-TIMEOUT-BLOCKS)) ERR-TRANSFER-EXPIRED)

    ;; Transfer net amount to receiver
    (try! (as-contract (stx-transfer? (get net-amount transfer) tx-sender (get receiver transfer))))

    ;; Transfer fee to contract owner
    (try! (as-contract (stx-transfer? (get fee transfer) tx-sender CONTRACT-OWNER)))

    ;; Update transfer status
    (map-set transfers
      { transfer-id: transfer-id }
      (merge transfer {
        status: "claimed",
        claimed-at: (some block-height)
      })
    )

    ;; Update reputation
    (update-reputation-received (get receiver transfer) (get net-amount transfer))

    (ok true)
  )
)

;; Refund an expired or unclaimed transfer back to the sender
;; Parameters:
;;   transfer-id - the ID of the transfer to refund
(define-public (refund-remittance (transfer-id uint))
  (let (
    (transfer (unwrap! (map-get? transfers { transfer-id: transfer-id }) ERR-TRANSFER-NOT-FOUND))
  )
    ;; Verify status is pending
    (asserts! (is-eq (get status transfer) "pending") ERR-ALREADY-CLAIMED)

    ;; Verify caller is the sender
    (asserts! (is-eq tx-sender (get sender transfer)) ERR-NOT-SENDER)

    ;; Verify transfer has expired
    (asserts! (> block-height (+ (get created-at transfer) TRANSFER-TIMEOUT-BLOCKS)) ERR-TRANSFER-NOT-EXPIRED)

    ;; Refund full amount to sender
    (try! (as-contract (stx-transfer? (get amount transfer) tx-sender (get sender transfer))))

    ;; Update transfer status
    (map-set transfers
      { transfer-id: transfer-id }
      (merge transfer {
        status: "refunded",
        refunded-at: (some block-height)
      })
    )

    ;; Update reputation
    (update-reputation-sent (get sender transfer) (get amount transfer) false)

    (ok true)
  )
)

;; ============================================================
;; Read-Only Functions
;; ============================================================

;; Get details of a specific transfer
(define-read-only (get-transfer-status (transfer-id uint))
  (map-get? transfers { transfer-id: transfer-id })
)

;; Get all transfer IDs sent by a specific principal
(define-read-only (get-sender-transfers (sender principal))
  (default-to { transfer-ids: (list) } (map-get? sender-transfers { sender: sender }))
)

;; Get all transfer IDs received by a specific principal
(define-read-only (get-receiver-transfers (receiver principal))
  (default-to { transfer-ids: (list) } (map-get? receiver-transfers { receiver: receiver }))
)

;; Get reputation data for a user
(define-read-only (get-reputation (user principal))
  (default-to
    { successful-transfers: u0, failed-transfers: u0, total-sent: u0, total-received: u0 }
    (map-get? reputation { user: user })
  )
)

;; Calculate the fee for a given amount
(define-read-only (calculate-transfer-fee (amount uint))
  (ok (calculate-fee amount))
)

;; Get global platform statistics
(define-read-only (get-platform-stats)
  {
    total-transfers: (var-get transfer-nonce),
    total-volume: (var-get total-volume),
    total-fees-collected: (var-get total-fees-collected)
  }
)

;; Check whether a transfer claim code is valid (without claiming)
(define-read-only (verify-claim-code (transfer-id uint) (claim-secret (buff 32)))
  (let (
    (transfer (unwrap! (map-get? transfers { transfer-id: transfer-id }) ERR-TRANSFER-NOT-FOUND))
    (code-hash (hash-claim-code claim-secret))
  )
    (ok (is-eq code-hash (get claim-code-hash transfer)))
  )
)
