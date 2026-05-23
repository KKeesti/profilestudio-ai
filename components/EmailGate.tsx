import React, { useState } from 'react';

interface EmailGateProps {
  onUnlock: (email: string, credits: number) => void;
}

const EmailGate: React.FC<EmailGateProps> = ({ onUnlock }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();

    // Basic email validation
    if (!trimmed.includes('@') || !trimmed.includes('.') || trimmed.length < 5) {
      setError('Введите корректный email / Please enter a valid email');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/user/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!res.ok) throw new Error('Server error');

      const data = await res.json();
      localStorage.setItem('ps_email', trimmed);
      onUnlock(trimmed, data.credits ?? 5);
    } catch {
      setError('Ошибка соединения. Проверьте интернет / Connection error. Check your internet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark flex flex-col items-center justify-center p-6 font-sans">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gold/5 blur-[120px]" />
      </div>

      <div className="w-full max-w-md z-10 animate-in fade-in zoom-in-95 duration-500">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="inline-block mb-6">
            <span className="text-[10px] text-gold uppercase tracking-[0.5em] font-bold border-x border-gold/30 px-6 py-1">
              Exclusive Access
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-serif text-white tracking-tighter mb-3">
            Profile <span className="text-gold italic font-light">Studio</span>
          </h1>
          <p className="text-slate-500 text-[11px] tracking-[0.2em] uppercase">
            AI-Enhanced Portrait Generation
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 shadow-[0_0_80px_rgba(194,163,93,0.1)]">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gold/10 border border-gold/20 rounded-full flex items-center justify-center text-3xl mx-auto mb-5">
              ✉️
            </div>
            <h2 className="text-2xl font-serif text-white italic mb-2">Enter your Email</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Введите email для доступа к приложению.<br />
              Вы получите <span className="text-gold font-bold">5 бесплатных генераций</span>.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="your@email.com"
              autoFocus
              disabled={loading}
              className="w-full bg-white/5 border border-white/10 focus:border-gold rounded-2xl px-6 py-4 text-white outline-none transition-all placeholder:text-slate-600 text-center text-lg disabled:opacity-50"
            />

            {error && (
              <p className="text-red-400 text-xs text-center leading-relaxed">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-5 bg-gold text-black rounded-2xl font-black text-lg hover:bg-white transition-all active:scale-95 shadow-[0_10px_40px_rgba(194,163,93,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Checking...
                </>
              ) : (
                'Get Access →'
              )}
            </button>
          </form>

          <p className="text-slate-600 text-[10px] text-center uppercase tracking-widest mt-6 leading-relaxed">
            Email нужен для сохранения ваших портретов и доступа к генерациям.
            Мы не отправляем спам.
          </p>
        </div>

        <p className="text-center mt-6">
          <a href="/privacy-policy.html" target="_blank" className="text-slate-600 hover:text-slate-400 text-[10px] uppercase tracking-widest underline transition-colors">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
};

export default EmailGate;
