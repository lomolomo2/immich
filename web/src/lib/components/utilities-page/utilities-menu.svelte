<script lang="ts">
  import { Route } from '$lib/route';
  import { Icon, Text } from '@immich/ui';
  import { mdiCrosshairsGps, mdiImageSizeSelectLarge } from '@mdi/js';
  import { t } from 'svelte-i18n';

  const links = [
    { href: Route.largeFileUtility(), icon: mdiImageSizeSelectLarge, label: $t('review_large_files') },
    { href: Route.geolocationUtility(), icon: mdiCrosshairsGps, label: $t('manage_geolocation') },
    // { href: Route.workflows(), icon: mdiStateMachine, label: $t('workflows') },
  ];
</script>

<div class="border border-gray-300 dark:border-immich-dark-gray rounded-3xl pt-1 pb-6 dark:text-white">
  <Text size="tiny" color="muted" fontWeight="medium" class="p-4">{$t('organize_your_library')}</Text>

  {#each links as link (link.href)}
    <a href={link.href} class="w-full hover:bg-gray-100 dark:hover:bg-immich-dark-gray flex items-center gap-4 p-4">
      <span><Icon icon={link.icon} class="text-primary" size="24" /> </span>
      {link.label}
    </a>
  {/each}
</div>
