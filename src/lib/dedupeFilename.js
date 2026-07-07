// Given a Map tracking how many times each base filename has been used so
// far, returns the name to actually write this time (appending a numeric
// suffix from the second occurrence onward) and records the new count.
// Used by MailMergeModal.jsx so two CSV rows resolving to the same filename
// (e.g. a duplicate value in the column used for the filename template)
// don't silently overwrite each other.
export function dedupeFilename(usedNames, baseName) {
  const seenCount = usedNames.get(baseName) || 0
  usedNames.set(baseName, seenCount + 1)
  return {
    name: seenCount > 0 ? `${baseName}_${seenCount + 1}` : baseName,
    wasDuplicate: seenCount > 0,
  }
}
