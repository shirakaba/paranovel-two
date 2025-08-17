import type { PageDetails } from '@/src/book-screen.types';
import { type BookStateType, BookState } from '@/src/persistence/book-state';

export async function updateBookStateFromUrl({
  url,
  uniqueIdentifier,
  spine,
}: {
  url: URL;
  uniqueIdentifier: string;
  spine: {
    href: string;
    label: string;
  }[];
}) {
  // Strip off any URL params and URI fragments by converting to path.
  const pathname = decodeURI(url.pathname);
  const itemIndex = spine.findIndex(({ href }) => pathname.endsWith(href));
  const page = spine[itemIndex];
  if (!page) {
    throw new Error(
      `[updateBookStateFromUrl] Bailing out, as unable to find page with pathname "${pathname}" in the spine`,
    );
  }

  const pageDetails: PageDetails = {
    pageType: 'spine',
    href: page.href,
    blockScroll: 0,
  };

  return await updateBookState({
    loggingContext: '[hyperlink]',
    uniqueIdentifier,
    pageDetails,
  });
}

export async function updateBookState({
  loggingContext,
  uniqueIdentifier,
  pageDetails,
}: {
  loggingContext: `[${string}]`;
  uniqueIdentifier: string;
  pageDetails: Exclude<PageDetails, { pageType: 'auto' }>;
}) {
  let store: BookStateType['value'];
  try {
    store = (await BookState.get()) ?? {};
  } catch (cause) {
    throw new Error(
      `${loggingContext} Failed to update BookState, as was unable to read BookState`,
      { cause },
    );
  }

  const update: BookStateType['value'] = {
    ...store,
    [uniqueIdentifier]: {
      pageDetails,
    },
  };
  console.log(
    `${loggingContext} Writing progress update ${JSON.stringify(
      update[uniqueIdentifier],
    )}`,
  );

  try {
    await BookState.set(update);
  } catch (cause) {
    throw new Error(
      `${loggingContext} Failed to update BookState, as was unable to write to BookState`,
      { cause },
    );
  }
}
