<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import { Alert, Button, Container, LoadingSpinner } from '@immich/ui';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<any>;
  type TauriGlobals = {
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke;
      };
    };
    __TAURI_INTERNALS__?: {
      invoke?: TauriInvoke;
    };
  };
  type LomoSettingsResponse = {
    photos_dir?: string;
  };

  const { data }: Props = $props();

  let photosDir = $state('');
  let originalPhotosDir = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let isDesktop = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');

  const getTauriInvoke = (): TauriInvoke | null => {
    const globals = globalThis as TauriGlobals;
    const globalInvoke = globals.__TAURI__?.core?.invoke;
    if (typeof globalInvoke === 'function') {
      return globalInvoke;
    }

    const internalInvoke = globals.__TAURI_INTERNALS__?.invoke;
    if (typeof internalInvoke === 'function') {
      return internalInvoke;
    }

    return null;
  };

  const setCurrentDir = (value: string) => {
    photosDir = value;
    originalPhotosDir = value;
  };

  const loadSettings = async () => {
    const invoke = getTauriInvoke();
    isDesktop = !!invoke;

    if (invoke) {
      const data = await invoke('get_app_settings');
      setCurrentDir(data?.photos_dir ?? '');
      return;
    }

    const response = await fetch('/api/lomo/settings');
    if (!response.ok) {
      throw new Error(`Failed to load settings (${response.status})`);
    }

    const data = (await response.json()) as LomoSettingsResponse;
    setCurrentDir(data.photos_dir ?? '');
  };

  const browseForFolder = async () => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      return;
    }

    errorMessage = '';
    successMessage = '';

    const selected = (await invoke('pick_folder')) as string | null;
    if (selected) {
      photosDir = selected;
    }
  };

  const resetChanges = () => {
    photosDir = originalPhotosDir;
    errorMessage = '';
    successMessage = '';
  };

  const saveSettings = async () => {
    const nextDir = photosDir.trim();
    if (!nextDir || nextDir === originalPhotosDir) {
      return;
    }

    saving = true;
    errorMessage = '';
    successMessage = '';

    try {
      const invoke = getTauriInvoke();
      if (invoke) {
        await invoke('save_app_settings', { photosDir: nextDir });
        setCurrentDir(nextDir);
        successMessage = 'Settings saved. Lomo backend restarted with the new storage folder.';
        return;
      }

      const response = await fetch('/api/lomo/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ photos_dir: nextDir }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? `Failed to save settings (${response.status})`);
      }

      setCurrentDir(nextDir);
      successMessage = 'Settings saved. Restart the app to apply the new storage folder.';
    } catch (error) {
      errorMessage = `Failed to save settings: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saving = false;
    }
  };

  const canSave = $derived(Boolean(photosDir.trim()) && photosDir.trim() !== originalPhotosDir && !saving);
  const effectiveAdminPath = $derived(photosDir.trim() ? `${photosDir.trim()}/admin` : '<selected-folder>/admin');

  onMount(() => {
    loadSettings()
      .catch((error) => {
        errorMessage = `Failed to load settings: ${error instanceof Error ? error.message : String(error)}`;
      })
      .finally(() => {
        loading = false;
      });
  });
</script>

<UserPageLayout title={data.meta.title}>
  <Container size="small" center>
    <div class="mt-4 flex flex-col gap-4">
      <Alert color="warning" class="text-dark">
        Changing this folder does not move existing photos. New writes will use the selected folder after save.
      </Alert>

      {#if !loading && !isDesktop}
        <Alert color="info" class="text-dark">
          Running without Tauri. Browse is unavailable, but you can type a folder path manually.
        </Alert>
      {/if}

      <section class="rounded-3xl bg-subtle p-6 text-primary">
        {#if loading}
          <div class="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        {:else}
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-primary" for="photos-dir">Photos Storage Directory</label>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                This folder becomes the Lomo storage root. The default admin library will live under
                <code class="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">{effectiveAdminPath}</code>.
              </p>
            </div>

            <div class="flex gap-2 max-sm:flex-col">
              <input
                id="photos-dir"
                class="immich-form-input w-full"
                type="text"
                bind:value={photosDir}
                placeholder="Select a folder for photo storage"
                disabled={saving}
              />
              <Button onclick={browseForFolder} disabled={!isDesktop || saving} color="secondary" variant="ghost">
                Browse
              </Button>
            </div>

            <p class="text-sm text-gray-500 dark:text-gray-400">
              The Lomo backend API uses the selected folder as its effective <code>--mount-dir</code>, while user homes
              are created under that root.
            </p>

            {#if errorMessage}
              <Alert color="danger" class="text-dark">
                {errorMessage}
              </Alert>
            {/if}

            {#if successMessage}
              <Alert color="success" class="text-dark">
                {successMessage}
              </Alert>
            {/if}

            <div class="flex justify-end gap-2">
              <Button onclick={resetChanges} disabled={saving || photosDir === originalPhotosDir} color="secondary" variant="ghost">
                Reset
              </Button>
              <Button onclick={saveSettings} disabled={!canSave}>
                {saving ? 'Saving...' : isDesktop ? 'Save & Restart' : 'Save'}
              </Button>
            </div>
          </div>
        {/if}
      </section>
    </div>
  </Container>
</UserPageLayout>
