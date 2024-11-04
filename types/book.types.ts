export type Book =
  | {
      type: 'html';
      title: string;
      path: string;
    }
  | {
      type: 'ebook';
      title: string;
      path: string;
    };
