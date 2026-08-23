
export interface ProcessingState {
  isProcessing: boolean;
  status: string;
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  RESULT = 'RESULT',
  HISTORY = 'HISTORY'
}

export enum Language {
  EN = 'en',
  ET = 'et',
  RU = 'ru',
  LV = 'lv',
  LT = 'lt',
  FI = 'fi'
}

export enum PhotoStyle {
  RESTORE_OLD_PHOTO = 'RESTORE_OLD_PHOTO'
}

export type AspectRatio = '9:16' | '16:9';
