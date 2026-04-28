<script lang="ts">
  import { Modal, ModalBody } from '@immich/ui';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();
</script>

<Modal title="Lomo Support" {onClose} size="small">
  <ModalBody>
    <p>Support resources are not configured for this build.</p>
  </ModalBody>
</Modal>
