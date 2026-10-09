<script lang="ts">
  import { page } from '$app/state';
  import UploadCover from '$lib/components/shared-components/drag-and-drop-upload-overlay.svelte';
  import FirstRunSuccessModal from '$lib/modals/FirstRunSuccessModal.svelte';

  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import { modalManager } from '@immich/ui';
  import { onMount, type Snippet } from 'svelte';
  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();
  let { isViewing: showAssetViewer, setAsset, gridScrollTarget } = assetViewingStore;

  // Show the first-run "You're all set!" guide once after local setup completes.
  // The flag is set by the login setup flow; the modal persists the user's
  // "show next time" choice back into the same key.
  onMount(() => {
    try {
      if (localStorage.getItem('lomo_show_setup_guide') === '1') {
        void modalManager.show(FirstRunSuccessModal, {});
      }
    } catch {
      // localStorage may be unavailable; skip the guide rather than break the viewer.
    }
  });

  // $page.data.asset is loaded by route specific +page.ts loaders if that
  // route contains the assetId path.
  $effect.pre(() => {
    if (page.data.asset) {
      setAsset(page.data.asset);
    } else {
      $showAssetViewer = false;
    }
    const asset = page.url.searchParams.get('at');
    $gridScrollTarget = { at: asset };
  });
</script>

<div class:display-none={$showAssetViewer}>
  {@render children?.()}
</div>
<UploadCover />

<style>
  :root {
    overscroll-behavior: none;
  }
  .display-none {
    display: none;
  }
</style>
