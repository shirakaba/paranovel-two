import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';

import type { Book } from '@/types/book.types';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useLibrary } from '@/hooks/useLibrary';

export default function BookScreen() {
  const params = useLocalSearchParams<Book>();
  const library = useLibrary();

  if (library.type !== 'loaded') {
    return;
  }

  if (!params.folderUri) {
    return;
  }

  return (
    <SafeAreaView style={style.container}>
      <WebView
        webviewDebuggingEnabled={true}
        javaScriptEnabled={true}
        onMessage={({ nativeEvent: { data } }) => {
          console.log(data);
        }}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded(
          params.folderUri,
        )}
        // I wanted to use `injectedJavaScriptBeforeContentLoaded`, but
        // `document.head` is `null` at that time, and listening for readystate
        // events somehow doesn't work either, as they don't fire.
        injectedJavaScript={injectedJavaScript}
        allowFileAccessFromFileURLs={true}
        allowingReadAccessToURL={params.folderUri}
        // Specifying 'file://*' in here is necessary to stop the WebView from
        // treating file URLs as being blocklisted. Blocklisted URLs get opened
        // via Linking (to be passed on to Safari) instead.
        originWhitelist={['file://*']}
        source={{ uri: `${params.folderUri}/text/part0007.html` }}
      />
    </SafeAreaView>
  );
}

const injectedJavaScriptBeforeContentLoaded = (folderUri: string) =>
  `
const __folderUri = "${folderUri}";
`.trim();

const injectedJavaScript = `
// Insert a viewport meta tag
{
  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = "width=device-width, initial-scale=1";
  document.head.appendChild(meta);
}

function buildHUD(){
  const html = \`
<div id="hud" style="position: fixed; display: flex; justify-content: center; width: 100%; top: 0; left: 0; right: 0; background-color: rgb(55,65,81); min-height: 40px; padding: 8px; writing-mode: horizontal-tb; color: white; font-family: sans-serif; font-size: 16px;">
  <details style="width: 300px; max-height: 400px; overflow: auto; padding: 8px; border-radius: 8px; background-color: #a0a6b3;">
    <summary>ToC</summary>

    <!-- To be populated by the populateToC() function. -->
    <ul id="toc"></ul>
  </details>
</div>
  \`.trim();

  const template = document.createElement("template");
  template.innerHTML = html;
  const dom = template.content.firstChild;
  return dom;
}

function populateToC(opf, folderUri){
  const { package: { manifest: { items }, spine: { itemrefs } } } = opf;
  const toc = document.getElementById("toc");
  toc.replaceChildren([]);

  for(const [i, { idref }] of itemrefs.entries()){
    const item = items.find(item => item.id === idref);
    if(!item){
      continue;
    }
    const template = document.createElement("template");
    const html = \`
<li>
  <a href="\${folderUri}/\${item.href}">part \${i}</a>
</li>
    \`.trim();
    template.innerHTML = html;
    toc.append(template.content.firstChild);
  }
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

  // window.ReactNativeWebView.postMessage(JSON.stringify({ type: "opf", message }));

  return message;
}

document.body.prepend(buildHUD());

parseOPF(\`\${__folderUri}/content.opf\`)
.then((opf) => {
  populateToC(opf, __folderUri);
})
.catch(console.error);
`.trim();

const style = StyleSheet.create({
  container: { flex: 1 },
});
