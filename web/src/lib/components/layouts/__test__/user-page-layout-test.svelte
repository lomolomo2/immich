<script lang="ts">
  import UserPageLayout from '../user-page-layout.svelte';

  type ScrollMode = 'layout' | 'child';

  interface Props {
    scrollMode?: ScrollMode;
  }

  let { scrollMode = 'layout' }: Props = $props();
</script>

<UserPageLayout hideNavbar title="Favorites" {scrollMode}>
  {#snippet sidebar()}
    <div data-testid="sidebar-stub">Sidebar</div>
  {/snippet}

  <div data-testid="content-stub">Content</div>
</UserPageLayout>
