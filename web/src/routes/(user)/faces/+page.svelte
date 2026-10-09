<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import { Route } from '$lib/route';
  import { getAssetMediaUrl } from '$lib/utils';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Album names come from lomo as "/Faces/<name>" — show just the name.
  const displayName = (albumName: string) => albumName.replace(/^\/Faces\/?/, '') || 'Unnamed';
</script>

<UserPageLayout title={data.meta.title}>
  {#if data.faces.length === 0}
    <p class="mt-10 text-center dark:text-immich-dark-fg">No faces found</p>
  {:else}
    <div class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-6">
      {#each data.faces as face (face.id)}
        <a
          href={Route.viewAlbum(face)}
          title={face.albumName}
          class="group flex flex-col items-center gap-2"
        >
          <div
            class="h-28 w-28 rounded-full bg-cover bg-center bg-gray-200 shadow dark:bg-gray-600 group-hover:brightness-90 transition"
            style={face.albumThumbnailAssetId
              ? `background-image:url('${getAssetMediaUrl({ id: face.albumThumbnailAssetId })}')`
              : ''}
          ></div>
          <span class="max-w-full truncate text-sm font-medium dark:text-immich-dark-fg">
            {displayName(face.albumName)}
          </span>
        </a>
      {/each}
    </div>
  {/if}
</UserPageLayout>
