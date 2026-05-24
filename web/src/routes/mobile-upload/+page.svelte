<script lang="ts">
  import { onMount } from 'svelte';

  type UploadState = 'queued' | 'uploading' | 'uploaded' | 'duplicate' | 'error';

  const MOBILE_DEVICE_ID_STORAGE_KEY = 'lomo_mobile_upload_device_id';

  type UploadItem = {
    id: string;
    file: File;
    progress: number;
    state: UploadState;
    message: string;
  };

  let username = $state('');
  let password = $state('');
  let signedIn = $state(false);
  let signingIn = $state(false);
  let loginError = $state('');
  let uploadItems = $state<UploadItem[]>([]);
  let isUploading = $state(false);
  let uploadError = $state('');
  let configuredServerUrl = $state('');

  const canSignIn = $derived(Boolean(username.trim()) && Boolean(password.trim()) && !signingIn);
  const canUpload = $derived(signedIn && uploadItems.some((item) => item.state === 'queued' || item.state === 'error') && !isUploading);

  const makeId = () => {
    if (crypto?.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const getMobileDeviceId = () => {
    const stored = globalThis.localStorage?.getItem(MOBILE_DEVICE_ID_STORAGE_KEY);
    if (stored) {
      return stored;
    }

    const deviceId = `lomo-mobile-upload-${makeId()}`;
    globalThis.localStorage?.setItem(MOBILE_DEVICE_ID_STORAGE_KEY, deviceId);
    return deviceId;
  };

  const signIn = async () => {
    if (!canSignIn) {
      return;
    }

    signingIn = true;
    loginError = '';
    try {
      const deviceId = getMobileDeviceId();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Lomo-Device': deviceId };
      if (configuredServerUrl) {
        headers['X-Lomo-Server'] = configuredServerUrl;
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: username.trim(), password, deviceId }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'Sign in failed');
      }

      signedIn = true;
      password = '';
    } catch (error) {
      loginError = error instanceof Error ? error.message : String(error);
    } finally {
      signingIn = false;
    }
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const nextItems = Array.from(files).map((file) => ({
      id: makeId(),
      file,
      progress: 0,
      state: 'queued' as UploadState,
      message: 'Ready',
    }));

    uploadItems = [...uploadItems, ...nextItems];
    uploadError = '';
  };

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    uploadItems = uploadItems.map((item) => (item.id === id ? { ...item, ...patch } : item));
  };

  const uploadOne = (item: UploadItem) => {
    return new Promise<void>((resolve) => {
      const formData = new FormData();
      const modifiedAt = new Date(item.file.lastModified || Date.now()).toISOString();
      const deviceId = getMobileDeviceId();

      formData.append('deviceAssetId', item.id);
      formData.append('deviceId', deviceId);
      formData.append('fileCreatedAt', modifiedAt);
      formData.append('fileModifiedAt', modifiedAt);
      formData.append('isFavorite', 'false');
      formData.append('duration', '0:00:00.000000');
      formData.append('assetData', item.file, item.file.name);

      const xhr = new XMLHttpRequest();
      xhr.responseType = 'json';
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          updateItem(item.id, { progress: Math.round((event.loaded / event.total) * 100), message: 'Uploading' });
        }
      });
      xhr.addEventListener('load', () => {
        const response = xhr.response as { status?: string; message?: string } | null;
        if (xhr.status === 200 || xhr.status === 201) {
          updateItem(item.id, {
            progress: 100,
            state: response?.status === 'duplicate' ? 'duplicate' : 'uploaded',
            message: response?.status === 'duplicate' ? 'Already uploaded' : 'Uploaded',
          });
        } else {
          updateItem(item.id, {
            state: 'error',
            message: response?.message ?? `Upload failed (${xhr.status})`,
          });
        }
        resolve();
      });
      xhr.addEventListener('error', () => {
        updateItem(item.id, { state: 'error', message: 'Network error' });
        resolve();
      });

      updateItem(item.id, { state: 'uploading', progress: 0, message: 'Uploading' });
      xhr.open('POST', '/api/assets');
      xhr.send(formData);
    });
  };

  const uploadAll = async () => {
    const queue = uploadItems.filter((item) => item.state === 'queued' || item.state === 'error');
    if (queue.length === 0) {
      return;
    }

    isUploading = true;
    uploadError = '';
    try {
      for (const item of queue) {
        await uploadOne(item);
      }
    } catch (error) {
      uploadError = error instanceof Error ? error.message : String(error);
    } finally {
      isUploading = false;
    }
  };

  onMount(() => {
    const server = new URL(globalThis.location.href).searchParams.get('server');
    configuredServerUrl = server?.trim() ?? '';
  });
