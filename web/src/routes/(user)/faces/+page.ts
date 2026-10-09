import { authenticate } from '$lib/utils/auth';
import { getAllAlbums } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const albums = await getAllAlbums({});
  const faces = albums
    .filter((album) => album.albumName.startsWith('/Faces'))
    .sort((a, b) => a.albumName.localeCompare(b.albumName));

  return {
    faces,
    meta: {
      title: 'Faces',
    },
  };
}) satisfies PageLoad;
