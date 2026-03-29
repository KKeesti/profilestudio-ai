import { PhotoStyle } from '../types';

export class GeminiService {
  static API_URL = '/api';

  private static async handleResponse(response: Response) {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'API Request failed');
    }
    return response.json();
  }

  // Порядок аргументов теперь совпадает с вызовом в App.tsx
  static async generateStudioPhoto(
    image: string,
    mimeType: string,
    style: PhotoStyle,
    aspectRatio: string,
    prompt: string = '',
    email: string | null = null
  ): Promise<string> {
    const response = await fetch(`${this.API_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mimeType, style, aspectRatio, prompt, email }),
    });

    const data = await this.handleResponse(response);
    return data.imageUrl; // Возвращаем только URL строку
  }

  static async refinePhoto(
    image: string,
    prompt: string,
    email: string | null = null
  ): Promise<string> {
    const response = await fetch(`${this.API_URL}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, prompt, email }),
    });

    const data = await this.handleResponse(response);
    return data.imageUrl;
  }

  static async checkUser(email: string): Promise<{ 
    credits: number; 
    paid_credits: number;
    free_generations_used: number;
    email: string;
  }> {
    const response = await fetch(`${this.API_URL}/user/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await this.handleResponse(response);
    return { ...data, email }; // Гарантируем наличие email для App.tsx
  }

  static async getHistory(email: string): Promise<Array<{
    id: string;
    created_at: string;
    style_name: string;
    aspect_ratio: string;
    generated_image_url: string;
  }>> {
    const response = await fetch(`${this.API_URL}/history?email=${encodeURIComponent(email)}`);
    const data = await this.handleResponse(response);
    return data.generations || [];
  }

  // Новый метод для обработки оплаты
  static async createCheckoutSession(email: string, planId: string, credits: number): Promise<{ url: string }> {
    const response = await fetch(`${this.API_URL}/payment/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, planId, credits }),
    });
    return this.handleResponse(response);
  }
}