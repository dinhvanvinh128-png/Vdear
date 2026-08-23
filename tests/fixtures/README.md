# Test fixtures

Hand-written payloads shaped after each provider's **documented** response
schema, used to verify the normalization layer offline.

These are **test doubles for the mappers only**. They are never imported by
`lib/` or `app/`, never served to the UI, and never used as a fallback when a
provider is unavailable — an unavailable provider is reported as unavailable.
