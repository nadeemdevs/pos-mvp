// Shown in place of a page's normal content when the "All Branches" combined
// view is active. Several operational pages (Billing, Tables, Kitchen,
// Shifts, Reservations) mutate branch-scoped data and therefore cannot work
// while browsing "All" — the backend's requireSpecificBranch guard rejects
// the writes anyway, so this is a friendlier front-line message rather than
// letting the user hit a 400 on submit.
export default function BranchRequiredNotice() {
  return (
    <div className="empty-state">
      <p>Select a specific branch to continue — this page requires an active branch.</p>
    </div>
  )
}