</script>

<svelte:head>
  <title>Mobile Upload - lomorage</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<main class="min-h-screen bg-[#f7f7f4] text-[#172033]">
  <div class="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 py-8">
    <header class="mb-8">
      <div class="text-sm font-semibold uppercase tracking-wider text-[#59718a]">lomorage</div>
      <h1 class="mt-2 text-3xl font-semibold">Mobile Upload</h1>
      {#if configuredServerUrl}
        <div class="mt-3 break-all text-sm text-[#59718a]">Backend: {configuredServerUrl}</div>
      {/if}
    </header>

    {#if !signedIn}
      <form
        class="rounded-2xl border border-[#d9ddd5] bg-white p-5 shadow-sm"
        onsubmit={(event) => {
          event.preventDefault();
          void signIn();
        }}
      >
        <div class="flex flex-col gap-4">
          <label class="flex flex-col gap-2 text-sm font-medium">
            Username
            <input
              class="rounded-xl border border-[#cfd6dd] px-4 py-3 text-base outline-none focus:border-[#2f80ed]"
              bind:value={username}
              autocomplete="username"
              inputmode="email"
            />
          </label>

          <label class="flex flex-col gap-2 text-sm font-medium">
            Password
            <input
              class="rounded-xl border border-[#cfd6dd] px-4 py-3 text-base outline-none focus:border-[#2f80ed]"
              bind:value={password}
              type="password"
              autocomplete="current-password"
            />
          </label>

          {#if loginError}
            <div class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{loginError}</div>
          {/if}

          <button
            class="rounded-full bg-[#183153] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={!canSignIn}
          >
            {signingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </form>
    {:else}
      <section class="rounded-2xl border border-[#d9ddd5] bg-white p-5 shadow-sm">
        <div class="flex flex-col gap-4">
          <label class="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#9fb4c8] bg-[#f4f8fb] px-4 py-8 text-center">
            <span class="text-base font-semibold">Select photos or videos</span>
            <span class="mt-1 text-sm text-[#59718a]">You can choose multiple files.</span>
            <input
              class="sr-only"
              type="file"
              accept="image/*,video/*"
              multiple
              onchange={(event) => addFiles(event.currentTarget.files)}
            />
          </label>

          {#if uploadItems.length > 0}
            <div class="flex flex-col gap-3">
              {#each uploadItems as item (item.id)}
                <div class="rounded-xl border border-[#e3e6df] p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">{item.file.name}</div>
                      <div class="mt-1 text-xs text-[#59718a]">{(item.file.size / (1024 * 1024)).toFixed(1)} MB · {item.message}</div>
                    </div>
                    <div class="shrink-0 text-xs font-semibold uppercase text-[#59718a]">{item.state}</div>
                  </div>
                  <div class="mt-3 h-2 overflow-hidden rounded-full bg-[#e8ecef]">
                    <div class="h-full rounded-full bg-[#2f80ed]" style={`width: ${item.progress}%`}></div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if uploadError}
            <div class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{uploadError}</div>
          {/if}

          <button
            class="rounded-full bg-[#183153] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={!canUpload}
            onclick={uploadAll}
          >
            {isUploading ? 'Uploading...' : 'Upload selected files'}
          </button>
        </div>
      </section>
    {/if}
  </div>
</main>
