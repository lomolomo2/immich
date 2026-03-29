import { matchesShortcut, shortcuts } from '$lib/actions/shortcut';

describe('matchesShortcut', () => {
  it('returns false when the keyboard event does not expose a key', () => {
    const event = {
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as KeyboardEvent;

    expect(matchesShortcut(event, { key: 'm' })).toBe(false);
  });
});

describe('shortcuts', () => {
  it('ignores keydown events without a keyboard key', () => {
    const node = document.createElement('div');
    let callCount = 0;

    const action = shortcuts(node, [
      {
        shortcut: { key: 'm' },
        onShortcut: () => {
          callCount += 1;
        },
      },
    ]);

    expect(() => node.dispatchEvent(new Event('keydown'))).not.toThrow();
    expect(callCount).toBe(0);

    action.destroy?.();
  });
});
