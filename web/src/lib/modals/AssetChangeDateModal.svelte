<script lang="ts">
  import DateInput from '$lib/elements/DateInput.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { getAssetInfo, updateAsset } from '@immich/sdk';
  import { FormModal, Label } from '@immich/ui';
  import { mdiCalendarEdit } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';

  interface Props {
    initialDate?: DateTime;
    asset: TimelineAsset;
    onClose: (success: boolean) => void;
  }

  let { initialDate = DateTime.now(), asset, onClose }: Props = $props();
  // svelte-ignore state_referenced_locally
  let selectedDate = $state(initialDate.toISODate() ?? '');
  let date = $derived(DateTime.fromISO(selectedDate, { zone: 'utc' }));

  const onSubmit = async () => {
    if (!date.isValid) {
      onClose(false);
      return;
    }

    try {
      await updateAsset({
        id: asset.id,
        updateAssetDto: { dateTimeOriginal: selectedDate },
      });
      const updatedAsset = await getAssetInfo({ id: asset.id });
      eventManager.emit('AssetUpdate', updatedAsset);
      onClose(true);
    } catch (error) {
      handleError(error, $t('errors.unable_to_change_date'));
      onClose(false);
    }
  };
</script>

<FormModal
  title={$t('edit_date')}
  icon={mdiCalendarEdit}
  onClose={() => onClose(false)}
  {onSubmit}
  submitText={$t('confirm')}
  disabled={!date.isValid}
  size="small"
>
  <Label for="asset-date" class="block mb-1">{$t('date')}</Label>
  <DateInput class="immich-form-input w-full" id="asset-date" type="date" bind:value={selectedDate} />
</FormModal>
