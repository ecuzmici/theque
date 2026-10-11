export {};

declare global {
  // React reads this flag to allow `act()` outside a test renderer.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
