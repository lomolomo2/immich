import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { DateTime } from 'luxon';
import AssetChangeDateModal from './AssetChangeDateModal.svelte';

describe('AssetChangeDateModal', () => {
  const asset = timelineAssetFactory.build({ id: 'asset-1' });
  const onClose = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    Element.prototype.animate = getAnimateMock();
  });

  it('updates the asset date and emits the refreshed asset', async () => {
    const updatedAsset = {
      id: asset.id,
      localDateTime: '2026-06-07T00:00:00.000Z',
    };
    sdkMock.getAssetInfo.mockResolvedValue(updatedAsset as never);
    const emitSpy = vi.spyOn(eventManager, 'emit');

    render(AssetChangeDateModal, {
      props: {
        asset,
        initialDate: DateTime.fromISO('2024-01-15T18:30:00Z'),
        onClose,
      },
    });

    const dateInput = screen.getByLabelText('date') as HTMLInputElement;
    expect(dateInput.value).toBe('2024-01-15');

    await fireEvent.input(dateInput, { target: { value: '2026-06-07' } });
    await fireEvent.blur(dateInput);
    await fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(sdkMock.updateAsset).toHaveBeenCalledWith({
      id: asset.id,
      updateAssetDto: { dateTimeOriginal: '2026-06-07' },
    });
    expect(sdkMock.getAssetInfo).toHaveBeenCalledWith({ id: asset.id });
    expect(emitSpy).toHaveBeenCalledWith('AssetUpdate', updatedAsset);
    expect(onClose).toHaveBeenCalledWith(true);
  });
});
