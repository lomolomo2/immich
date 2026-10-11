<script lang="ts">
  import { Route } from '$lib/route';
  import { userInteraction } from '$lib/stores/user.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { getAlbumFolderEntries, getAlbumFolderUrl } from '$lib/utils/album-folders';
  import { handleError } from '$lib/utils/handle-error';
  import { getAllAlbums } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiFolderOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  let albums = $state(userInteraction.recentAlbums);
  // Only the top level, like the albums page: a folder opens it there (/albums?path=...),
  // where its sub-folders and albums are; an album opens its timeline.
  const entries = $derived(getAlbumFolderEntries(albums ?? [], []));

  const refreshAlbums = async () => {
    try {
      const allAlbums = await getAllAlbums({});
      albums = allAlbums
        .filter((album) => !album.albumName.startsWith('/Faces'))
        .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
      userInteraction.recentAlbums = albums;
    } catch (error) {
      handleError(error, $t('failed_to_load_assets'));
    }
  };

  $effect(() => {
    if (!userInteraction.recentAlbums) {
      void refreshAlbums();
    }
  });
</script>

{#each entries as entry (entry.type === 'folder' ? `folder:${entry.name}` : entry.album.id)}
  <a
    href={entry.type === 'folder' ? getAlbumFolderUrl(entry.folder.path) : Route.viewAlbum(entry.album)}
    title={entry.type === 'folder' ? entry.name : entry.album.albumName}
    class="flex w-full place-items-center justify-between gap-4 rounded-e-full py-3 transition-[padding] delay-100 duration-100 hover:cursor-pointer hover:bg-subtle hover:text-immich-primary dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray dark:hover:text-immich-dark-primary ps-10 group-hover:sm:px-10 md:px-10"
  >
    <div>
      {#if entry.type === 'folder'}
        <div class="flex h-6 w-6 items-center justify-center rounded bg-gray-200 dark:bg-gray-600">
          <Icon icon={mdiFolderOutline} size="1rem" />
        </div>
      {:else}
        <div
          class="h-6 w-6 bg-cover rounded bg-gray-200 dark:bg-gray-600"
          style={entry.album.albumThumbnailAssetId
            ? `background-image:url('${getAssetMediaUrl({ id: entry.album.albumThumbnailAssetId })}')`
            : ''}
        ></div>
      {/if}
    </div>
    <div class="grow text-sm font-medium truncate">
      {entry.name}
    </div>
  </a>
{/each}
