export class GeminiService {
  private static API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

  static async checkUser(email: string) {
    const res = await fetch(`${this.API_URL}/user/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return res.json();
  }

  static async createCheckoutSession(email: string, priceId: string, credits: number) {
    const res = await fetch(`${this.API_URL}/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, priceId, credits })
    });
    return res.json();
  }

  static async generateStudioPhoto(image: string, mimeType: string, style: string, aspectRatio: string, prompt: string, email: string) {
    const response = await fetch(`${this.API_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, style, prompt, email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate');
    }

    const data = await response.json();
    return data.image;
  }

  static async refinePhoto(image: string, correction: string, email: string) {
    const response = await fetch(`${this.API_URL}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, correction, email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to refine');
    }

    const data = await response.json();
    return data.image;
  }
}
