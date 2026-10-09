import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { getAllAlbums } from '@immich/sdk';
import type { PageLoad } from './$types';

// Face-cluster albums ("/Faces/...") have their own page at /faces.
const withoutFaces = (albums: Awaited<ReturnType<typeof getAllAlbums>>) =>
  albums.filter((album) => !album.albumName.startsWith('/Faces'));

export const load = (async ({ url }) => {
  await authenticate(url);
  const sharedAlbums = withoutFaces(await getAllAlbums({ shared: true }));
  const albums = withoutFaces(await getAllAlbums({}));
  const $t = await getFormatter();

  return {
    albums,
    sharedAlbums,
    meta: {
      title: $t('albums'),
    },
  };
}) satisfies PageLoad;
