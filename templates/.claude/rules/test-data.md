---
paths:
  - "**/*test*/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/*_test.*"
  - "**/test_*.*"
  - "**/fixtures/**"
  - "**/seeds/**"
  - "**/factories/**"
  - "e2e/**"
---
<!-- Managed by sdd-harness. -->
# Test data rules

- Synthetic data only. Generate fixtures with factories or a seeded faker (fixed seed, so runs
  are reproducible). Never copy records from production, staging, dumps or support tickets.
- Use reserved values: emails `@example.com`, phones from the fictional ranges, IPs from
  192.0.2.0/24, card numbers from the payment provider's published test set.
- No real secrets in tests. Use obviously fake values (`test-key-not-secret`) and inject via
  config, so production keys can never be picked up by a test run.
- Tests map to scenarios in the change's `tests.md`; name tests after the scenario they cover.
