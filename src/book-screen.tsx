import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { readAsStringAsync } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { OPF, NCX } from '@/types/epub.types';
import {
  getSpineFromOpf,
  getTocFromNCX,
  parseNCX,
  parseOPF,
} from '@/utils/epub-parsing';
import type { RootStackParamList } from './navigation.types';

export default function BookScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Book'>) {
  const params = route.params;

  const [webViewUri, setWebViewUri] = useState(params.href);
  const webViewRef = useRef<WebView>(null);

  // This hook, and the navigationTimestamp, are a crude workaround for the
  // webViewUri not updating when a sub-screen (e.g. ToC) unwinds back to this
  // screen, passing the same params.href as it the screen began with.
  useEffect(() => {
    setWebViewUri(params.href);
  }, [params.href, params.navigationTimestamp]);

  const library = useLibrary();

  const [opf, setOPF] = useState<OPF>();
  const absoluteUriToOpf = `${params.opsUri}/${params.relativePathToOpfFromOps}`;
  const absoluteUriToOpfRef = useRef(absoluteUriToOpf);
  useEffect(() => {
    // Track whether the absoluteUri gets updated while we're mid-read so that
    // we can avoid updating if so.
    const initialAbsoluteUriToOpf = absoluteUriToOpf;
    absoluteUriToOpfRef.current = absoluteUriToOpf;

    // Stop rendering the OPF from a previous book.
    setOPF(undefined);

    readAsStringAsync(initialAbsoluteUriToOpf)
      .then(opfText => {
        const opf = parseOPF(opfText);
        if (opf && initialAbsoluteUriToOpf === absoluteUriToOpfRef.current) {
          setOPF(opf);
        }
      })
      .catch(error => {
        console.error(
          `Failed to read OPF at ${initialAbsoluteUriToOpf}`,
          error,
        );
      });
  }, [absoluteUriToOpf]);

  const [ncx, setNCX] = useState<NCX>();
  const absoluteUriToNcx = params.ncxFileHref
    ? `${params.opsUri}/${params.ncxFileHref}`
    : '';
  const absoluteUriToNcxRef = useRef(absoluteUriToNcx);
  useEffect(() => {
    // Track whether the absoluteUri gets updated while we're mid-read so that
    // we can avoid updating if so.
    const initialAbsoluteUriToNcx = absoluteUriToNcx;
    absoluteUriToNcxRef.current = absoluteUriToNcx;

    // Stop rendering the NCX from a previous book.
    setNCX(undefined);

    if (!initialAbsoluteUriToNcx) {
      return;
    }

    readAsStringAsync(initialAbsoluteUriToNcx)
      .then(ncxText => {
        const ncx = parseNCX(ncxText);
        if (ncx && initialAbsoluteUriToNcx === absoluteUriToNcxRef.current) {
          setNCX(ncx);
        }
      })
      .catch(error => {
        console.error(
          `Failed to read NCX at ${initialAbsoluteUriToNcx}`,
          error,
        );
      });
  }, [absoluteUriToNcx]);

  const spine = useMemo(
    () => (opf ? getSpineFromOpf({ opf, nav: params.nav }) : undefined),
    [opf, params.nav],
  );

  const toc = useMemo(
    () =>
      params.ncxFileHref && ncx
        ? getTocFromNCX({ ncx, ncxFileHref: params.ncxFileHref })
        : undefined,
    [ncx, params.ncxFileHref],
  );

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
                        headerTitle: 'Spine',
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
                        headerTitle: 'Table of Contents',
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
        message: string;
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
      type Payload =
        | LogPayload
        | LookUpPayload
        | TokenizePayload
        | NavigationRequestPayload;

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
        case 'navigation-request': {
          if (!spine) {
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
            console.log('Unable to find current page in spine');
            return;
          }
          const newIndex = currentItemIndex + (value === 'next' ? 1 : -1);
          const newPage = spine[newIndex];
          if (!newPage) {
            return;
          }

          const newUri = `${params.opsUri}/${newPage.href}`;
          console.log(`[onMessage] Setting URI to "${newUri}"`);
          setWebViewUri(`${newUri}`);
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
              typeof id === 'string'
                ? `__paranovelState.tokenizationPromiseHandlers[${id}].${type}(${value});`
                : `Object.keys(__paranovelState.tokenizationPromiseHandlers).forEach(id => __paranovelState.tokenizationPromiseHandlers[id].${type}(${value}));`,
            );
          const resolve = (value: string, id?: number) =>
            settle('resolve', value, id);
          const reject = (value: string, id?: number) =>
            settle('reject', value, id);

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
                `{ "offsetOfTargetTokenIntoBlockBaseText": ${offsetOfTargetTokenIntoBlockBaseText}, "tokenLength": ${length}, "dictionaryForm": "${dictionaryForm.replace(
                  '"',
                  '\\"',
                )}" }`,
                id,
              );
            }

            offsetOfTargetTokenIntoBlockBaseText += length;
          }

          return reject('"Didn\'t find token"', id);
        }
      }
    },
    [spine, params.opsUri],
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
        onLoadStart={({ nativeEvent: { url, loading, title } }) => {
          console.log('onLoadStart', url, loading, title);
        }}
        onLoadEnd={({ nativeEvent: { url, loading, title } }) => {
          console.log('onLoadEnd', url, loading, title);
        }}
        injectedJavaScript={injectedJavaScript}
        allowFileAccessFromFileURLs={true}
        allowingReadAccessToURL={params.opsUri}
        // Specifying 'file://*' in here is necessary to stop the WebView from
        // treating file URLs as being blocklisted. Blocklisted URLs get opened
        // via Linking (to be passed on to Safari) instead.
        originWhitelist={['file://*']}
        source={{ uri: webViewUri }}
        onNavigationStateChange={({ url }) => {
          // The first navigation upon load will be "about:blank".
          if (!url.startsWith('file://')) {
            return;
          }
          setWebViewUri(url);
        }}
      />
    </SafeAreaView>
  );
}

