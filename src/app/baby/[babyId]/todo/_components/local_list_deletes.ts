// Ids of lists this device is deleting. The delete's own revalidation can bounce the
// open list page to the index with `?gone=1`, which must not show "deleted elsewhere".
// A module-level set (not state) so it survives the header unmounting mid-delete.
export const localListDeletes = new Set<string>()
