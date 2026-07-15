const requestContext = require('../requestContext');

// Write-safety guard for the "All Branches" combined view. The
// tenantPlugin.js pre-save hook does NOT stamp branchId when the ALS context
// has no branchId (see applyBranchScoping) — so a write made while browsing
// "All" would silently keep whatever branchId a document already had (or the
// schema default), which is a silent-misfiling risk. "All" must therefore be
// strictly read-only: any mutating request (non-GET) made while
// allBranches:true is in effect is rejected outright, before it reaches the
// controller/service layer.
function requireSpecificBranch(req, res, next) {
  const ctx = requestContext.get();
  if (ctx && ctx.allBranches === true && req.method !== 'GET') {
    return res.status(400).json({ message: 'Select a specific branch to perform this action.' });
  }
  next();
}

module.exports = requireSpecificBranch;
