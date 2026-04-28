<script lang="ts">
  import { Modal, ModalBody, Text } from '@immich/ui';

  type Props = {
    onClose: () => void;
  };

  let { onClose }: Props = $props();
</script>

<Modal title="Mobile App" size="medium" {onClose}>
  <ModalBody>
    <Text color="muted" size="small">Mobile app update links are not configured for this build.</Text>
  </ModalBody>
</Modal>
