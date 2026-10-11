<script lang="ts">
  import { page } from '$app/state';
  import { scrollMemory } from '$lib/actions/scroll-memory';
  import AlbumsControls from '$lib/components/album-page/albums-controls.svelte';
  import Albums from '$lib/components/album-page/albums-list.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import GroupTab from '$lib/elements/GroupTab.svelte';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import { Route } from '$lib/route';
  import { AlbumFilter, albumViewSettings } from '$lib/stores/preferences.store';
  import { getAlbumFolderUrl, parseAlbumFolderPath } from '$lib/utils/album-folders';
  import { createAlbumAndRedirect } from '$lib/utils/album-utils';
  import { Icon } from '@immich/ui';
  import { mdiChevronRight } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let searchQuery = $state('');
  let albumGroups: string[] = $state([]);
  // Albums nest in folders by name ("/Hedy/2022-ski"); ?path=Hedy shows the Hedy folder.
  let folderPath = $derived(parseAlbumFolderPath(page.url.searchParams.get('path')));
</script>

<UserPageLayout title={data.meta.title} use={[[scrollMemory, { routeStartsWith: Route.albums() }]]}>
  {#snippet buttons()}
    <div class="flex place-items-center gap-2">
      <AlbumsControls {albumGroups} bind:searchQuery />
    </div>
  {/snippet}

  <div class="xl:hidden">
    <div class="w-fit h-14 dark:text-immich-dark-fg py-2">
      <GroupTab
        label={$t('show_albums')}
        filters={Object.keys(AlbumFilter)}
        selected={$albumViewSettings.filter}
        onSelect={(selected) => ($albumViewSettings.filter = selected)}
      />
    </div>
    <div class="w-60">
      <SearchBar placeholder={$t('search_albums')} bind:name={searchQuery} showLoadingSpinner={false} />
    </div>
  </div>

  {#if folderPath.length > 0 && !searchQuery}
    <nav class="flex flex-wrap items-center gap-1 py-2 text-lg dark:text-immich-dark-fg" aria-label={$t('folders')}>
      <a href={getAlbumFolderUrl([])} class="hover:text-primary">{$t('albums')}</a>
      {#each folderPath as name, index (index)}
        <Icon icon={mdiChevronRight} size="20" class="opacity-60" />
        {#if index === folderPath.length - 1}
          <span class="font-semibold text-black dark:text-white">{name}</span>
        {:else}
          <a href={getAlbumFolderUrl(folderPath.slice(0, index + 1))} class="hover:text-primary">{name}</a>
        {/if}
      {/each}
    </nav>
  {/if}

  <Albums
    ownedAlbums={data.albums}
    sharedAlbums={data.sharedAlbums}
    userSettings={$albumViewSettings}
    allowEdit
    {searchQuery}
    {folderPath}
    bind:albumGroupIds={albumGroups}
  >
    {#snippet empty()}
      <EmptyPlaceholder text={$t('no_albums_message')} onClick={() => createAlbumAndRedirect()} class="mt-10 mx-auto" />
    {/snippet}
  </Albums>
</UserPageLayout>
