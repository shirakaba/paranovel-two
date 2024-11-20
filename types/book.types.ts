export type Book = {
  type: 'opf';

  /**
   * The title extracted from the OPF file.
   *
   * Use this when displaying the library of books to the user.
   *
   * @example "無職転生 ～異世界行ったら本気だす～ 17 (MFブックス)"
   */
  title?: string;

  /**
   * The path to the cover image, relative to the OPS folder.
   *
   * @example "images/00014.jpeg"
   * @example "cover.jpeg"
   */
  coverImage?: string;

  /**
   * The full URI to the OPS folder (or root folder if not present) of the EPUB.
   *
   * Use this to get a file-system handle to the folder for debugging, and as
   * the root for requesting files from the static server by.
   *
   * @example "file:///Users/jamie/Library/Developer/CoreSimulator/Devices/7987CBDB-2D07-4277-99BB-8651AE9E3F7A/data/Containers/Shared/AppGroup/C1CE866F-4177-43A6-B089-300C4A5D1819/File Provider Storage/epubs/無職転生 ～異世界行ったら本気だす～ 17 (MFブックス)"
   * @example "file:///Users/jamie/Library/Developer/CoreSimulator/Devices/7987CBDB-2D07-4277-99BB-8651AE9E3F7A/data/Containers/Shared/AppGroup/C1CE866F-4177-43A6-B089-300C4A5D1819/File Provider Storage/epubs/kusamakura-japanese-vertical-writing/OPS"
   */
  opsUri: string;

  /**
   * The relative path to the .opf file from the OPS root.
   *
   * Get the full URI for it via `${opsUri}/${relativePathToOpfFromOps}`.
   *
   * @example "package.opf"
   * @example "content.opf"
   */
  relativePathToOpfFromOps: string;

  /**
   * The name of the folder of the decompressed EPUB.
   *
   * Use this as a fallback when the OPF doesn't specify a title.
   *
   * @example "無職転生 ～異世界行ったら本気だす～ 17 (MFブックス)"
   */
  folderName: string;

  /**
   * The href the ebook should open at.
   *
   * Get the full URI for the starting page via `${opsUri}/${startingHref}`.
   *
   * @example "titlepage.xhtml"
   * @example "xhtml/表紙.xhtml"
   */
  startingHref: string;
};
