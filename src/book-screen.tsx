import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { readAsStringAsync } from 'expo-file-system/legacy';
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Dimensions,
  SafeAreaView,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
  ViewStyle,
  Text,
  Pressable,
  ScrollView,
  ReadOnlyElement,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

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
import { LookupResult, lookUpTerm } from '@/utils/look-up-term';
import type { RootStackParamList } from './navigation.types';
import injectedCss from './source-assets/injected-css.wvcss';
import mainScript from './source-assets/injected-javascript.wvjs';
import { BookState } from './persistence/book-state';
import { BookScreenProps, PageDetails } from './book-screen.types';
import { QuickSQLiteConnection } from 'react-native-quick-sqlite';
import {
  updateBookStateFromUrl,
  updateBookState,
} from '@/utils/update-book-state';
import { makeUrlFromOps, prettifyOpsUrl } from '@/utils/url-processing';
import { SymbolView } from 'expo-symbols';

export default function BookScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Book'>) {
  // Queries are cached and survive remounts. In our case, this causes trouble,
  // because one of our assumptions is that when we mount BookScreen, we always
  // start with an unloaded query, presenting about:blank.
  //
  // If we don't couple the cache to the component, then the moment we mount
  // BookScreen, if there's a query in the cache, pageDetailsQuery.data will
  // begin populated, and so the WebView will initially render the cached
  // webViewUri rather than about:blank.
  //
  // In practice, this causes thrashing. Given the complex nature of this Rube
  // Goldberg machine, the simplest (and only) solution I've found is to couple
  // query caches to component instances via useId().
  const componentId = useId();

  const params = route.params;
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const library = useLibrary();

  const ncxQuery = useQuery({
    queryKey: [
      `ncx-${componentId}`,
      params.opsUri,
      params.ncxFileHref,
    ] as const,
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
    queryKey: [
      `opf-${componentId}`,
      params.opsUri,
      params.relativePathToOpfFromOps,
    ] as const,
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
  const spineRef = useRef(spine);
  spineRef.current = spine;

  const pageDetailsQuery = useQuery({
    queryKey: [
      `pageDetails-${componentId}`,
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

  const pageDetailsHref = useMemo(
    () =>
      pageDetailsQuery.data
        ? makeUrlFromOps({
            opsUri: params.opsUri,
            pageHref: pageDetailsQuery.data.href,
            params: { blockScroll: pageDetailsQuery.data.blockScroll },
          })
        : 'about:blank',
    [params.opsUri, pageDetailsQuery.data?.href],
  );
  const [webViewUri, setWebViewUri] = useState(pageDetailsHref);
  const webViewUriRef = useRef(webViewUri);
  webViewUriRef.current = webViewUri;

  console.log(
    `[BookScreen] render webViewUri ${prettifyOpsUrl({
      url: webViewUri,
      opsUri: params.opsUri,
      color: 'green',
    })}, given route.params.pageDetails ${JSON.stringify(
      route.params.pageDetails,
    )}`,
  );

  useEffect(() => {
    console.log(
      `[BookScreen] effect setWebViewUri(${prettifyOpsUrl({
        url: pageDetailsHref,
        opsUri: params.opsUri,
        color: 'green',
      })})`,
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
                <SymbolView
                  name={{ ios: 'arrow.clockwise' }}
                  size={22}
                  weight="medium"
                  tintColor={'#3677F9'}
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

  const [nativePopup, setNativePopup] = useState<NativePopupState>({
    visible: false,
    anchorRect: {
      top: 0,
      right: 0,
      left: 0,
      bottom: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
    writingMode: 'horizontal-tb',
    positionTryOrder: ['bottom', 'top'],
    results: [],
  });

  const onMessageCallback = useCallback((event: WebViewMessageEvent) => {
    onMessage({
      event,
      webViewRef,
      dbRef,
      spineRef,
      paramsRef,
      webViewUriRef,
      setWebViewUri,
      pageDetailsQueryDataRef,
      setNativePopup,
    });
  }, []);

  const scheme = useColorScheme();

  const navigationLockCounterRef = useRef(0);
  const navigationLockIdRef = useRef<number>(undefined);

  if (library.type !== 'loaded') {
    return null;
  }

  if (!params.opsUri) {
    return null;
  }

  return (
    <SafeAreaView
      style={[
        style.container,
        {
          backgroundColor: scheme === 'dark' ? '#2c2c2c' : 'white',
        },
      ]}>
      <WebView
        ref={webViewRef}
        webviewDebuggingEnabled={true}
        javaScriptEnabled={true}
        onMessage={onMessageCallback}
        allowsBackForwardNavigationGestures={false}
        style={{
          backgroundColor: scheme === 'dark' ? 'black' : 'white',
        }}
        onLoadStart={({ nativeEvent: { url } }) => {
          console.log(
            `[onLoadStart] ${prettifyOpsUrl({
              url,
              opsUri: params.opsUri,
              color: 'green',
            })}`,
          );
        }}
        onLoadEnd={({ nativeEvent: { url } }) => {
          console.log(
            `[onLoadEnd] ${prettifyOpsUrl({
              url,
              opsUri: params.opsUri,
              color: 'green',
            })}`,
          );
        }}
        injectedJavaScript={injectedJavaScript}
        allowFileAccessFromFileURLs={true}
        // It doesn't actually matter whether we URI-encode this or not. At the
        // point of use (i.e. `visitSource` > `syncCookiesToWebView` in
        // RNCWebViewImpl.m), react-native-webview processes this value with
        // `[RCTConvert NSURL:allowingReadAccessToURL]` before handing it over
        // to `loadFileURL:allowingReadAccessToURL:`.
        //
        // The RCTConvert part runs `[NSURL URLWithString:path]` on it, which
        // normalises it as encoded, without doubly-encoding it.
        allowingReadAccessToURL={encodeURI(params.opsUri)}
        // Specifying 'file://*' in here is necessary to stop the WebView from
        // treating file URLs as being blocklisted. Blocklisted URLs get opened
        // via Linking (to be passed on to Safari) instead.
        originWhitelist={['file://*']}
        source={
          // For some reason, RNW tries (and fails) to open "about:blank" as a
          // file URL
          webViewUri === 'about:blank' ? { html: '' } : { uri: webViewUri }
        }
        onContentProcessDidTerminate={() => {
          console.log('[onContentProcessDidTerminate] reloading...');
          webViewRef.current?.reload();
        }}
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
            incoming,
            current,
          );

          const report =
            reqUrlDiff === webViewUriDiff
              ? `[onShouldStartLoadWithRequest] (${
                  req.navigationType
                }) URI unchanged! "…\x1b[32m${req.url.replace(
                  encodeURI(params.opsUri),
                  '',
                )}\x1b[0m"`
              : `[onShouldStartLoadWithRequest] (${
                  req.navigationType
                }) diff:\n\t\x1b[90mwebViewUri\x1b[0m: "…\x1b[31m${webViewUriDiff.replace(
                  encodeURI(params.opsUri),
                  '',
                )}\x1b[0m"\n\t   \x1b[90mreq.url\x1b[0m: "…\x1b[32m${reqUrlDiff.replace(
                  encodeURI(params.opsUri),
                  '',
                )}\x1b[0m"`;

          const { isTopFrame } = req;

          if (typeof navigationLockIdRef.current === 'number') {
            console.log(
              `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[31mfalse\x1b[0m \x1b[90m(navigation lock active)\x1b[0m`,
            );
            return false;
          }

          // I can't fully explain why, but preventing load of "about:blank"
          // (which is the default page the WebView loads) avoids a hellish
          // render loop when moving from the Library Screen to the Book Screen.
          if (incoming === 'about:blank') {
            console.log(
              `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[31mfalse\x1b[0m \x1b[90m(never render about:blank)\x1b[0m`,
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
            const report = `[onShouldStartLoadWithRequest] (${req.navigationType}) diff:\n\t\x1b[90mwebViewUri.search\x1b[0m: "…\x1b[31m${currentURL.search}\x1b[0m"\n\t   \x1b[90mreq.url.search\x1b[0m: "…\x1b[32m${incomingURL.search}\x1b[0m"`;

            console.log(
              `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[32mtrue\x1b[0m`,
            );
            return true;
          }

          // Support persisting navigations following users clicking links in a
          // HTML ToC page.
          if (req.navigationType === 'click') {
            const spine = spineRef.current;
            if (!spine) {
              console.log(
                `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[31mfalse\x1b[0m \x1b[90m(spine not populated, so can't proceed to call setWebViewUri("${incoming}").)\x1b[0m`,
              );
              return false;
            }

            const navigationLockId = navigationLockCounterRef.current++;
            navigationLockIdRef.current = navigationLockId;
            const uniqueIdentifier = paramsRef.current.uniqueIdentifier;

            updateBookStateFromUrl({
              loggingContext: '[hyperlink]',
              url: incomingURL,
              uniqueIdentifier,
              spine,
            })
              .catch(error => {
                console.error(
                  '[hyperlink] Failed to persist book state, but will proceed to call setWebViewUri().',
                  error,
                );
              })
              .finally(() => {
                navigationLockIdRef.current = undefined;
                console.log(
                  `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[31mfalse\x1b[0m \x1b[90m(Calling setWebViewUri("${incoming}"))\x1b[0m`,
                );
                setWebViewUri(incoming);
              });
            return false;
          }

          // Keep React state in sync by denying the load here and re-rendering
          // with a new source value instead.
          setWebViewUri(incoming);
          console.log(
            `${report}\n\t  \x1b[90mdecision\x1b[0m: \x1b[31mfalse\x1b[0m \x1b[90m(calling setWebViewUri("${incoming}"))\x1b[0m`,
          );
          return false;
        }}
      />
      <NativePopover
        state={nativePopup}
        closePopover={() => {
          setNativePopup(prev => ({
            ...prev,
            visible: false,
          }));
          // The webViewRef.current?.postMessage() API is fake. Under the hood, it
          // just calls injectJavaScript() and dispatches a MessageEvent at the
          // window.
          webViewRef.current?.injectJavaScript(
            `console.log('!! close-native-popover', window.__paranovelState); if(window.__paranovelState) {\n  window.__paranovelState.nativeModalVisible = false; __paranovelState.wordHighlight.clear(); __paranovelState.rtIsolationHack?.remove(); \n}`,
          );
        }}
      />
    </SafeAreaView>
  );
}

function NativePopover({
  state,
  closePopover,
}: {
  state: NativePopupState;
  closePopover: () => void;
}) {
  const { visible, anchorRect, results, positionTryOrder } = state;
  const { top, left, width, height } = anchorRect;
  const [withShowMoreButton, _setWithShowMoreButton] = useState(false);

  const stageRef = useRef<View | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    const scrollView = scrollViewRef.current;
    const stage = stageRef.current;
    const parent = stage?.parentElement;
    if (!stage || !scrollView || !parent) {
      return;
    }

    const solutions = new Array<{
      orientation: Orientation;
      blockOverflow: number;
      clientInlineSize: number;
    }>();

    let lastTried: Orientation = positionTryOrder[0];

    // FIXME: In the no-results case, 'left' will win over 'right' in
    //        vertical-rl texts no matter how cramped, just because the
    //        clientInlineSize (the clientHeight) is equal between the two.
    //
    //        This might be resolvable (for the wrong reasons) by just
    //        implementing the "no results" text and, if possible, a minimum
    //        width.
    for (const orientation of positionTryOrder) {
      lastTried = orientation;

      const style = tryOrientation({ anchorRect, orientation, parent });
      stage.setNativeProps({ style });
      const {
        blockOverflow,
        inlineOverflow,
        clientBlockSize,
        clientInlineSize,
      } = getOverflow({ scrollView, orientation });

      const typedStyle = style as {
        top: number;
        right: number;
        bottom: number;
        left: number;
      };

      // On the Web, we compared the bounding client rect to the window's
      // innerWidth/innerHeight. In React Native, the bounding client rect seems
      // to stay diligently inside the parent no matter what impossible
      // constraint you asked for, so the non-computed style gets closer to my
      // intention of checking whether we asked for a stage that begins outside
      // of the viewport.
      let isOverflowingViewport = false;
      if (
        typedStyle.left > parent.clientWidth ||
        typedStyle.right > parent.clientWidth ||
        typedStyle.top < 0 ||
        typedStyle.bottom < 0 ||
        typedStyle.top > parent.clientHeight ||
        typedStyle.bottom > parent.clientHeight
      ) {
        isOverflowingViewport = true;
      }

      if (isOverflowingViewport) {
        console.log(
          `Discarding orientation "${orientation}" as it's overflowing the viewport.`,
        );
        continue;
      }

      if (inlineOverflow) {
        console.log(
          `Discarding orientation "${orientation}" as it's overflowing in the inline orientation.`,
        );
        continue;
      }

      solutions.push({ orientation, blockOverflow, clientInlineSize });
    }

    const sortedSolutions = solutions.sort((a, b) => {
      // Sort in descending order of inline size.
      const clientInlineSize = b.clientInlineSize - a.clientInlineSize;

      // If there's no tie, use that alone as the sorting factor.
      if (clientInlineSize) {
        return clientInlineSize;
      }

      // Otherwise, sort in ascending order of block overflow.
      //
      // (Given that we reserve the same amount of block space for both
      // orientations, though, this won't actually make any difference unless we
      // change the layout algorithm in future.)
      return a.blockOverflow - b.blockOverflow;
    });
    const bestSolution = sortedSolutions.at(0)?.orientation;

    if (!bestSolution) {
      return;
    }

    if (bestSolution === lastTried) {
      console.log(
        `Given solutions ${JSON.stringify(
          sortedSolutions,
        )}, picking ${bestSolution} (last tried)`,
      );
    } else {
      console.log(
        `Given solutions ${JSON.stringify(
          sortedSolutions,
        )}, picking ${bestSolution} (redoing layout)`,
      );

      const style = tryOrientation({
        anchorRect,
        orientation: bestSolution,
        parent,
      });
      stage.setNativeProps({ style });
    }
  }, [anchorRect, results]);

  const fontScale = 1;
  const paranovelPopoverDefinitionFontSize = 14 / fontScale;

  const debugStyles: boolean = false;
  const touchState = useRef<{ type: 'idle' } | { type: 'start' }>({
    type: 'idle',
  });

  return (
    <>
      <View
        // #paranovel-anchor
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          backgroundColor: 'cyan',
          width,
          height,
          top,
          left,
          display: debugStyles && visible ? 'flex' : 'none',
        }}></View>
      {/*
        When toggling visibility, we make sure to unmount, as it resets the
        scroll offset for free (I did try scrollTo() and setNativeProps(), but
        they don't seem to have any effect for some reason).
      */}
      {visible && (
        <View
          // #paranovel-popover-stage
          ref={stageRef}
          style={{
            position: 'absolute',
            backgroundColor: debugStyles ? 'rgba(255,255,0,0.5)' : undefined,
            inset: 0,
            padding: 16,
            alignItems: 'center',
            // ...stageStyles,
          }}
          onTouchStart={({ nativeEvent: { pageX, pageY } }) => {
            const rect = scrollViewRef.current
              ?.getNativeScrollRef()
              ?.getBoundingClientRect();
            if (!rect) {
              return;
            }

            const { top, right, bottom, left } = rect;
            if (
              pageX >= left &&
              pageX <= right &&
              pageY >= top &&
              pageY <= bottom
            ) {
              // The touch upon the stage fell inside the ScrollView.
              return;
            }

            touchState.current = { type: 'start' };
          }}
          onTouchCancel={() => {
            touchState.current = { type: 'idle' };
          }}
          onTouchEnd={({ nativeEvent: { pageX, pageY } }) => {
            const initialState = touchState.current;
            touchState.current = { type: 'idle' };

            if (initialState.type !== 'start') {
              return;
            }

            const rect = scrollViewRef.current
              ?.getNativeScrollRef()
              ?.getBoundingClientRect();
            if (!rect) {
              return;
            }

            const { top, right, bottom, left } = rect;
            if (
              pageX >= left &&
              pageX <= right &&
              pageY >= top &&
              pageY <= bottom
            ) {
              // The touch upon the stage fell inside the ScrollView.
              return;
            }

            closePopover();
          }}>
          <ScrollView
            ref={scrollViewRef}
            // #paranovel-popover-content
            style={{
              backgroundColor: 'black',
              padding: 8,
              boxSizing: 'border-box',
              // It doesn't seem to be respecting this
              // overflow: 'scroll',

              // maxWidth: '100%',
              // height: 'fit-content',
              // maxHeight: '100%',
            }}>
            {results.map(({ forms, senses }, i) => {
              const readings = forms
                .sort((a, b) => (b.common ? 1 : 0) - (a.common ? 1 : 0))
                .filter(({ kana }) => kana);

              return (
                <View
                  key={i}
                  // .paranovel-result-container
                  style={{
                    gap: 8,
                    alignItems: 'stretch',
                    maxWidth: '100%',

                    // To be inherited:
                    // color: 'white',
                    // fontSize: 50 / fontScale,
                  }}>
                  <Text
                    // .paranovel-headword
                    style={{
                      color: 'white',
                      fontSize: 22 / fontScale,
                    }}>
                    {forms
                      .filter(({ kana }) => !kana)
                      .map(({ common, form }) =>
                        common ? form : `（${form}）`,
                      )
                      .join('、')}
                  </Text>
                  <Text
                    // .paranovel-reading-item
                    style={{
                      color: 'white',
                      fontSize: paranovelPopoverDefinitionFontSize,
                    }}>
                    {readings
                      // Could represent uncommon using dice
                      .map(({ common, form }) =>
                        common ? form : `（${form}）`,
                      )
                      .join('、')}
                  </Text>

                  <View
                    // .paranovel-sense-list
                    style={{ gap: 16 }}>
                    {senses.map(({ pos, gloss }, i) => {
                      return (
                        <View
                          key={i}
                          // .paranovel-sense-item
                          style={{
                            alignItems: 'flex-start',
                            gap: 8,
                          }}>
                          <View
                            // .paranovel-pos-list
                            style={{ flexDirection: 'row', gap: 8 }}>
                            {pos.map((p, i) => (
                              // .paranovel-pos-item
                              <Text
                                key={i}
                                style={{
                                  color: 'white',
                                  borderWidth: 1,
                                  borderStyle: 'solid',
                                  borderColor: 'grey',
                                  borderRadius: 4,
                                  paddingLeft: 4,
                                  paddingRight: 4,
                                  fontSize: paranovelPopoverDefinitionFontSize,
                                }}>
                                {p}
                              </Text>
                            ))}
                          </View>

                          <Text
                            // .paranovel-gloss-item
                            style={{
                              color: 'white',
                              fontSize: paranovelPopoverDefinitionFontSize,
                            }}>
                            {`${i + 1}. ${gloss.join('; ')}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            <View
              // .paranovel-show-more-container
              style={{
                // TODO: revisit styles for overscroll
                display: withShowMoreButton ? 'flex' : 'none',
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 34,
                alignItems: 'center',
                justifyContent: 'center',
                /* TODO: base this on var(--paranovel-popover-background-color) */
                backgroundColor: '#2228',
              }}>
              <Pressable
                style={{
                  backgroundColor: '#bbb',
                  borderRadius: 16,
                  paddingBlock: 2,
                  paddingInline: 16,
                }}>
                <Text style={{ color: '#111' }}>Show more</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}
    </>
  );
}

function tryOrientation({
  anchorRect,
  orientation,
  parent,
}: {
  anchorRect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>;
  orientation: Orientation;
  parent: ReadOnlyElement;
}): StyleProp<ViewStyle> {
  // `anchorRect` is measured entirely from the top-left (i.e. `bottom` is the
  // number of pixels down from the top; it's equivalent to `top` + `height`).
  const { top, left, bottom, right } = anchorRect;

  switch (orientation) {
    case 'top': {
      return {
        flexDirection: 'column',
        justifyContent: 'flex-end',
        top: 0,
        right: 0,
        bottom: parent.clientHeight - top,
        left: 0,
      };
    }
    case 'right': {
      return {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        top: 0,
        right: 0,
        bottom: 0,
        left: right,
      };
    }
    case 'bottom': {
      return {
        flexDirection: 'column',
        justifyContent: 'flex-start',
        top: 0,
        right: 0,
        bottom: 0,
        left: bottom,
      };
    }
    case 'left': {
      return {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        top: 0,
        right: parent.clientWidth - left,
        bottom: 0,
        left: 0,
      };
    }
  }
}

function getOverflow({
  scrollView,
  orientation,
}: {
  scrollView: ScrollView;
  orientation: Orientation;
}) {
  /**
   * For now, the popover is always formatted as horizontal-lr, even if the
   * ebook is vertical-rl. This is, in chief, because I'm starting with a
   * Japanese-English dictionary, and vertical-rl does not suit English text.
   */
  const popoverWritingDirectionMatchesBodyText = false;

  let blockOverflow = 0;
  let inlineOverflow = 0;
  let clientBlockSize = 0;
  let clientInlineSize = 0;

  const nativeScrollRef = scrollView.getNativeScrollRef();
  if (!nativeScrollRef) {
    return {
      blockOverflow,
      inlineOverflow,
      clientBlockSize,
      clientInlineSize,
    };
  }

  switch (orientation) {
    case 'top': {
      blockOverflow =
        nativeScrollRef.scrollHeight - nativeScrollRef.clientHeight;
      inlineOverflow =
        nativeScrollRef.scrollWidth - nativeScrollRef.clientWidth;
      clientBlockSize = nativeScrollRef.clientHeight;
      clientInlineSize = nativeScrollRef.clientWidth;
      break;
    }
    case 'right': {
      if (popoverWritingDirectionMatchesBodyText) {
        blockOverflow =
          nativeScrollRef.scrollWidth - nativeScrollRef.clientWidth;
        inlineOverflow =
          nativeScrollRef.scrollHeight - nativeScrollRef.clientHeight;
        clientBlockSize = nativeScrollRef.clientWidth;
        clientInlineSize = nativeScrollRef.clientHeight;
      } else {
        blockOverflow =
          nativeScrollRef.scrollHeight - nativeScrollRef.clientHeight;
        inlineOverflow =
          nativeScrollRef.scrollWidth - nativeScrollRef.clientWidth;
        clientBlockSize = nativeScrollRef.clientHeight;
        clientInlineSize = nativeScrollRef.clientWidth;
      }
      break;
    }
    case 'bottom': {
      blockOverflow =
        nativeScrollRef.scrollHeight - nativeScrollRef.clientHeight;
      inlineOverflow =
        nativeScrollRef.scrollWidth - nativeScrollRef.clientWidth;
      clientBlockSize = nativeScrollRef.clientHeight;
      clientInlineSize = nativeScrollRef.clientWidth;
      break;
    }
    case 'left': {
      if (popoverWritingDirectionMatchesBodyText) {
        blockOverflow =
          nativeScrollRef.scrollWidth - nativeScrollRef.clientWidth;
        inlineOverflow =
          nativeScrollRef.scrollHeight - nativeScrollRef.clientHeight;
        clientBlockSize = nativeScrollRef.clientWidth;
        clientInlineSize = nativeScrollRef.clientHeight;
      } else {
        blockOverflow =
          nativeScrollRef.scrollHeight - nativeScrollRef.clientHeight;
        inlineOverflow =
          nativeScrollRef.scrollWidth - nativeScrollRef.clientWidth;
        clientBlockSize = nativeScrollRef.clientHeight;
        clientInlineSize = nativeScrollRef.clientWidth;
      }
      break;
    }
  }

  return {
    blockOverflow,
    inlineOverflow,
    clientBlockSize,
    clientInlineSize,
  };
}

type Orientation = 'top' | 'right' | 'bottom' | 'left';

interface NativePopupState {
  visible: boolean;
  anchorRect: {
    top: number;
    right: number;
    left: number;
    bottom: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  writingMode:
    | 'horizontal-tb'
    | 'vertical-rl'
    | 'vertical-lr'
    | 'sideways-lr'
    | 'sideways-rl';
  positionTryOrder: ['bottom', 'top'] | ['right', 'left'] | ['left', 'right'];
  results: Array<LookupResult>;
}

function stringDiff(a: string, b: string) {
  const longer = a.length > b.length ? a : b;

  let aDiff = '';
  let bDiff = '';
  let foundDifference = false;
  for (let i = 0; i < longer.length; i++) {
    if (!foundDifference) {
      if (a[i] === b[i]) {
        continue;
      }

      foundDifference = true;
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

// Use refs for every arg so that we don't have to worry about race conditions
// when reassigning the onMessage() handler (with potentially stale data)
// between renders.
function onMessage({
  event: {
    nativeEvent: { data },
  },
  webViewRef,
  dbRef,
  spineRef,
  paramsRef,
  webViewUriRef,
  setWebViewUri,
  setNativePopup,
  pageDetailsQueryDataRef,
}: {
  event: WebViewMessageEvent;
  webViewRef: React.RefObject<WebView | null>;
  dbRef: React.MutableRefObject<QuickSQLiteConnection | null>;
  spineRef: React.MutableRefObject<
    | Array<{
        href: string;
        label: string;
      }>
    | undefined
  >;
  paramsRef: React.MutableRefObject<Readonly<BookScreenProps>>;
  webViewUriRef: React.MutableRefObject<string>;
  setWebViewUri: React.Dispatch<React.SetStateAction<string>>;
  setNativePopup: React.Dispatch<React.SetStateAction<NativePopupState>>;
  pageDetailsQueryDataRef: React.MutableRefObject<
    | {
        pageType: 'toc';
        href: string;
        label: string;
        blockScroll?: number;
      }
    | {
        pageType: 'spine' | 'other';
        href: string;
        blockScroll?: number;
      }
    | undefined
  >;
}) {
  interface LogPayload {
    type: 'log';
    message: string;
  }
  interface LookUpPayload {
    type: 'lookUpTerm';
    id: number;
    term: string;
  }
  interface PresentNativePayloadPayload {
    type: 'present-native-popover';
    id: number;
    anchorRect: DOMRect;
    writingMode:
      | 'horizontal-tb'
      | 'vertical-rl'
      | 'vertical-lr'
      | 'sideways-lr'
      | 'sideways-rl';
    positionTryOrder: ['bottom', 'top'] | ['right', 'left'] | ['left', 'right'];
    results: Array<LookupResult>;
  }
  interface CloseNativePayloadPayload {
    type: 'close-native-popover';
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
    | PresentNativePayloadPayload
    | CloseNativePayloadPayload
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
      const settle = (type: 'resolve' | 'reject', value: string, id?: number) =>
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
    case 'present-native-popover': {
      const {
        id: _transactionId,
        positionTryOrder,
        anchorRect,
        results,
        writingMode,
      } = parsed;
      console.log(`[WebView] present-native-popover`, {
        positionTryOrder,
        anchorRect,
        results,
      });
      setNativePopup({
        visible: true,
        anchorRect,
        results,
        positionTryOrder,
        writingMode,
      });
      webViewRef.current?.injectJavaScript(
        `console.log('!! present-native-popover', window.__paranovelState); if(window.__paranovelState) {\n  window.__paranovelState.nativeModalVisible = true;\n}`,
      );
      return;
    }
    case 'close-native-popover': {
      console.log(`[WebView] close-native-popover`);
      setNativePopup(prev => ({
        ...prev,
        visible: false,
      }));

      // The webViewRef.current?.postMessage() API is fake. Under the hood, it
      // just calls injectJavaScript() and dispatches a MessageEvent at the
      // window. So we won't bother with an IPC channel in this direction.
      webViewRef.current?.injectJavaScript(
        `console.log('!! close-native-popover', window.__paranovelState); if(window.__paranovelState) {\n  window.__paranovelState.nativeModalVisible = false; __paranovelState.wordHighlight.clear(); __paranovelState.rtIsolationHack?.remove(); \n}`,
      );
      return;
    }
    case 'navigation-request': {
      const spine = spineRef.current;
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

      const params = paramsRef.current;
      const pageDetails: PageDetails = {
        pageType: 'spine',
        href: newPage.href,
        blockScroll: 0,
      };
      const newUri = makeUrlFromOps({
        opsUri: params.opsUri,
        pageHref: newPage.href,
        params: { blockScroll: 0 },
      });

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
            `[navigation-request] Setting URI to ${prettifyOpsUrl({
              url: newUri,
              opsUri: params.opsUri,
              color: 'green',
            })}`,
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
      const settle = (type: 'resolve' | 'reject', value: string, id?: number) =>
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
            token.lemma && token.lemma !== '*' ? token.lemma : token.surface;

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

      const params = paramsRef.current;
      if (!params) {
        console.log('[progress-update] skipping progress update, as no params');
        return;
      }

      const spine = spineRef.current;
      if (!spine) {
        console.log('[progress-update] skipping progress update, as no spine');
        return;
      }

      updateBookStateFromUrl({
        loggingContext: '[progress-update]',
        // We used to use pageDetailsQueryDataRef.current, but it can desync
        // from the current webViewUri when you select a chapter from the
        // Spine/ToC, click 'next', then scroll.
        url: new URL(webViewUriRef.current),
        uniqueIdentifier: paramsRef.current.uniqueIdentifier,
        spine,
        blockScroll: blockScrollFraction,
      }).catch(error => {
        console.error('Failed to update persisted book state.', error);
      });
      break;
    }
  }
}
