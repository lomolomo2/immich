<script lang="ts">
  import MobileUploadQrModal from '$lib/modals/MobileUploadQrModal.svelte';
  import { Button, modalManager } from '@immich/ui';
  import { mdiCellphoneArrowDownVariant, mdiQrcode } from '@mdi/js';
  import { fade } from 'svelte/transition';
</script>

<section class="my-4">
  <div in:fade={{ duration: 500 }}>
    <div class="sm:ms-8 flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2 text-sm font-medium text-immich-primary dark:text-immich-dark-primary">
          <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
            <path fill="currentColor" d={mdiCellphoneArrowDownVariant} />
          </svg>
          <span>Upload from phone</span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Scan a QR code on your phone, sign in to the current Lomo backend, and upload photos or videos.
        </p>
      </div>

      <div class="flex justify-end">
        <Button
          shape="round"
          size="small"
          leadingIcon={mdiQrcode}
          onclick={() => modalManager.show(MobileUploadQrModal, {})}
        >
          QR Upload
        </Button>
      </div>
    </div>
  </div>
</section>
