type ClickModifiers = Pick<
  MouseEvent,
  "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export const isUnmodifiedPrimaryClick = (event: ClickModifiers) =>
  event.button === 0 &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey;
