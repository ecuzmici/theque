// jsdom lacks ResizeObserver, which the library masonry grid observes for its
// column layout. Provide a no-op stub so component tests can render the grid.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
