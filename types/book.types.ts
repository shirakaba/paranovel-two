export type Book = {
  type: 'opf';

  /**
   * The title extracted from the content.opf.
   *
   * Use this when displaying the library of books to the user.
   *
   * @example "無職転生 ～異世界行ったら本気だす～ 17 (MFブックス)"
   */
  title: string;

  /**
   * The full URI to the folder that makes up the OPF/EPUB.
   *
   * Use this to get a file-system handle to the folder for debugging.
   *
   * @example "file:///Users/jamie/Library/Developer/CoreSimulator/Devices/7987CBDB-2D07-4277-99BB-8651AE9E3F7A/data/Containers/Shared/AppGroup/C1CE866F-4177-43A6-B089-300C4A5D1819/File Provider Storage/epubs/無職転生 ～異世界行ったら本気だす～ 17 (MFブックス)"
   */
  folderUri: string;

  /**
   * The name of the folder that makes up the OPF/EPUB.
   *
   * Use this as the base path to request files from the static server by.
   *
   * @example "無職転生 ～異世界行ったら本気だす～ 17 (MFブックス)"
   */
  folderName: string;
};
