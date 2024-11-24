import { Book } from '@/types/book.types';

export type ToCScreenProps = Book & {
  hrefs: string;
  labels: string;
};
