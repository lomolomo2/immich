<script lang="ts">
  import { onMount } from 'svelte';
  import ServerStatus from './server-status.svelte';
  import StorageSpace from './storage-space.svelte';

  type TauriGlobals = {
    __TAURI__?: {
      app?: {
        getVersion?: () => Promise<string>;
      };
    };
  };

  let appVersion: string | undefined = $state();

  onMount(async () => {
    const getVersion = (globalThis as TauriGlobals).__TAURI__?.app?.getVersion;
    if (typeof getVersion !== 'function') {
      return;
    }

    try {
      appVersion = await getVersion();
    } catch (error) {
      console.error('Failed to load app version', error);
    }
  });
</script>

<div class="mt-auto">
  <StorageSpace />
</div>

<div class="mt-2">
  <ServerStatus />
</div>

{#if appVersion}
  <div class="mb-6 mt-1 ps-5 text-xs text-gray-500 dark:text-immich-gray">App v{appVersion}</div>
{:else}
  <div class="mb-6"></div>
{/if}
