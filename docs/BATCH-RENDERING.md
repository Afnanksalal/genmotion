# Deterministic batch rendering

`parseBatchRows` accepts JSON arrays, JSONL records and CSV parameter tables. Every row is validated against the project’s typed parameters, receives a stable content identity and portable output name, and must have unique row and case-insensitive output identities.

`executeBatch` resolves each row into a complete project and hands it to the caller’s native render executor under a bounded 1–32 worker pool. Progress reports include the completed count and row receipt. Failures remain isolated, while the durable state file records accepted and failed results after every row. A retry skips an accepted row only when its parameter hash and output name still match; changed or failed rows execute again. `retry: all` explicitly reruns every row.
