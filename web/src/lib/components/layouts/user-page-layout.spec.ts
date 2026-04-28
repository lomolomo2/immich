import { render, screen } from '@testing-library/svelte';
import UserPageLayoutTest from './__test__/user-page-layout-test.svelte';

describe('UserPageLayout', () => {
  it('keeps layout scrolling enabled in layout mode', () => {
    render(UserPageLayoutTest, { scrollMode: 'layout' });

    const content = screen.getByTestId('user-page-content');
    const main = content.parentElement;

    expect(content.classList).toContain('overflow-y-auto');
    expect(content.classList).toContain('overflow-x-hidden');
    expect(main?.classList).toContain('min-w-0');
    expect(main?.classList).toContain('overflow-hidden');
  });

  it('disables outer scrolling in child mode so the child owns the scroll surface', () => {
    render(UserPageLayoutTest, { scrollMode: 'child' });

    const content = screen.getByTestId('user-page-content');
    const main = content.parentElement;

    expect(content.classList).toContain('overflow-hidden');
    expect(content.classList).not.toContain('overflow-y-auto');
    expect(content.classList).toContain('overflow-x-hidden');
    expect(main?.classList).toContain('min-w-0');
  });
});
