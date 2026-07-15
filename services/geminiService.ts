import { PhotoStyle } from '../types';

type UserSummary = {
  credits: number;
  hasPaid?: boolean;
  email: string;
};

type HistoryItem = {
  id: string;
  created_at: string;
  style_name: string;
  aspect_ratio: string;
  generated_image_url: string;
};

export class GeminiService {
  static API_URL = '/api';

  private static async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.API_URL}${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'API Request failed');
    }
    return response.json();
  }

  static async createDeviceSession(email: string, freeTrialUsed: number): Promise<{ email: string }> {
    return this.request('/auth/device-session', {
      method: 'POST',
      body: JSON.stringify({ email, freeTrialUsed }),
    });
  }

  static async requestLoginLink(email: string): Promise<void> {
    await this.request('/auth/request-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  static async establishLoginSession(accessToken: string): Promise<{ email: string }> {
    return this.request('/auth/session', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
    });
  }

  static async getCurrentUser(): Promise<{ email: string } | null> {
    const data = await this.request('/auth/me');
    return data.email ? { email: data.email } : null;
  }

  static async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST', body: '{}' });
  }

  static async generateStudioPhoto(
    image: string,
    mimeType: string,
    style: PhotoStyle,
    aspectRatio: string,
    prompt: string = '',
  ): Promise<string> {
    const data = await this.request('/generate', {
      method: 'POST',
      body: JSON.stringify({ image, mimeType, style, aspectRatio, prompt }),
    });
    return data.imageUrl;
  }

  static async refinePhoto(image: string, prompt: string): Promise<string> {
    const data = await this.request('/refine', {
      method: 'POST',
      body: JSON.stringify({ image, prompt }),
    });
    return data.imageUrl;
  }

  static async checkUser(freeTrialUsed: number = 0): Promise<UserSummary> {
    return this.request('/user/check', {
      method: 'POST',
      body: JSON.stringify({ freeTrialUsed }),
    });
  }

  static async getHistory(): Promise<HistoryItem[]> {
    try {
      const data = await this.request('/history');
      return data.generations || [];
    } catch (error) {
      if (error instanceof Error && error.message === 'HISTORY_PREMIUM_ONLY') return [];
      throw error;
    }
  }

  static async createCheckoutSession(planId: string): Promise<{ url: string }> {
    return this.request('/payment/create-session', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
  }

  static async transcribe(audio: string, mimeType: string): Promise<string> {
    const data = await this.request('/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audio, mimeType }),
    });
    return data.text;
  }
}
