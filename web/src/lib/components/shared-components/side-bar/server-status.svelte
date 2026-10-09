<script lang="ts">
  import { websocketStore } from '$lib/stores/websocket';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  const { connected } = websocketStore;

  let lomodVersion: string | undefined = $state();

  const loadLomodVersion = async () => {
    const response = await fetch('/api/lomo/version');
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { version?: string };
    lomodVersion = data.version?.trim() || undefined;
  };

  onMount(() => {
    void loadLomodVersion().catch((error) => console.error('Failed to load lomod version', error));
  });
  let lomodVersionLabel = $derived.by(() => {
    if (!lomodVersion) {
      return null;
    }

    const revision = lomodVersion.split('.').at(-1);
    return `lomod ${revision && /^[\da-f]{7,40}$/i.test(revision) ? revision.slice(0, 7) : lomodVersion}`;
  });
</script>

<div
  class="text-sm flex md:flex ps-5 pe-1 place-items-center place-content-center justify-between min-w-52 overflow-hidden dark:text-immich-dark-fg"
>
  {#if $connected}
    <div class="flex gap-2 place-items-center place-content-center">
      <div class="w-1.75 h-1.75 bg-green-500 rounded-full"></div>
      <p class="dark:text-immich-gray">{$t('server_online')}</p>
    </div>
  {:else}
    <div class="flex gap-2 place-items-center place-content-center">
      <div class="w-1.75 h-1.75 bg-red-500 rounded-full"></div>
      <p class="text-red-500">{$t('server_offline')}</p>
    </div>
  {/if}

  <div class="flex justify-between justify-items-center">
    {#if $connected && lomodVersionLabel}
      <span title={lomodVersion} class="dark:text-immich-gray">
        {lomodVersionLabel}
      </span>
    {:else}
      <p class="text-red-500">{$t('unknown')}</p>
    {/if}
  </div>
</div>
