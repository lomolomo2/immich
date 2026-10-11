import { sdkMock } from '$lib/__mocks__/sdk.mock';
import RecentAlbums from '$lib/components/shared-components/side-bar/recent-albums.svelte';
import { albumFactory } from '@test-data/factories/album-factory';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

describe('RecentAlbums component', () => {
  it('lists only the top level: folders open the albums page, albums their timeline', async () => {
    const albums = [
      albumFactory.build({ albumName: 'wedding' }),
      albumFactory.build({ albumName: '/Hedy/piano' }),
      albumFactory.build({ albumName: '/Hedy/outdoor' }),
      albumFactory.build({ albumName: '/351-1/相册' }),
      albumFactory.build({ albumName: '/Faces/Hedy' }),
    ];

    sdkMock.getAllAlbums.mockResolvedValueOnce([...albums]);
    render(RecentAlbums);

    expect(sdkMock.getAllAlbums).toBeCalledTimes(1);

    await tick();
    await tick();

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent?.trim())).toEqual(['351-1', 'Hedy', 'wedding']);
    expect(links[0]).toHaveAttribute('href', '/albums?path=351-1');
    expect(links[1]).toHaveAttribute('href', '/albums?path=Hedy');
    expect(links[2]).toHaveAttribute('href', `/albums/${albums[0].id}`);
  });
});
