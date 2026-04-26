<script lang="ts">
  import QRCode from '$lib/components/shared-components/qrcode.svelte';
  import { copyToClipboard } from '$lib/utils';
  import { Button, HStack, Input, LoadingSpinner, Modal, ModalBody } from '@immich/ui';
  import { mdiContentCopy, mdiQrcode } from '@mdi/js';
  import { onMount } from 'svelte';

  type Props = {
    onClose: () => void;
  };

  type MobileUploadLink = {
    url: string;
    host: string;
    port: number;
    backendMode: 'local' | 'remote';
    backendUrl: string;
    candidateUrls?: string[];
  };

  let { onClose }: Props = $props();

  let link = $state<MobileUploadLink | null>(null);
  let error = $state('');
  let loading = $state(true);
  let modalWidth = $state(0);

  const loadLink = async () => {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/lomo/mobile-upload-link');
      const data = (await response.json().catch(() => ({}))) as Partial<MobileUploadLink> & { message?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.message ?? `Failed to create QR link (${response.status})`);
      }
      link = data as MobileUploadLink;
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : String(error_);
    } finally {
      loading = false;
    }
  };

  onMount(() => {
    void loadLink();
  });
</script>

<Modal title="Upload from phone" icon={mdiQrcode} {onClose} size="small">
  <ModalBody>
    {#if loading}
      <div class="flex min-h-64 items-center justify-center">
        <LoadingSpinner />
      </div>
    {:else if error}
      <div class="flex flex-col gap-4">
        <div class="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div>
        <div class="flex justify-end">
          <Button size="small" onclick={loadLink}>Try again</Button>
        </div>
      </div>
    {:else if link}
      <div class="flex flex-col gap-4">
        <div class="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
          Backend: <strong class="capitalize">{link.backendMode}</strong>
          <div class="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{link.backendUrl}</div>
        </div>

        <div class="w-full px-8 py-2">
          <div bind:clientWidth={modalWidth} class="w-full">
            <QRCode value={link.url} width={modalWidth} alt="Mobile upload QR code" />
          </div>
        </div>

        <HStack class="w-full" gap={1}>
          <Input value={link.url} disabled class="flex flex-row" />
          <Button
            size="small"
            color="secondary"
            variant="ghost"
            leadingIcon={mdiContentCopy}
            onclick={() => copyToClipboard(link?.url ?? '')}
          >
            Copy
          </Button>
        </HStack>

        {#if (link.candidateUrls?.length ?? 0) > 1}
          <div class="rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
            <div class="mb-2 font-medium text-gray-700 dark:text-gray-200">Other network addresses</div>
            <div class="flex flex-col gap-2">
              {#each link.candidateUrls ?? [] as candidateUrl (candidateUrl)}
                {#if candidateUrl !== link.url}
                  <HStack class="w-full" gap={1}>
                    <Input value={candidateUrl} disabled class="flex flex-row" />
                    <Button
                      size="small"
                      color="secondary"
                      variant="ghost"
                      leadingIcon={mdiContentCopy}
                      onclick={() => copyToClipboard(candidateUrl)}
                    >
                      Copy
                    </Button>
                  </HStack>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </ModalBody>
</Modal>
