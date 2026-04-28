import { SessionStorageKey } from '$lib/constants';
import { scrollMemory } from '$lib/actions/scroll-memory';
import { vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const subscribers: Array<(navigation: unknown) => void> = [];
  return { subscribers };
});

vi.mock('$app/stores', () => ({
  navigating: {
    subscribe: (callback: (navigation: unknown) => void) => {
      mocks.subscribers.push(callback);
      return () => {
        const index = mocks.subscribers.indexOf(callback);
        if (index >= 0) {
          mocks.subscribers.splice(index, 1);
        }
      };
    },
  },
}));

const flushPromises = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('scrollMemory', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.subscribers.length = 0;
  });

  it('restores saved scroll and clears the session storage entry', async () => {
    sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '128');
    const node = {
      scrollTop: 0,
      scroll: vi.fn(),
    } as unknown as HTMLElement;

    const action = scrollMemory(node, { routeStartsWith: '/albums' });
    await flushPromises();

    expect(node.scroll).toHaveBeenCalledWith({
      top: 128,
      behavior: 'instant',
    });
    expect(sessionStorage.getItem(SessionStorageKey.SCROLL_POSITION)).toBeNull();

    action.destroy();
  });

  it('resets the scroll position to top when there is no saved scroll state', async () => {
    const node = {
      scrollTop: 240,
      scroll: vi.fn(),
    } as unknown as HTMLElement;

    const action = scrollMemory(node, { routeStartsWith: '/albums' });
    await flushPromises();

    expect(node.scroll).toHaveBeenCalledWith({
      top: 0,
      behavior: 'instant',
    });

    action.destroy();
  });
});
