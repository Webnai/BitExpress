;; Minimal local mock used by remittance.clar during Clarinet checks/simulation.
(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (if (> amount u0)
    (ok true)
    (err u1)
  )
)
