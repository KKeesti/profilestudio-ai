
export interface ProcessingState {
  isProcessing: boolean;
  status: string;
}

export enum AppStep {
  LANGUAGE_SELECT = 'LANGUAGE_SELECT',
  UPLOAD = 'UPLOAD',
  CHOOSE_STYLE = 'CHOOSE_STYLE',
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
  CLASSIC_STUDIO = 'CLASSIC_STUDIO',
  FASHION_EDITORIAL = 'FASHION_EDITORIAL',
  BUSINESS_LUXE = 'BUSINESS_LUXE'
}

export type AspectRatio = '9:16' | '16:9';
