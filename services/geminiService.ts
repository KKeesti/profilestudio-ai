/// <reference types="vite/client" />
import { PhotoStyle, AspectRatio } from "../types";

export class GeminiService {
  // Если мы запускаем на локальном компьютере (DEV), стучимся на localhost:3001.
  // Если это развернуто в интернете (PROD), используем относительный путь /api.
  private static API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

  static async generateStudioPhoto(
    imageBase64: string,
    mimeType: string,
    style: PhotoStyle,
    aspectRatio: AspectRatio,
    customPrompt?: string
  ): Promise<string> {
    const response = await fetch(`${this.API_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        mimeType,
        style,
        aspectRatio,
        customPrompt
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Не удалось получить изображение от сервера.");
    }

    return data.image; // data:image/png;base64,...
  }

  static async refinePhoto(
    imageBase64: string,
    mimeType: string,
    correctionRequest: string,
    aspectRatio: AspectRatio
  ): Promise<string> {
    const response = await fetch(`${this.API_URL}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        mimeType,
        correctionRequest,
        aspectRatio
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Не удалось применить правки.");
    }

    return data.image; // data:image/png;base64,...
  }
}
