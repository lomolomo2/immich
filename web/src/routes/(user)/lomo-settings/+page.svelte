<script lang="ts">
  import { goto } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import { Route } from '$lib/route';
  import { clearClientSession } from '$lib/utils/auth';
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
  type BackendMode = 'local' | 'remote';
  type LomoSettingsResponse = {
    active_backend_mode?: BackendMode;
    photos_dir?: string;
    backend_mode?: BackendMode;
    remote_lomod_url?: string;
    local?: {
      photos_dir?: string;
      setup_completed?: boolean;
    };
    remote?: {
      default_url?: string;
    };
  };

  const { data }: Props = $props();

  let photosDir = $state('');
  let originalPhotosDir = $state('');
  let backendMode = $state<BackendMode>('local');
  let originalBackendMode = $state<BackendMode>('local');
  let remoteLomodUrl = $state('');
  let originalRemoteLomodUrl = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let isDesktop = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  const activeBackendLabel = $derived(backendMode === 'local' ? 'Bundled Local' : 'Remote Server');

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

  const setCurrentSettings = (value: LomoSettingsResponse) => {
    const nextPhotosDir = value.local?.photos_dir ?? value.photos_dir ?? '';
    const nextBackendMode = value.active_backend_mode ?? value.backend_mode ?? 'local';
    const nextRemoteLomodUrl = value.remote?.default_url ?? value.remote_lomod_url ?? '';

    photosDir = nextPhotosDir;
    originalPhotosDir = nextPhotosDir;
    backendMode = nextBackendMode;
    originalBackendMode = nextBackendMode;
    remoteLomodUrl = nextRemoteLomodUrl;
    originalRemoteLomodUrl = nextRemoteLomodUrl;
  };

  const loadSettings = async () => {
    const invoke = getTauriInvoke();
    isDesktop = !!invoke;

    if (invoke) {
      const data = await invoke('get_app_settings');
      setCurrentSettings(data as LomoSettingsResponse);
      return;
    }

    const response = await fetch('/api/lomo/settings');
    if (!response.ok) {
      throw new Error(`Failed to load settings (${response.status})`);
    }

    const data = (await response.json()) as LomoSettingsResponse;
    setCurrentSettings(data);
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
    backendMode = originalBackendMode;
    remoteLomodUrl = originalRemoteLomodUrl;
    errorMessage = '';
    successMessage = '';
  };

  const saveSettings = async () => {
    const nextDir = photosDir.trim();
    const nextRemoteUrl = remoteLomodUrl.trim();
    const hasChanges =
      nextDir !== originalPhotosDir ||
      backendMode !== originalBackendMode ||
      nextRemoteUrl !== originalRemoteLomodUrl;
    if (!hasChanges) {
      return;
    }

    saving = true;
    errorMessage = '';
    successMessage = '';

    try {
      const invoke = getTauriInvoke();
      if (invoke) {
        await invoke('save_app_settings', {
          photosDir: nextDir,
          backendMode,
          remoteLomodUrl: nextRemoteUrl,
        });
        await clearClientSession();
        await goto(Route.login(), { invalidateAll: true });
        return;
      }

      const response = await fetch('/api/lomo/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          photos_dir: nextDir,
          backend_mode: backendMode,
          remote_lomod_url: nextRemoteUrl,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? `Failed to save settings (${response.status})`);
      }

      setCurrentSettings({
        photos_dir: nextDir,
        backend_mode: backendMode,
        remote_lomod_url: nextRemoteUrl,
      });
      successMessage =
        backendMode === 'local'
          ? 'Settings saved. Restart the app to apply the local backend configuration.'
          : 'Settings saved. Restart the app to use the remote Lomo server by default.';
    } catch (error) {
      errorMessage = `Failed to save settings: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saving = false;
    }
  };

  const hasChanges = $derived(
    photosDir.trim() !== originalPhotosDir ||
      backendMode !== originalBackendMode ||
      remoteLomodUrl.trim() !== originalRemoteLomodUrl,
  );
  const canSave = $derived(
    !saving &&
      hasChanges &&
      ((backendMode === 'local' && Boolean(photosDir.trim())) ||
        (backendMode === 'remote' && Boolean(remoteLomodUrl.trim()))),
  );
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
        Changing backend mode does not migrate data. Local folder updates also do not move existing photos automatically.
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
              <div class="text-sm font-medium text-primary">Backend Mode</div>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Use the bundled local <code>lomod</code> managed by the desktop app, or point the app at a remote
                Lomo server.
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                The local storage folder and the remote server URL are saved independently. Switching modes will make
                the app sign in again against the selected backend.
              </p>
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class={`rounded-2xl border px-4 py-3 text-left transition ${
                    backendMode === 'local'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 bg-white text-primary dark:border-gray-700 dark:bg-neutral-950'
                  }`}
                  onclick={() => (backendMode = 'local')}
                  disabled={saving}
                >
                  <div class="font-medium">Bundled Local</div>
                  <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">Runs the packaged <code>lomod</code> on <code>localhost:8000</code>.</div>
                </button>
                <button
                  type="button"
                  class={`rounded-2xl border px-4 py-3 text-left transition ${
                    backendMode === 'remote'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 bg-white text-primary dark:border-gray-700 dark:bg-neutral-950'
                  }`}
                  onclick={() => (backendMode = 'remote')}
                  disabled={saving}
                >
                  <div class="font-medium">Remote Server</div>
                  <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">Keeps the desktop app from depending on a local setup flow.</div>
                </button>
              </div>
            </div>

            <Alert color="info" class="text-dark">
              Active backend: <strong>{activeBackendLabel}</strong>. The two sections below are saved separately, then the selected backend mode decides which one is used after sign-in.
            </Alert>

            <section
              class={`rounded-2xl border p-4 ${
                backendMode === 'local'
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-gray-200 bg-white/70 dark:border-gray-700 dark:bg-neutral-950'
              }`}
            >
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between gap-3">
                  <label class="text-sm font-medium text-primary" for="photos-dir">Local Backend Configuration</label>
                  <span class="rounded-full bg-black/5 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-300">
                    {backendMode === 'local' ? 'Active' : 'Saved separately'}
                  </span>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  This folder becomes the Lomo storage root. The default admin library will live under
                  <code class="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">{effectiveAdminPath}</code>.
                </p>
              </div>

              <div class="mt-3 flex gap-2 max-sm:flex-col">
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

              <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Saving this value does not switch you to local mode automatically. It only updates the local backend configuration.
              </p>
            </section>

            <section
              class={`rounded-2xl border p-4 ${
                backendMode === 'remote'
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-gray-200 bg-white/70 dark:border-gray-700 dark:bg-neutral-950'
              }`}
            >
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between gap-3">
                  <label class="text-sm font-medium text-primary" for="remote-lomod-url">Remote Backend Configuration</label>
                  <span class="rounded-full bg-black/5 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-300">
                    {backendMode === 'remote' ? 'Active' : 'Saved separately'}
                  </span>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Enter the base URL for the remote server, for example <code>http://192.168.1.73:8000</code>.
                </p>
              </div>

              <input
                id="remote-lomod-url"
                class="immich-form-input mt-3 w-full"
                type="text"
                bind:value={remoteLomodUrl}
                placeholder="http://192.168.1.73:8000"
                disabled={saving}
              />

              <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Saving this value does not switch you to remote mode automatically. It only updates the remembered remote backend URL.
              </p>
            </section>

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
              <Button onclick={resetChanges} disabled={saving || !hasChanges} color="secondary" variant="ghost">
                Reset
              </Button>
              <Button onclick={saveSettings} disabled={!canSave}>
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        {/if}
      </section>
    </div>
  </Container>
</UserPageLayout>
