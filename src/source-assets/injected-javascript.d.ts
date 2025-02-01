export interface EdgeInsets {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface PopoverLayout {
  arrow: {
    direction: 'up' | 'down' | 'left' | 'right' | 'none';
    x: number;
    y: number;
    width: number;
    height: number;
  };
  popover: {
    x: number;
    y: number;
    width: number;
    height: number;
    borderRadii: {
      borderTopRightRadius: number;
      borderTopLeftRadius: number;
      borderBottomLeftRadius: number;
      borderBottomRightRadius: number;
    };
  };
}

export interface CalculatePopoverLayoutParams {
  permittedArrowDirections: PopoverArrowDirection[];
  safeAreaEdgeInsets: EdgeInsets;
  sourceRect: { x: number; y: number; width: number; height: number };
  backdropHeight: number;
  backdropWidth: number;
  preferredHeight: number;
  preferredWidth: number;
  arrowBreadth: number;
  arrowLength: number;
  cornerWidth: number;
  borderRadius: number;
}

export interface CalculatePopoverLayoutForArrowDirectionParams {
  sourceRectClippedMidpoint: { readonly x: number; readonly y: number };
  backdropWidth: number;
  safeAreaEdgeInsets: EdgeInsets;
  sourceRectClipped: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  backdropHeight: number;
  preferredHeight: number;
  preferredWidth: number;
  arrowBreadth: number;
  arrowLength: number;
  cornerWidth: number;
  borderRadius: number;
}
