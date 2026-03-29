import type { ActionReturn } from 'svelte/action';

export type { Shortcut, ShortcutOptions } from '@immich/ui';
import type { Shortcut, ShortcutOptions } from '@immich/ui';

const inputFieldTypes = new Set(['text', 'date', 'datetime-local', 'email', 'password']);
const isMacOS = globalThis.navigator && /Mac(intosh|Intel)/.test(globalThis.navigator.userAgent);
const displayOverrides: Record<string, string> = {
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  Delete: '⌦',
};

export const shortcutLabel = (shortcut: Shortcut) => {
  let label = '';
  if (shortcut.ctrl) {
    label += 'Ctrl ';
  }
  if (shortcut.alt) {
    label += 'Alt ';
  }
  if (shortcut.meta) {
    label += 'Cmd ';
  }
  if (shortcut.shift) {
    label += '⇧';
  }
  label += shortcut.key.toUpperCase();
  return label;
};

/** Determines whether an event should be ignored. The event will be ignored if:
 *  - The element dispatching the event is not the same as the element which the event listener is attached to
 *  - The element dispatching the event is an input field
 */
export const shouldIgnoreEvent = (event: KeyboardEvent | ClipboardEvent) => {
  if (event.target === event.currentTarget) {
    return false;
  }

  const target = event.target;
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (target instanceof HTMLInputElement) {
    return inputFieldTypes.has(target.type);
  }

  return false;
};

export const matchesShortcut = (event: KeyboardEvent, shortcut: Shortcut) => {
  if (!shortcut?.key || typeof event?.key !== 'string' || event.key.length === 0) {
    return false;
  }

  return (
    shortcut.key.toLowerCase() === event.key.toLowerCase() &&
    Boolean(shortcut.alt) === event.altKey &&
    Boolean(shortcut.ctrl) === event.ctrlKey &&
    Boolean(shortcut.shift) === event.shiftKey &&
    Boolean(shortcut.meta) === event.metaKey
  );
};

export const renderShortcut = ({ alt, meta, ctrl, shift, key }: Shortcut) => {
  const result: string[] = [];
  if (alt) {
    result.push(isMacOS ? '⌥' : 'Alt');
  }
  if (meta) {
    result.push(isMacOS ? '⌘' : '❖');
  }
  if (ctrl) {
    result.push('Ctrl');
  }
  if (shift) {
    result.push('⇧');
  }
  result.push(displayOverrides[key] ?? key.toUpperCase());
  return result;
};

type EventTargetWithKeyboardListeners = EventTarget & {
  addEventListener(type: 'keydown', listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: 'keydown', listener: EventListenerOrEventListenerObject): void;
};

/** Bind a single keyboard shortcut to node. */
export const shortcut = <T extends HTMLElement>(
  node: T,
  option: ShortcutOptions<T>,
): ActionReturn<ShortcutOptions<T>> => {
  const { update: shortcutsUpdate, destroy } = shortcuts(node, [option]);
  return {
    update(newOption) {
      shortcutsUpdate?.([newOption]);
    },
    destroy,
  };
};

/** Binds multiple keyboard shortcuts to node */
export const shortcuts = <T extends HTMLElement>(
  node: T,
  options: ShortcutOptions<T>[],
): ActionReturn<ShortcutOptions<T>[]> => {
  function onKeydown(event: Event) {
    if (!(event instanceof KeyboardEvent) || event.defaultPrevented) {
      return;
    }

    const ignoreShortcut = shouldIgnoreEvent(event);
    for (const { shortcut, onShortcut, ignoreInputFields = true, preventDefault = true } of options) {
      if (ignoreInputFields && ignoreShortcut) {
        continue;
      }
      if (matchesShortcut(event, shortcut)) {
        if (preventDefault) {
          event.preventDefault();
        }
        onShortcut(event as KeyboardEvent & { currentTarget: T });
        return;
      }
    }
  }

  const target = node as EventTargetWithKeyboardListeners;
  target.addEventListener('keydown', onKeydown);
  return {
    update(newOptions) {
      options = newOptions;
    },
    destroy() {
      target.removeEventListener('keydown', onKeydown);
    },
  };
};
