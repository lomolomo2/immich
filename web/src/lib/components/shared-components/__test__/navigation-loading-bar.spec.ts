import NavigationLoadingBar from '$lib/components/shared-components/navigation-loading-bar.svelte';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

describe('NavigationLoadingBar component', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a spinner only once the page has been loading for a while', async () => {
    render(NavigationLoadingBar);

    vi.advanceTimersByTime(200);
    await tick();
    expect(screen.queryByTestId('navigation-loading-spinner')).toBeNull();

    vi.advanceTimersByTime(200);
    await tick();
    expect(screen.getByTestId('navigation-loading-spinner')).toBeInTheDocument();
  });
});
