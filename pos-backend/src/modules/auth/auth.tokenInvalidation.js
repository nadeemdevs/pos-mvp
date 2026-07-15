// Pure helper functions extracted out of auth.service.js so the
// invalidation logic can be unit tested without touching Mongo/JWT.

// A password-reset token is invalidated once the user's password has changed
// AT OR AFTER the token was issued — passwordChangedAt is stored with
// millisecond precision while JWT `iat` is whole seconds, so compare in
// epoch seconds. This MUST be >= rather than >: the request that consumes a
// token sets passwordChangedAt within the same wall-clock second the token
// was signed far more often than not (the whole round trip is milliseconds),
// so a strict > would let the very token that was just used be replayed
// indefinitely. A token issued for a *later* legitimate reset always has an
// iat at least one second after the prior passwordChangedAt, so >= never
// misclassifies a still-valid token as invalidated.
function isResetTokenInvalidated(passwordChangedAt, tokenIat) {
  if (!passwordChangedAt) return false;
  const changedAtSeconds = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
  return changedAtSeconds >= tokenIat;
}

// An email-verification token is stale if the user's email has changed since
// the token was issued (case-insensitive compare).
function isVerifyTokenStale(tokenEmail, currentEmail) {
  const a = String(tokenEmail || '').toLowerCase();
  const b = String(currentEmail || '').toLowerCase();
  return a !== b;
}

module.exports = { isResetTokenInvalidated, isVerifyTokenStale };
