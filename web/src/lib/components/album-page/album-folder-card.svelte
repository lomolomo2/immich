<script lang="ts">
  import { getAlbumFolderUrl, type AlbumFolder } from '$lib/utils/album-folders';
  import { Icon } from '@immich/ui';
  import { mdiFolderOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    folder: AlbumFolder;
  }

  let { folder }: Props = $props();
</script>

<a href={getAlbumFolderUrl(folder.path)} class="h-fit" data-testid="album-folder-card">
  <div
    class="group relative rounded-2xl border border-transparent p-5 hover:bg-gray-100 hover:border-gray-200 dark:hover:border-gray-800 dark:hover:bg-gray-900"
  >
    <div
      class="flex aspect-square size-full items-center justify-center rounded-xl bg-subtle text-gray-500 transition-all duration-300 hover:shadow-lg dark:text-gray-400"
    >
      <Icon icon={mdiFolderOutline} size="64" />
    </div>

    <div class="mt-4">
      <p
        class="w-full leading-6 text-lg line-clamp-2 font-semibold text-black dark:text-white group-hover:text-primary"
        title={folder.path.join('/')}
      >
        {folder.name}
      </p>
      <p class="text-sm dark:text-immich-dark-fg">
        {$t('items_count', { values: { count: folder.itemCount } })}
      </p>
    </div>
  </div>
</a>
