import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, SafeAreaView, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import type { Book } from '@/types/book.types';
import { useLibrary } from '@/hooks/useLibrary';
import type { OPF } from '@/types/opf.types';

export default function BookScreen() {
  const params = useLocalSearchParams<
    Book & {
      href: string;
      /**
       * Needed in case the user has navigated away from params.href and we
       * need to force the WebView to re-render the same uri (due to the user
       * having navigated away from that uri, desyncing the React state).
       */
      navigationTimestamp: string;
    }
  >();

  const [webViewUri, setWebViewUri] = useState(params.href);

  // This hook, and the navigationTimestamp, are a crude workaround for the
  // webViewUri not updating when a sub-screen (e.g. ToC) unwinds back to this
  // screen, passing the same params.href as it the screen began with.
  useEffect(() => {
    setWebViewUri(params.href);
  }, [params.href, params.navigationTimestamp]);

  const library = useLibrary();
  const [opf, setOPF] = useState<OPF>();

  const Screen = () => (
    <Stack.Screen
      options={{
        headerShown: true,
        headerTitle: params.title,
        headerRight: () => {
          if (!opf) {
            return (
              <Link disabled href="/toc" asChild>
                <Button title="ToC" />
              </Link>
            );
          }

          const {
            package: {
              manifest: { items },
              spine: { itemrefs },
            },
          } = opf;

          // To be expanded to: `${backParams.opsUri}/${href}`
          const hrefs = new Array<string>();
          const labels = new Array<string>();

          if (params.nav) {
            hrefs.push(params.nav);
            labels.push('Nav');
          }

          let i = 0;
          for (const { idref } of itemrefs) {
            const item = items.find(item => item.id === idref);
            if (!item || item.href === params.nav) {
              continue;
            }
            hrefs.push(item.href);
            labels.push(`Part ${i}`);
            i++;
          }

          return (
            <Link
              href={{
                pathname: '/toc',
                params: { ...params, hrefs, labels },
              }}
              asChild>
              <Button title="ToC" />
            </Link>
          );
        },
      }}
    />
  );

  if (library.type !== 'loaded') {
    return <Screen />;
  }

  if (!params.opsUri) {
    return <Screen />;
  }

  return (
    <>
      {/* https://docs.expo.dev/router/advanced/stack/#header-buttons */}
      <Screen />
      <SafeAreaView style={style.container}>
        <WebView
          webviewDebuggingEnabled={true}
          javaScriptEnabled={true}
          onMessage={({ nativeEvent: { data } }) => {
            let parsedData: any;
            try {
              parsedData = JSON.parse(data);
            } catch (error) {
              return;
            }

            switch (parsedData.type) {
              case 'opf': {
                setOPF(parsedData.message);
                return;
              }
            }
          }}
          injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded(
            {
              opsUri: params.opsUri,
              relativePathToOpfFromOps: params.relativePathToOpfFromOps,
            },
          )}
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
    </>
  );
}

const injectedJavaScriptBeforeContentLoaded = ({
  opsUri,
  relativePathToOpfFromOps,
}: {
  opsUri: string;
  relativePathToOpfFromOps: string;
}) =>
  `
const __opsUri = "${opsUri}";
const __relativePathToOpfFromOps = "${relativePathToOpfFromOps}";
`.trim();

