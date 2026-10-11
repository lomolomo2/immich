<script lang="ts">
  import { LoadingSpinner } from '@immich/ui';
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { tweened } from 'svelte/motion';

  let showing = $state(false);
  let showingSpinner = $state(false);

  // delay showing any progress for a little bit so very fast loads
  // do not cause flicker
  const delay = 100;
  // A slow page load (e.g. opening an album, whose info the proxy fetches from lomod) also
  // gets a spinner, since the thin bar alone is easy to miss and the page looks stuck
  const spinnerDelay = 300;

  const progress = tweened(0, {
    duration: 1000,
    easing: cubicOut,
  });

  function animate() {
    showing = true;
    void progress.set(90);
  }

  onMount(() => {
    const timer = setTimeout(animate, delay);
    const spinnerTimer = setTimeout(() => (showingSpinner = true), spinnerDelay);
    return () => {
      clearTimeout(timer);
      clearTimeout(spinnerTimer);
    };
  });
</script>

{#if showing}
  <div class="absolute start-0 top-0 h-[3px] w-dvw bg-white">
    <span class="absolute h-[3px] bg-immich-primary" style:width={`${$progress}%`}></span>
  </div>
{/if}

{#if showingSpinner}
  <div
    class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
    aria-live="polite"
    data-testid="navigation-loading-spinner"
  >
    <div class="rounded-full bg-white/80 p-5 shadow-lg backdrop-blur-sm dark:bg-black/50">
      <LoadingSpinner size="giant" />
    </div>
  </div>
{/if}
