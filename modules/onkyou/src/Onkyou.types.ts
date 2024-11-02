import { NativeSyntheticEvent } from 'react-native';

export type TimeupdateEventPayload = {
  currentTime: number;
};

export type OnkyouViewProps = {
  /** Temporary prop to support imperative API calls. */
  instanceId: string;
  src: string;
  autoplay?: boolean;
  /**
   * Called after play() is called (either by the user, or due to autoplay).
   */
  onPlay?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  /**
   * Called after the video rate has become non-zero (e.g. when starting to play
   * or resuming from a pause).
   */
  onPlaying?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  onPause?: (event: NativeSyntheticEvent<Record<string, never>>) => void;
  onTimeupdate?: (event: NativeSyntheticEvent<{ currentTime: number }>) => void;
  onLoadedmetadata?: (
    event: NativeSyntheticEvent<{ currentTime: number; duration: number }>
  ) => void;
  onProgress?: (
    event: NativeSyntheticEvent<{
      buffered: Array<{ start: number; duration: number }>;
    }>
  ) => void;
};

export interface OnkyouViewInterface {
  play(): void;
  pause(): void;
  setCurrentTime(currentTime: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getBuffered(): Array<{ start: number; duration: number }>;
  isPaused(): boolean;
}
