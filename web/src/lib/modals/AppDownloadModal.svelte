<script lang="ts">
  import { BasicModal } from '@immich/ui';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();
</script>

<BasicModal title="Mobile App" size="tiny" {onClose}>
  <p class="text-sm">Mobile app download links are not configured for this build.</p>
</BasicModal>
