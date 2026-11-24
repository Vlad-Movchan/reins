<!-- Managed by specjig. Project additions go into .claude/rules/security.local.md -->
# Security rules

Applied when writing design, code and reviews. `/security-review` checks the diff; these rules
add what it does not know about this project's domain.

## PII / PHI

- Never log request bodies, headers, tokens, emails, phone numbers, names, addresses, birth
  dates, government IDs, medical data or free-text user input. Log stable internal IDs instead.
- No PII/PHI in URLs (path or query): URLs end up in access logs, browser history and Referer.
  Use POST bodies or opaque IDs.
- Error messages and exceptions returned to clients carry no PII and no stack traces.
- Analytics, traces and metrics labels carry no PII.

## Auth

- Every new endpoint, job and message handler states who may call it; deny by default.
- Authorization is checked on the server, per resource, not only per route.
- Tokens and session IDs never appear in logs, URLs or error messages.

## Tenant isolation

- Every query on tenant-owned data is scoped by tenant, enforced in the data-access layer,
  not left to callers. A test proves tenant A cannot read or modify tenant B's records.
- Caches, queues, file storage keys and search indexes include the tenant.

## In design.md

High-risk changes have a **Security** section: data classification touched, authn/authz
changes, tenant boundary, logging of new fields, and how each is tested.
