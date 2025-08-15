import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { readAsStringAsync } from 'expo-file-system';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { IconSymbol } from '@/components/ui/IconSymbol';
import { useLibrary } from '@/hooks/useLibrary';
import { tokenize } from '@/modules/mecab';
import { useQuery } from '@tanstack/react-query';
import { useDatabase } from '@/utils/DatabaseProvider';
import {
  getSpineFromOpf,
  getTocFromNCX,
  parseNCX,
  parseOPF,
} from '@/utils/epub-parsing';
import { lookUpTerm } from '@/utils/look-up-term';
import type { RootStackParamList } from './navigation.types';
import injectedCss from './source-assets/injected-css.wvcss';
import mainScript from './source-assets/injected-javascript.wvjs';
import { BookState, BookStateType } from './persistence/book-state';
import { PageDetails } from './book-screen.types';

export default function BookScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Book'>) {
  const params = route.params;
  const library = useLibrary();

  const ncxQuery = useQuery({
    queryKey: ['ncx', params.opsUri, params.ncxFileHref] as const,
    queryFn: async ({ queryKey: [, opsUri, ncxFileHref] }) => {
      if (!ncxFileHref) {
        throw new Error('required ncxFileHref to be populated');
      }

      const absoluteUriToNcx = `${opsUri}/${ncxFileHref}`;
      let ncxText: string;
      try {
        ncxText = await readAsStringAsync(absoluteUriToNcx);
      } catch (cause) {
        throw new Error(`Failed to read NCX at ${absoluteUriToNcx}`, { cause });
      }

      const ncx = parseNCX(ncxText);
      if (!ncx) {
        return null;
      }

      const toc = getTocFromNCX({ ncx, ncxFileHref });
      return { toc, ncx };
    },
    enabled: !!params.ncxFileHref,
  });
  const toc = ncxQuery.data?.toc;

  const opfQuery = useQuery({
    queryKey: ['opf', params.opsUri, params.relativePathToOpfFromOps] as const,
    queryFn: async ({ queryKey: [, opsUri, relativePathToOpfFromOps] }) => {
      const absoluteUriToOpf = `${opsUri}/${relativePathToOpfFromOps}`;
      let opfText: string;
      try {
        opfText = await readAsStringAsync(absoluteUriToOpf);
      } catch (cause) {
        throw new Error(`Failed to read OPF at ${absoluteUriToOpf}`, { cause });
      }

      const opf = parseOPF(opfText);
      const spine = getSpineFromOpf({ opf, nav: params.nav });

      return { opf, spine };
    },
  });
  const spine = opfQuery.data?.spine;

  const pageDetailsQuery = useQuery({
    queryKey: [
      'pageDetails',
      opfQuery.data?.opf,
      params.uniqueIdentifier,
      params.pageDetails,
    ] as const,
    queryFn: async ({ queryKey: [, opf] }) => {
      console.log(
        `[pageDetailsQuery] running with params.pageDetails ${JSON.stringify(
          params.pageDetails,
        )}`,
      );
      if (!opf) {
        throw new Error('required opf to be populated');
      }

      if (params.pageDetails.pageType !== 'auto') {
        console.log(
          `[pageDetailsQuery] isn't type 'auto', so returning params.pageDetails as-is ${JSON.stringify(
            params.pageDetails,
          )}`,
        );
        return params.pageDetails;
      }

      const bookStateStore = (await BookState.get()) ?? {};
      const bookState = bookStateStore[params.uniqueIdentifier];
      if (bookState) {
        console.log(
          `[pageDetailsQuery] using persisted pageDetails ${JSON.stringify(
            bookState.pageDetails,
          )}`,
        );
        return bookState.pageDetails;
      }

      // If no persisted state, pick the first item in the spine.
      const {
        package: {
          manifest: { items },
          spine: { itemrefs },
        },
      } = opf;

      const idRefOfFirstItemRefInSpine = itemrefs.at(0)?.idref;
      if (!idRefOfFirstItemRefInSpine) {
        throw new Error('Spine contained no itemrefs.');
      }

      const item = items.find(({ id }) => id === idRefOfFirstItemRefInSpine);
      if (!item) {
        throw new Error(
          'Spine contained no item matching the ID of the first itemref.',
        );
      }

      console.log(
        `[pageDetailsQuery] returning pageDetails ${JSON.stringify({
          pageType: 'spine',
          href: item.href,
        })}`,
      );

      return { pageType: 'spine', href: item.href } satisfies PageDetails;
    },
    enabled: !!opfQuery.data,
  });
  const pageDetailsQueryDataRef = useRef(pageDetailsQuery.data);
  pageDetailsQueryDataRef.current = pageDetailsQuery.data;

  const queryParams = pageDetailsQuery.data
    ? `?scroll=${pageDetailsQuery.data.blockScroll ?? 0}`
    : '';

  // FIXME: Both `params.opsUri` and `pageDetailsQuery.data.href` come in
  // unencoded. When we set `pageDetailsHref` as the source, the moment
  // onShouldStartLoadWithRequest() runs, you'll see it's handling it as an
  // encoded URI instead. To keep React state in better sync, we should encode
  // before setting as source.
  const pageDetailsHref = pageDetailsQuery.data
    ? new URL(`${params.opsUri}/${pageDetailsQuery.data.href}${queryParams}`)
        .href
    : 'about:blank';
  const [webViewUri, setWebViewUri] = useState(pageDetailsHref);
  console.log(
    `[BookScreen] render webViewUri "…\x1b[32m${new URL(
      webViewUri,
    ).href.replace(
      encodeURI(params.opsUri),
      '',
    )}\x1b[0m", given route.params.pageDetails ${JSON.stringify(
      route.params.pageDetails,
    )}`,
  );

  // FIXME: Navigating from Library to Book generally traps you in a long (but
  // not infinite) loop of re-rendering about:blank. Not sure why yet. But
  // everything downstream of it seems to work.

  // This hook, and the navigationTimestamp, are a crude workaround for the
  // webViewUri not updating when a sub-screen (e.g. ToC) unwinds back to this
  // screen, passing the same params.href as it the screen began with.
  useEffect(() => {
    console.log(
      `[BookScreen] effect setWebViewUri("…\x1b[32m${pageDetailsHref.replace(
        encodeURI(params.opsUri),
        '',
      )}\x1b[0m")`,
    );
    setWebViewUri(pageDetailsHref);
  }, [pageDetailsHref]);

  const webViewRef = useRef<WebView>(null);

  const dbRef = useDatabase();

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: params.title,
      headerRight: () => {
        return (
          <>
            {/*
              Hot updates (e.g. of the `injectedJavaScript` prop) don't refresh
              the WebView, so it's handy during development to just be able to
              force a refresh on demand.
            */}
            {__DEV__ && (
              <TouchableOpacity
                onPress={() => {
                  webViewRef.current?.reload();
                }}>
                <IconSymbol
                  name="arrow.clockwise"
                  size={22}
                  weight="medium"
                  color={'#3677F9'}
                />
              </TouchableOpacity>
            )}
            <Button
              title="Spine"
              {...(spine
                ? {
                    onPress: () =>
                      navigation.navigate('ToC', {
                        backParams: params,
                        pageType: 'spine',
                        items: spine,
                      }),
                  }
                : { disabled: true })}
            />
            <Button
              title="ToC"
              {...(toc
                ? {
                    onPress: () =>
                      navigation.navigate('ToC', {
                        backParams: params,
                        pageType: 'toc',
                        items: toc,
                      }),
                  }
                : { disabled: true })}
            />
          </>
        );
      },
    });
  }, [navigation, params, spine, toc]);

  const onMessage = useCallback(
    ({ nativeEvent: { data } }: WebViewMessageEvent) => {
      interface LogPayload {
        type: 'log';
        message: string;
      }
      interface LookUpPayload {
        type: 'lookUpTerm';
        id: number;
        term: string;
      }
      interface TokenizePayload {
        type: 'tokenize';
        id: number;
        blockBaseText: string;
        offset: number;
      }
      interface NavigationRequestPayload {
        type: 'navigation-request';
        value: string;
        currentHref: string;
      }
      interface ProgressPayload {
        type: 'progress-update';
        /** We may support visible element-based updates in future. */
        subtype: 'scroll';
        blockScrollFraction: number;
      }
      type Payload =
        | LogPayload
        | LookUpPayload
        | TokenizePayload
        | NavigationRequestPayload
        | ProgressPayload;

      let parsed: Payload;
      try {
        parsed = JSON.parse(data);
      } catch (error) {
        console.error('[WebView] error parsing message', error);
        return;
      }

      // TODO: validate

      switch (parsed.type) {
        case 'log': {
          const { message } = parsed;
          console.log(`[WebView] log: ${message}`);
          break;
        }
        case 'lookUpTerm': {
          const webView = webViewRef.current;
          if (!webView) {
            return;
          }

          // Gross, but just working with what react-native-webview gives me.
          const settle = (
            type: 'resolve' | 'reject',
            value: string,
            id?: number,
          ) =>
            webView.injectJavaScript(
              typeof id === 'number'
                ? `__paranovelState.tokenizationPromiseHandlers[${id}].${type}(${value});`
                : `Object.keys(__paranovelState.tokenizationPromiseHandlers).forEach(id => __paranovelState.tokenizationPromiseHandlers[id].${type}(${value}));`,
            );
          const resolve = (value: string, id?: number) =>
            settle('resolve', value, id);
          const reject = (value: string, id?: number) =>
            settle('reject', `new Error(${value})`, id);

          if (typeof parsed !== 'object') {
            return reject('"Expected message to be object"');
          }

          const { term } = parsed;
          if (typeof term !== 'string') {
            return reject('"Expected body to have term"');
          }

          const db = dbRef.current;
          if (!db) {
            console.log(
              `[WebView] lookUpTerm "${term}" unable to complete due to lack of dictionary database`,
            );
            return reject('"Lacked database"');
          }

          lookUpTerm(term, db)
            .then(results => {
              // console.log(
              //   `[WebView] lookUpTerm: "${term}" got results`,
              //   results,
              // );
              resolve(JSON.stringify(results));
            })
            .catch(error => {
              console.error('Error during database lookup', error);
              reject(
                `"Error during database lookup${
                  error instanceof Error ? `: ${error.message}` : ''
                }"`,
              );
            });
          return;
        }
        case 'navigation-request': {
          if (!spine) {
            console.log(
              `[navigation-request] Bailing out due to spine being undefined.`,
            );
            return;
          }
          const { value, currentHref } = parsed;

          // Strip off any URL params and URI fragments by converting to path.
          const currentPathname = decodeURI(new URL(currentHref).pathname);
          const currentItemIndex = spine.findIndex(({ href }) =>
            currentPathname.endsWith(href),
          );

          if (currentItemIndex === -1) {
            // This can happen when the browser transforms the URL so as to make
            // it different from the href written into the spine.
            console.log(
              `[navigation-request] Bailing out, as unable to find current page in spine`,
            );
            return;
          }
          const newIndex = currentItemIndex + (value === 'next' ? 1 : -1);
          const newPage = spine[newIndex];
          if (!newPage) {
            console.log(
              `[navigation-request] Bailing out, as unable to find new page in spine`,
            );
            return;
          }

          const pageDetails: PageDetails = {
            pageType: 'spine',
            href: newPage.href,
            blockScroll: 0,
          };
          const newUri = new URL(`${params.opsUri}/${newPage.href}`).href;

          updateBookState({
            loggingContext: '[navigation-request]',
            uniqueIdentifier: params.uniqueIdentifier,
            pageDetails,
          })
            .catch(error => {
              console.error(
                '[navigation-request] Failed to update persisted book state.',
                error,
              );
            })
            .finally(() => {
              console.log(
                `[navigation-request] Setting URI to "…\x1b[32m${newUri.replace(
                  encodeURI(params.opsUri),
                  '',
                )}\x1b[0m"`,
              );
              setWebViewUri(newUri);
            });
          break;
        }
        case 'tokenize': {
          const webView = webViewRef.current;
          if (!webView) {
            return;
          }

          // Gross, but just working with what react-native-webview gives me.
          const settle = (
            type: 'resolve' | 'reject',
            value: string,
            id?: number,
          ) =>
            webView.injectJavaScript(
              typeof id === 'number'
                ? `__paranovelState.tokenizationPromiseHandlers[${id}].${type}(${value});`
                : `Object.keys(__paranovelState.tokenizationPromiseHandlers).forEach(id => __paranovelState.tokenizationPromiseHandlers[id].${type}(${value}));`,
            );
          const resolve = (value: string, id?: number) =>
            settle('resolve', value, id);
          const reject = (value: string, id?: number) =>
            settle('reject', `new Error(${value})`, id);

          if (typeof parsed !== 'object') {
            return reject('"Expected message to be object"');
          }

          const { id, blockBaseText, offset: targetOffset } = parsed;
          if (typeof id !== 'number') {
            return reject('"Expected body to have id"');
          }
          if (typeof blockBaseText !== 'string') {
            return reject('"Expected body to contain blockBaseText"', id);
          }
          if (typeof targetOffset !== 'number') {
            return reject('"Expected body to contain targetOffset"', id);
          }

          const tokens = tokenize(blockBaseText);
          if (!tokens.length) {
            return reject('"Expected to produce more than 0 tokens."', id);
          }

          // MeCab always trims leading whitespace.
          const leadingWhiteSpace = /^\\s+/.exec(blockBaseText)?.[0] ?? '';
          // The user may have clicked into the middle of a token, so we want to
          // return the start offset of the token containing the clicked
          // character.
          let offsetOfTargetTokenIntoBlockBaseText = leadingWhiteSpace.length;

          for (const token of tokens) {
            const length =
              token.surface.length + (token.trailingWhitespace?.length ?? 0);

            if (offsetOfTargetTokenIntoBlockBaseText + length > targetOffset) {
              // Although 'フェルディナンド' does give a non-null lemma, it's '*'.
              const dictionaryForm =
                token.lemma && token.lemma !== '*'
                  ? token.lemma
                  : token.surface;

              return resolve(
                JSON.stringify({
                  offsetOfTargetTokenIntoBlockBaseText,
                  offsetOfTargetCharacterIntoBlockBaseText: targetOffset,
                  tokenLength: length,
                  dictionaryForm,
                }),
                id,
              );
            }

            offsetOfTargetTokenIntoBlockBaseText += length;
          }

          return reject('"Didn\'t find token"', id);
        }
        case 'progress-update': {
          const { blockScrollFraction } = parsed;

          const pageDetails = pageDetailsQueryDataRef.current;
          if (!pageDetails) {
            console.log('skipping progress update, as no pageDetails');
            return;
          }

          updateBookState({
            loggingContext: '[progress-update]',
            uniqueIdentifier: params.uniqueIdentifier,
            pageDetails: {
              ...pageDetails,
              blockScroll: blockScrollFraction,
            },
          }).catch(error => {
            console.error('Failed to update persisted book state.', error);
          });
          break;
        }
      }
    },
    // FIXME: Not too confident in when onMessage gets updated, so would rather
    // accept all params as refs.
    [spine, params.opsUri, params.uniqueIdentifier],
  );

  if (library.type !== 'loaded') {
    return null;
  }

  if (!params.opsUri) {
    return null;
  }

  return (
    <SafeAreaView style={style.container}>
      <WebView
        ref={webViewRef}
        webviewDebuggingEnabled={true}
        javaScriptEnabled={true}
        onMessage={onMessage}
        onLoadStart={({ nativeEvent: { url } }) => {
          console.log(
            `[onLoadStart] "…\x1b[32m${url.replace(
              encodeURI(params.opsUri),
              '',
            )}\x1b[0m"`,
          );
        }}
        onLoadEnd={({ nativeEvent: { url } }) => {
          console.log(
            `[onLoadEnd] "…\x1b[32m${url.replace(
              encodeURI(params.opsUri),
              '',
            )}\x1b[0m"`,
          );
        }}
        injectedJavaScript={injectedJavaScript}
        allowFileAccessFromFileURLs={true}
        allowingReadAccessToURL={params.opsUri}
        // Specifying 'file://*' in here is necessary to stop the WebView from
        // treating file URLs as being blocklisted. Blocklisted URLs get opened
        // via Linking (to be passed on to Safari) instead.
        originWhitelist={['file://*']}
        source={
          // For some reason, RNW tries (and fails) to open "about:blank" as a
          // file URL
          webViewUri === 'about:blank' ? { html: '' } : { uri: webViewUri }
        }
        // https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md#setting-custom-headers
        onShouldStartLoadWithRequest={req => {
          // This normalises the URI encoding to be definitely encoded.
          const currentURL = new URL(webViewUri);
          const incomingURL = new URL(req.url);
          const current = currentURL.href;
          const incoming = incomingURL.href;
          const currentWithoutParams = `${currentURL.origin}${currentURL.pathname}`;
          const incomingWithoutParams = `${incomingURL.origin}${incomingURL.pathname}`;

          const { a: reqUrlDiff, b: webViewUriDiff } = stringDiff(
            current,
            incoming,
          );

          const report =
            reqUrlDiff === webViewUriDiff
              ? `[onShouldStartLoadWithRequest] URI unchanged! "…\x1b[32m${req.url.replace(
                  encodeURI(params.opsUri),
                  '',
                )}\x1b[0m"`
              : `[onShouldStartLoadWithRequest] diff:\n\t\x1b[90mwebViewUri\x1b[0m: "…\x1b[31m${webViewUriDiff.replace(
                  encodeURI(params.opsUri),
                  '',
                )}\x1b[0m"\n\t   \x1b[90mreq.url\x1b[0m: "…\x1b[32m${reqUrlDiff.replace(
                  encodeURI(params.opsUri),
                  '',
                )}\x1b[0m"`;

          const { isTopFrame } = req;

          // I can't fully explain why, but preventing load of "about:blank"
          // (which is the default page the WebView loads) avoids a hellish
          // render loop when moving from the Library Screen to the Book Screen.
          if (incoming === 'about:blank') {
            console.log(
              `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[31mfalse\x1b[0m`,
            );
            return false;
          }

          // Allow loads that are in sync with React state, and iframes I guess.
          // If the WebView ever stays white and thrashes between two URLs in
          // the logs, here is where to look.
          //
          // Note: We're tentatively comparing URL equality by
          // `url === webViewUri`, based on the fact that we've URI-encoded it
          // on the way in (which matches how it comes through here). But there
          // could be other discrepancies, like trailing slashes or something.
          if (incoming === current || !isTopFrame) {
            console.log(
              `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[32mtrue\x1b[0m`,
            );
            return true;
          }

          if (incomingWithoutParams === currentWithoutParams) {
            const report = `[onShouldStartLoadWithRequest] diff:\n\t\x1b[90mwebViewUri.search\x1b[0m: "…\x1b[31m${currentURL.search}\x1b[0m"\n\t   \x1b[90mreq.url.search\x1b[0m: "…\x1b[32m${incomingURL.search}\x1b[0m"`;

            console.log(
              `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[32mtrue\x1b[0m`,
            );
            return true;
          }

          console.log(
            `[onShouldStartLoadWithRequest] setWebViewUri("${incoming}")`,
          );

          // Keep React state in sync by denying the load here and re-rendering
          // with a new source value instead.
          setWebViewUri(incoming);
          console.log(
            `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[31mfalse\x1b[0m`,
          );
          return false;
        }}
      />
    </SafeAreaView>
  );
}

function stringDiff(a: string, b: string) {
  const longer = a.length > b.length ? a : b;

  let aDiff = '';
  let bDiff = '';
  for (let i = 0; i < longer.length; i++) {
    if (a[i] === b[i]) {
      continue;
    }

    if (a[i] !== undefined) {
      aDiff += a[i];
    }
    if (b[i] !== undefined) {
      bDiff += b[i];
    }
  }

  return { a: aDiff, b: bDiff };
}

const injectedJavaScript = `
{
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(injectedCss)};
  document.head.appendChild(style);
}

${mainScript}
`.trim();

const style = StyleSheet.create({
  container: { flex: 1 },
});

async function updateBookState({
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
