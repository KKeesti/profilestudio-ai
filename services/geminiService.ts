export class GeminiService {
  private static API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

  // Вспомогательный метод для обработки ответов сервера
  private static async handleResponse(response: Response) {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown server error' }));
      throw new Error(error.error || `Server error: ${response.status}`);
    }
    return response.json();
  }

  // Проверяет/создает пользователя в базе данных и возвращает его кредиты
  static async checkUser(email: string): Promise<{ email: string; credits: number }> {
    const response = await fetch(`${this.API_URL}/user/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return this.handleResponse(response);
  }

  // Создает Stripe checkout сессию и возвращает URL для оплаты
  static async createCheckoutSession(email: string, priceId: string, credits: number): Promise<{ id: string; url: string }> {
    const response = await fetch(`${this.API_URL}/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, priceId, credits })
    });
    return this.handleResponse(response);
  }

  // Генерирует фото через Gemini AI
  static async generateStudioPhoto(
    image: string,
    mimeType: string,
    style: string,
    aspectRatio: string,
    prompt: string,
    email: string | null
  ): Promise<string> {
    const response = await fetch(`${this.API_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mimeType, style, aspectRatio, prompt, email }),
    });
    const data = await this.handleResponse(response);
    return data.image;
  }

  // Уточняет/редактирует сгенерированное фото
  static async refinePhoto(image: string, correction: string, email: string): Promise<string> {
    const response = await fetch(`${this.API_URL}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, correction, email }),
    });
    const data = await this.handleResponse(response);
    return data.image;
  }
  // Загружает историю генераций пользователя
  static async getHistory(email: string): Promise<Array<{
    id: string;
    created_at: string;
    style_name: string;
    aspect_ratio: string;
    generated_image_url: string;
  }>> {
    const response = await fetch(`${this.API_URL}/history?email=${encodeURIComponent(email)}`);
    const data = await this.handleResponse(response);
    return data.generations;
  }
}
