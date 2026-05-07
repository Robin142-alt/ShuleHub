export const routerPushMock = jest.fn();
export const routerReplaceMock = jest.fn();
export const routerPrefetchMock = jest.fn();

export function resetRouterMocks() {
  routerPushMock.mockReset();
  routerReplaceMock.mockReset();
  routerPrefetchMock.mockReset();
}
