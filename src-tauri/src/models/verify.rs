//! SHA-256 verification for downloaded model artifacts.
//!
//! The OCR consumer delegates fetching to oar-ocr's `auto-download`, which
//! HTTPS-fetches from ModelScope and SHA-256-verifies internally. This helper is
//! the shared facility's own verification primitive for consumers that download
//! themselves (whisper STT, Phase 2): a mismatched hash MUST reject the artifact
//! (security-privacy.md, dependency/supply-chain risk). Pure and network-free so
//! it is unit-tested without any download.

use sha2::{Digest, Sha256};

/// Lowercase hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// Whether `bytes` hashes to `expected` (case-insensitive hex compare).
pub fn verify_sha256(bytes: &[u8], expected: &str) -> bool {
    sha256_hex(bytes).eq_ignore_ascii_case(expected.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Known vector: SHA-256("abc").
    const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    #[test]
    fn hashes_a_known_vector() {
        assert_eq!(sha256_hex(b"abc"), ABC_SHA256);
    }

    #[test]
    fn verify_accepts_matching_and_is_case_insensitive() {
        assert!(verify_sha256(b"abc", ABC_SHA256));
        assert!(verify_sha256(b"abc", &ABC_SHA256.to_uppercase()));
    }

    #[test]
    fn verify_rejects_a_mismatch() {
        assert!(!verify_sha256(b"abc", &"0".repeat(64)));
        assert!(!verify_sha256(b"tampered", ABC_SHA256));
    }
}