const injectedJavaScript = `
{
  // Insert a viewport meta tag
  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = "width=device-width, initial-scale=1";
  document.head.appendChild(meta);

  // Insert our custom styles. This approach reliably presents the styles in the
  // WebKit web inspector's styles menu, unlike the adoptedStyleSheets approach,
  // where I've noticed that body styles simply don't show up even if they take
  // effect.
  const style = document.createElement('style');
  style.textContent = \`
body {
  box-sizing: border-box !important;
  padding: 24pt !important;
  margin: 0 !important;
  inline-size: 100% !important;
  font-size: 20pt !important;
}

img, svg {
  /* Prevent images from dictating the height of the whole page. */
  max-inline-size: 100% !important;
}
  \`.trim();
  document.head.appendChild(style);
}

/**
 * A best effort to make a scroll container snap every point at which it scrolls
 * past a viewport.
 */
function enableScrollSnapping(scrollContainer){
  const writingMode = scrollContainer.computedStyleMap().get("writing-mode").value;
  // e.g. "vertical-rl", "horizontal-tb"
  const [axis, direction] = writingMode.split("-");

  scrollContainer.style.inlineSize = "100%";
  // Redundant, but depends what other styles we're fighting against.
  scrollContainer.style[axis === "vertical" ? "width" : "height"] = "100%";

  scrollContainer.style[axis === "vertical" ? "overflowX" : "overflowY"] = "scroll";
  scrollContainer.style.position = "relative";
  scrollContainer.style.scrollSnapType = "block mandatory";

  const viewportWidth = window.innerWidth;
  const { scrollWidth } = scrollContainer;
  const snapPoints = Math.ceil(scrollWidth / viewportWidth);
  for(let i = 0; i < snapPoints; i++){
    const snapPoint = document.createElement("div");
    snapPoint.style.position = "absolute";
    if(axis === "vertical"){
      snapPoint.style.top = "0";
      snapPoint.style[direction === "rl" ? "right" : "left"] = \`\${i * 100}vw\`;
      snapPoint.style.scrollSnapAlign = "rl" ? "start": "end";
    } else {
      snapPoint.style.left = "0";
      snapPoint.style.top = "100vw";
      snapPoint.style.scrollSnapAlign = "start";
    }
    snapPoint.style.height = "1px";
    snapPoint.style.width = "1px";
    snapPoint.style.pointerEvents = "none";
    scrollContainer.prepend(snapPoint);
  }
}

function buildHUD(){
  const html = \`
<div id="hud" style="position: fixed; display: flex; justify-content: center; width: 100%; top: 0; left: 0; right: 0; background-color: rgb(55,65,81); min-height: 40px; padding: 8px; writing-mode: horizontal-tb; color: white; font-family: sans-serif; font-size: 16px;">
</div>
  \`.trim();

  const template = document.createElement("template");
  template.innerHTML = html;
  const dom = template.content.firstChild;
  return dom;
}

async function parseOPF(href){
  const result = await fetch(href);
  const text = await result.text();
  console.log(text);
  const doc = new DOMParser().parseFromString(text, "application/xml");

  const metadata = doc.querySelector("metadata");
  const manifest = doc.querySelector("manifest");
  const spine = doc.querySelector("spine");
  const guide = doc.querySelector("guide");
  // Only guide is optional, to my understanding.
  if(!metadata || !manifest || !spine){
    return;
  }
  const dc = "http://purl.org/dc/elements/1.1/";
  const opf = "http://www.idpf.org/2007/opf";

  // Parse <package>
  const uniqueIdentifier = doc.documentElement.getAttribute("unique-identifier");
  const version = doc.documentElement.getAttribute("version");

  // Parse <metadata> section
  const languages = [...metadata.getElementsByTagNameNS(dc, "language")]
    .map(element => ({ textContent: element.textContent }));
  const titles = [...metadata.getElementsByTagNameNS(dc, "title")]
    .map(element => ({ textContent: element.textContent }));
  const creators = [...metadata.getElementsByTagNameNS(dc, "creator")]
    .map(element => ({
      textContent: element.textContent,
      opfFileAs: element.getAttributeNS(opf, "file-as"),
      opfRole: element.getAttributeNS(opf, "role"),
    }));
  const contributors = [...metadata.getElementsByTagNameNS(dc, "contributor")]
    .map(element => ({ textContent: element.textContent }));
  const publishers = [...metadata.getElementsByTagNameNS(dc, "publisher")]
    .map(element => ({ textContent: element.textContent }));
  const identifiers = [...metadata.getElementsByTagNameNS(dc, "identifier")]
    .map(element => ({
      id: element.id,
      textContent: element.textContent,
      opfScheme: element.getAttributeNS(opf, "scheme"),
    }));
  const dates = [...metadata.getElementsByTagNameNS(dc, "date")]
    .map(element => ({ textContent: element.textContent }));
  const metas = [...metadata.querySelectorAll("meta")]
    .map(element => ({
      name: element.getAttribute("name"),
      content: element.getAttribute("content"),
    }));

  // Parse <manifest> section
  const items = [...manifest.querySelectorAll("item")]
    .map(element => ({
      id: element.id,
      href: element.getAttribute("href"),
      mediaType: element.getAttribute("media-type"),
    }));

  // Parse <spine> section
  const toc = spine.getAttribute("toc");
  const pageProgressionDirection = spine.getAttribute("page-progression-direction");
  const itemrefs = [...spine.querySelectorAll("itemref")]
    .map(element => ({ idref: element.getAttribute("idref") }));

  const message = {
    package: {
      version,
      uniqueIdentifier,
      metadata: {
        languages,
        titles,
        creators,
        contributors,
        publishers,
        identifiers,
        dates,
        metas,
      },
      manifest: { items },
      spine: {
        toc,
        pageProgressionDirection,
        itemrefs,
      },
    },
  };

  // Parse optional <guide> section
  if(guide){
    const references = [...guide.querySelectorAll("reference")]
      .map(element => ({
        type: element.getAttribute("type"),
        href: element.getAttribute("href"),
        title: element.getAttribute("title"),
      }));
    message.package.guide = { references };
  }

  window.ReactNativeWebView.postMessage(JSON.stringify({ type: "opf", message }));

  return message;
}

// document.body.prepend(buildHUD());

// We wait for the text to lay out and for the writing direction to resolve.
requestAnimationFrame(() => {
  // FIXME: need a reliable heuristic for determining the main scroll container.
  enableScrollSnapping(document.querySelector('.main1'));
});

parseOPF(\`\${__opsUri}/\${__relativePathToOpfFromOps}\`)
.catch(console.error);
`.trim();

const style = StyleSheet.create({
  container: { flex: 1 },
});
