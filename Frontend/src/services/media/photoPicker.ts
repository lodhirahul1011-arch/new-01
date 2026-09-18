import {Platform} from 'react-native';
import {
  launchImageLibrary,
  type Asset,
  type ImageLibraryOptions,
} from 'react-native-image-picker';
import {logs} from '../logs';

type PickSinglePhotoOptions = Omit<
  ImageLibraryOptions,
  'includeBase64' | 'mediaType' | 'selectionLimit'
> & {
  source: string;
};

type PickSinglePhotoResult =
  | {
      status: 'picked';
      asset: Asset;
    }
  | {
      status: 'cancelled';
    }
  | {
      status: 'error';
      message: string;
    };

export async function pickSinglePhotoFromDevice(
  options: PickSinglePhotoOptions,
): Promise<PickSinglePhotoResult> {
  const {source, ...pickerOptions} = options;

  try {
    logs.info('[photo-picker] opening single photo picker', {
      source,
      platform: Platform.OS,
    });

    const result = await launchImageLibrary({
      ...pickerOptions,
      mediaType: 'photo',
      selectionLimit: 1,
      includeBase64: false,
    });

    if (result.didCancel) {
      logs.info('[photo-picker] user cancelled picker', {source});
      return {status: 'cancelled'};
    }

    if (result.errorCode) {
      const message = result.errorMessage || result.errorCode;
      logs.error('[photo-picker] picker returned an error', {
        source,
        message,
      });
      return {status: 'error', message};
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      logs.error('[photo-picker] picker returned no usable asset', {source});
      return {
        status: 'error',
        message: 'Could not select image. Please try again.',
      };
    }

    logs.info('[photo-picker] selected photo from picker', {
      source,
      fileName: asset.fileName,
      type: asset.type,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
    });
    return {status: 'picked', asset};
  } catch (error) {
    logs.error('[photo-picker] failed to open picker', {
      source,
      error,
    });
    return {
      status: 'error',
      message: 'Could not open gallery.',
    };
  }
}
