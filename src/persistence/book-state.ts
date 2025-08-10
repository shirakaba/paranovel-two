import { PageDetails } from './../book-screen.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageBase } from './storage-base';

export const BookState: StorageBase<BookStateType> = {
  key: 'book-state',
  async get() {
    let data: string | null;
    try {
      data = await AsyncStorage.getItem(BookState.key);
    } catch (error) {
      try {
        await BookState.clear();
      } catch (error) {}

      return null;
    }

    if (data === null) {
      return null;
    }

    let parsed: BookStateType;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      try {
        await BookState.clear();
      } catch (error) {}

      return null;
    }

    // TODO: validate
    // TODO: migrate schema if necessary

    return parsed.value;
  },
  set(value: BookStateType['value']) {
    return AsyncStorage.setItem(
      BookState.key,
      JSON.stringify({
        schemaVersion: 1,
        value,
      } satisfies BookStateType),
    );
  },
  clear() {
    return AsyncStorage.removeItem(BookState.key);
  },
};

type BookStateV1 = {
  schemaVersion: 1;
  value: {
    [uuid: string]: {
      pageDetails: Exclude<PageDetails, { pageType: 'auto' }>;
      pageBlockScroll: number;

      // TODO: would be good to have overall book progress percent.
    };
  };
};

export type BookStateType = BookStateV1;
