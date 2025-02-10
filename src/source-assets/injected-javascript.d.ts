export interface EdgeInsets {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface PopoverLayout {
  popoverPlacement: PopoverPlacement;
  arrow: {
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
    maxWidth: number;
    maxHeight: number;
  };
}

export type PopoverPlacement =
  | 'above'
  | 'below'
  | 'on the left'
  | 'on the right';

export interface CalculatePopoverLayoutReturnType {
  best: PopoverLayout;
  sorted: [PopoverLayout, PopoverLayout, PopoverLayout, PopoverLayout];
  above: PopoverLayout;
  below: PopoverLayout;
  toLeft: PopoverLayout;
  toRight: PopoverLayout;
}