// Many of these things (like scroll restoration) would belong better in
// injectedJavaScriptBeforeContentLoaded, but I'm finding it to be an incredibly
// unreliable prop
const injectedJavaScript = `
// Prevent restoring the last-scrolled position from a previous session.
history.scrollRestoration = "manual";

{
  // Insert a viewport meta tag
  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = "width=device-width, initial-scale=1, user-scalable=no";
  document.head.appendChild(meta);

  // Insert our custom styles. This approach reliably presents the styles in the
  // WebKit web inspector's styles menu, unlike the adoptedStyleSheets approach,
  // where I've noticed that body styles simply don't show up even if they take
  // effect.
  const style = document.createElement('style');
  style.textContent = \`
:root {
  /*
   * - In vertical-rl text: 'block' = 'horizontal' and 'inline' = 'vertical'.
   * - In horizontal-lr text: 'block' = 'vertical' and 'inline' = 'horizontal'.
   */
  --paranovel-block-padding: 24px;
  --paranovel-inline-padding: 24px;
  --paranovel-font-size: 24px;
}

::highlight(word) {
  color: black;
  background-color: yellow;
}

* {
  /*
    Prevent double-tap from zooming and centring on the element (e.g. <button>
    elements). The zoom cancellation is redundant with the "user-scalable=no"
    option specified in our <meta> tag, but the centring cancellation isn't.
  */
  touch-action: pan-x pan-y;
}

html {
  margin: 0 !important;
  max-inline-size: none !important;
}

body {
  position: relative !important;
  box-sizing: border-box !important;
  padding-block: var(--paranovel-block-padding) !important;
  padding-inline: var(--paranovel-inline-padding) !important;
  margin: 0 !important;
  inline-size: 100% !important;
  font-size: var(--paranovel-font-size) !important;
}

div:has(img) {
  height: auto !important;
}

img, svg {
  /* Stop images sizing to their container  */
  block-size: auto !important;

  /* Prevent images from dictating the height of the whole page. */
  max-inline-size: 100% !important;
}
  \`.trim();
  document.head.appendChild(style);
}

/**
 * Prepend a prelude and append a postlude into the <body>.
 */
function insertNavigationButtons(body){
  // TODO: style Previous & Next as primary, and the Jump buttons as secondary.
  const commonStyles = "display: flex; justify-content: center; align-items: center; column-gap: 8px;";

  const prelude = \`
<div id="paranovel-prelude" style="\${commonStyles} padding-block-end: 16px;">
  <button id="paranovel-previous" type="button" style="writing-mode: horizontal-tb;">Previous</button>
  <button id="paranovel-end" type="button" style="writing-mode: horizontal-tb;">Jump to end</button>
</div>
  \`.trim();

  const postlude = \`
<div id="paranovel-postlude" style="\${commonStyles} padding-block-start: 16px;">
  <button id="paranovel-start" type="button" style="writing-mode: horizontal-tb;">Return to start</button>
  <button id="paranovel-next" type="button" style="writing-mode: horizontal-tb;">Next</button>
</div>
  \`.trim();

  for(const html of [postlude, prelude]){
    const template = document.createElement("template");
    template.innerHTML = html;
    const dom = template.content.firstChild;

    switch(dom.id){
      case "paranovel-prelude": {
        const prev = dom.querySelector("#paranovel-previous");
        prev.onclick = (event) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "navigation-request",
            value: "prev",
            currentHref: location.href,
          }));
        };

        const end = dom.querySelector("#paranovel-end");
        end.onclick = (event) => {
          document.body.scrollIntoView({ block: "end", inline: "end", behavior: "instant" });
        };

        body.prepend(dom);
        break;
      }
      case "paranovel-postlude": {
        const next = dom.querySelector("#paranovel-next");
        next.onclick = (event) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "navigation-request",
            value: "next",
            currentHref: location.href,
          }));
        };

        const start = dom.querySelector("#paranovel-start");
        start.onclick = (event) => {
          document.body.scrollIntoView({ block: "start", inline: "start", behavior: "instant" });
        };

        body.append(dom);
        break;
      }
    }
  }
}

function log(message){
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message }));
};

async function onClickDocument(event){
  const { x, y } = event;

  const caretRange = document.caretRangeFromPoint(x, y);
  if(!caretRange){
    log('❌ no caret range');
    return;
  }

  const surroundingText = getSurroundingText(caretRange);
  if(!surroundingText){
    log('❌ no surrounding text');
    return;
  }
  console.log(surroundingText);
  const {
    blockBaseText,
    offsetOfTargetBaseTextIntoBlockBaseText,
    targetNode,
  } = surroundingText;

  __paranovelState.wordHighlight.clear();

  const id = __paranovelState.tokenizationPromiseCount++;

  let response;
  try {
    response = await new Promise((resolve, reject) => {
      __paranovelState.tokenizationPromiseHandlers[id] = { resolve, reject };

      // Promise is settled by onNovelViewMessage calling resolve/reject
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tokenize',
        id,
        blockBaseText,
        offset: offsetOfTargetBaseTextIntoBlockBaseText,
      }));
    });
  } catch (error) {
    console.error("Tokenize Promise rejected with error", error);
    log(\`❌ Tokenize Promise rejected"\${error instanceof Error ? \` with error: \${error.message}\` : '.'}"\`);
  } finally {
    delete __paranovelState.tokenizationPromiseHandlers[id];
  }

  const {
    dictionaryForm,
    tokenLength,
    offsetOfTargetTokenIntoBlockBaseText,
  } = response;
  // FIXME: we now know the offset of our target token into the blockBaseText.
  // We need to traverse the block again to figure out what node offset that
  // corresponds to.
  lookUpTerm(dictionaryForm);

  // TODO: adjust the target if it's a <ruby>, and handle selecting across
  // formatted text spans like <em>.
  const selectionRange = new Range();
  selectionRange.setStart(targetNode, offsetOfTargetTokenIntoBlockBaseText);
  selectionRange.setEnd(targetNode, offsetOfTargetTokenIntoBlockBaseText);

  const selection = document.getSelection();
  if(!selection){
    log('❌ no selection');
    return;
  }
  selection.removeAllRanges();
  selection.addRange(selectionRange);
  for(let i = 0; i < tokenLength; i++){
    document.getSelection().modify('extend', 'right', 'character');
  }

  const resultingRange = document.getSelection().getRangeAt(0);
  if(resultingRange){
    __paranovelState.wordHighlight.add(resultingRange);
  }

  // Seems redundant (I think .surroundContents() clears it), but might as well.
  document.getSelection().removeAllRanges();
}

function lookUpTerm(dictionaryForm){
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'lookUpTerm',
    message: dictionaryForm,
  }));
};

function getSurroundingText(range){
  const { startContainer: targetNode, startOffset: targetOffset } = range;
  if(!(targetNode instanceof Text)){
    return;
  }

  const element = targetNode.parentElement;
  if(!element){
    return;
  }

  const closestRuby = element.closest("ruby");
  const pivot = closestRuby ?? targetNode;
  const blockElementsSelector = 'address,article,aside,blockquote,canvas,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,noscript,ol,p,pre,section,table,tfoot,ul,video';
  const closestBlock = element.closest(blockElementsSelector);
  const blocklist = (element) => element?.classList.contains("timestamp");

  const leadingBaseText = getFollowingText(pivot, 'previous', closestBlock, blocklist);
  const targetBaseText = getBaseTextContent(pivot);
  const trailingBaseText = getFollowingText(pivot, 'next', closestBlock, blocklist);

  const offsetOfTargetBaseTextIntoBlockBaseText = leadingBaseText.length + (closestRuby ? 0 : targetOffset);
  const blockBaseText = leadingBaseText + targetBaseText + trailingBaseText;

  return {
    leadingBaseText,
    targetNode,
    targetBaseText,
    targetBaseTextSliced: targetBaseText.slice(offsetOfTargetBaseTextIntoBlockBaseText),
    trailingBaseText,
    blockBaseText,
    offsetOfTargetBaseTextIntoBlockBaseText,
  };
}

function getFollowingText(node, direction, untilAncestor, blocklist){
  let followingText = '';

  if(direction === "next"){
    for(const text of traverseFollowingText(node, direction, untilAncestor, blocklist)){
      followingText = \`\${followingText}\${text}\`;
    }
  } else {
    for(const text of traverseFollowingText(node, direction, untilAncestor, blocklist)){
      followingText = \`\${text}\${followingText}\`;
    }
  }

  return followingText;
}

function* traverseFollowingText(node, direction, untilAncestor, blocklist){
  let followingText = '';

  let parent = node.parentElement;
  let sibling = direction === 'next' ? node.nextSibling : node.previousSibling;
  while(true){
    // If we've reached the end of the run, climb up to the parent and continue.
    while(!sibling){
      if(!parent || parent === untilAncestor){
        return;
      }

      sibling = direction === 'next' ?
        parent.nextSibling :
        parent.previousSibling;

      // If we've walked into an ineligible (end-of-line) sibling, climb up
      // further. This is purely a lazy anti-pattern to support timestamp.
      if(blocklist(sibling)){
        sibling = null;
      }

      parent = parent.parentElement;
    }

    yield getBaseTextContent(sibling);

    sibling = direction === 'next' ?
      sibling.nextSibling :
      sibling.previousSibling;
  }
}

// Warning: does not return empty strings if called directly on/inside <rt>/<rp>
function getBaseTextContent(node){
  return node.nodeName === "RUBY" ?
    [...node.childNodes].filter(
      node => node.nodeName === "#text" || node.nodeName === "RB"
    ).map(node => node.textContent).join("") :
      node instanceof Text ?
        node.textContent :
        [...node.childNodes].map(node => getBaseTextContent(node)).join('');
}

const __paranovelState = {
  wordHighlight: new Highlight(),
  tokenizationPromiseCount: 0,
  tokenizationPromiseHandlers: {},
};

CSS.highlights.set("word", __paranovelState.wordHighlight);

insertNavigationButtons(document.body);
document.addEventListener('click', onClickDocument);
`.trim();

const style = StyleSheet.create({
  container: { flex: 1 },
});
