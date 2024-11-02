import ExpoMecabModule from './src/ExpoMecabModule';

export function tokenize(text: string): Token[] {
  return ExpoMecabModule.tokenize(text);
}

export interface Token {
  surface: string;
  reading: string | null;
  lemma: string | null;
  trailingWhitespace: string | null;
}
