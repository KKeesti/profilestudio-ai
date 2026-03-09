import { PhotoStyle, AspectRatio } from "../types";

export class GeminiService {
  // localhost = локальная разработка, иное = продакшн-сервер в интернете
  private static API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

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
