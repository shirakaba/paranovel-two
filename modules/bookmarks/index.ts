import BookmarksModule from './src/BookmarksModule';

/**
 * Make a bookmark to a given file system URL.
 * @see https://developer.apple.com/documentation/uikit/view_controllers/providing_access_to_directories?language=objc
 * @returns a base64-encoded string that can be deserialised back into a
 * bookmark, or null if there was a problem.
 */
export function makeBookmark(urlStr: string): string | null {
  return BookmarksModule.makeBookmark(urlStr);
}

/**
 * Serialise a bookmark to a given file system URL.
 * @see https://developer.apple.com/documentation/uikit/view_controllers/providing_access_to_directories?language=objc
 * @returns the URL represented by a base64-encoded bookmark, or null if stale.
 */
export function readBookmark(base64Str: string): string | null {
  return BookmarksModule.readBookmark(base64Str);
}
