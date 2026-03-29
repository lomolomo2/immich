<script lang="ts">
  type Variant = 'icon' | 'inline';
  type Size = 'tiny' | 'small' | 'medium' | 'large' | 'giant';

  interface Props {
    variant?: Variant;
    size?: Size;
    subtitle?: string;
    showSubtitle?: boolean;
    class?: string;
  }

  const sizeMap: Record<
    Size,
    {
      iconFrame: string;
      iconImage: string;
      title: string;
      subtitle: string;
      gap: string;
    }
  > = {
    tiny: {
      iconFrame: 'h-7 w-7 p-0.5',
      iconImage: 'h-5 w-5',
      title: 'text-sm',
      subtitle: 'text-[0.52rem]',
      gap: 'gap-1.5',
    },
    small: {
      iconFrame: 'h-9 w-9 p-0.75',
      iconImage: 'h-6 w-6',
      title: 'text-lg',
      subtitle: 'text-[0.58rem]',
      gap: 'gap-2',
    },
    medium: {
      iconFrame: 'h-10 w-10 p-0.75',
      iconImage: 'h-7 w-7',
      title: 'text-xl',
      subtitle: 'text-[0.62rem]',
      gap: 'gap-2.5',
    },
    large: {
      iconFrame: 'h-12 w-12 p-1',
      iconImage: 'h-9 w-9',
      title: 'text-2xl',
      subtitle: 'text-[0.72rem]',
      gap: 'gap-3',
    },
    giant: {
      iconFrame: 'h-18 w-18 p-1.5',
      iconImage: 'h-14 w-14',
      title: 'text-4xl',
      subtitle: 'text-[0.82rem]',
      gap: 'gap-4',
    },
  };

  let {
    variant = 'inline',
    size = 'medium',
    subtitle = 'based on immich',
    showSubtitle,
    class: className = '',
  }: Props = $props();

  const resolvedShowSubtitle = $derived(showSubtitle ?? (variant === 'inline' && size !== 'tiny'));
  const config = $derived(sizeMap[size]);
</script>

{#if variant === 'icon'}
  <div
    class={`inline-flex items-center justify-center rounded-[30%] bg-white/80 shadow-sm ring-1 ring-primary/10 dark:bg-black/10 dark:ring-white/10 ${config.iconFrame} ${className}`}
  >
    <img src="/lomorage-icon.png" alt="Lomorage logo" class={`rounded-[26%] ${config.iconImage}`} />
  </div>
{:else}
  <div class={`inline-flex items-center ${config.gap} ${className}`}>
    <div
      class={`inline-flex items-center justify-center rounded-[30%] bg-white/80 shadow-sm ring-1 ring-primary/10 dark:bg-black/10 dark:ring-white/10 ${config.iconFrame}`}
    >
      <img src="/lomorage-icon.png" alt="Lomorage logo" class={`rounded-[26%] ${config.iconImage}`} />
    </div>
    <div class="flex min-w-0 flex-col">
      <span class={`leading-none font-black tracking-[0.01em] text-primary ${config.title}`}>Lomorage</span>
      {#if resolvedShowSubtitle}
        <span class={`mt-1 leading-none uppercase tracking-[0.26em] text-gray-500 dark:text-gray-400 ${config.subtitle}`}>
          {subtitle}
        </span>
      {/if}
    </div>
  </div>
{/if}
