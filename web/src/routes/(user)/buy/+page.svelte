<script lang="ts">
  import { goto } from '$app/navigation';
  import { Route } from '$lib/route';

  goto(Route.photos(), { replaceState: true });
</script>
