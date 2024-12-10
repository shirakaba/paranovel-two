/**
 * TypeScript declarations to consume certain filetypes as "source assets" (i.e.
 * as strings rather than parsed code).
 *
 * Needs to be used alongside a Metro pseudo-plugin, Babel transformer, and with
 * VS Code `files.associations` settings configured.
 */

declare module '*.wvcss' {
  const source: string;
  export default source;
}
declare module '*.wvhtml' {
  const source: string;
  export default source;
}
declare module '*.wvjs' {
  const source: string;
  export default source;
}
declare module '*.wvts' {
  const source: string;
  export default source;
}
