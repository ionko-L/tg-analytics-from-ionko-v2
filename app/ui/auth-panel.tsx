"use client";

import { ArrowRight, CheckCircle, SignIn, SignOut, UserPlus, WarningCircle } from "@phosphor-icons/react";

export type AuthMode = "sign-in" | "sign-up";

export type AccountSnapshot = {
  id: string;
  email: string;
  creditsRemaining: number;
  creditsTotal: number;
};

type AuthPanelProps = {
  authMode: AuthMode;
  authEmail: string;
  authPassword: string;
  authLoading: boolean;
  authError: string | null;
  authHint: string | null;
  account: AccountSnapshot | null;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onSignOut: () => void;
};

export function AuthPanel({
  authMode,
  authEmail,
  authPassword,
  authLoading,
  authError,
  authHint,
  account,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onSignOut,
}: AuthPanelProps) {
  if (account) {
    return (
      <section className="account-panel flex flex-col gap-4 border border-white/14 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="status-pill">
              <CheckCircle className="h-4 w-4" weight="fill" />
              В аккаунте
            </span>
            <p className="truncate text-sm font-light text-[var(--body-strong)]">{account.email}</p>
          </div>
          <p className="mt-3 text-sm font-light leading-6 text-[var(--body)]">
            Повторный анализ одного и того же канала кредит не тратит.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="credit-badge">
            <span className="credit-badge__label">Кредиты</span>
            <span className="credit-badge__value">
              {account.creditsRemaining} / {account.creditsTotal}
            </span>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex min-h-11 items-center gap-2 border border-white/20 px-4 text-sm font-bold uppercase tracking-[0.12em] text-white transition hover:border-white/55 hover:bg-white/6"
          >
            <SignOut className="h-4 w-4" weight="bold" />
            Выйти
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="account-panel border border-white/14 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-white/14 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => onModeChange("sign-in")}
            className={`auth-segment ${authMode === "sign-in" ? "auth-segment--active" : ""}`}
          >
            <SignIn className="h-4 w-4" weight="bold" />
            Вход
          </button>
          <button
            type="button"
            onClick={() => onModeChange("sign-up")}
            className={`auth-segment ${authMode === "sign-up" ? "auth-segment--active" : ""}`}
          >
            <UserPlus className="h-4 w-4" weight="bold" />
            Регистрация
          </button>
        </div>

        <p className="text-xs font-light uppercase tracking-[0.18em] text-[var(--muted)]">
          7 уникальных анализов бесплатно
        </p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto]">
        <label className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Email</span>
          <input
            type="email"
            value={authEmail}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="name@email.com"
            className="min-h-12 w-full border border-white/16 bg-black/42 px-4 text-base font-light text-white outline-none transition placeholder:text-[var(--muted)] focus:border-white/60"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Пароль</span>
          <input
            type="password"
            value={authPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Минимум 6 символов"
            className="min-h-12 w-full border border-white/16 bg-black/42 px-4 text-base font-light text-white outline-none transition placeholder:text-[var(--muted)] focus:border-white/60"
          />
        </label>
        <button
          type="button"
          onClick={onSubmit}
          disabled={authLoading}
          className="inline-flex min-h-12 items-center justify-center gap-2 border border-white/24 px-5 text-sm font-bold uppercase tracking-[0.12em] text-white transition hover:border-white/60 hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowRight className="h-4 w-4" weight="bold" />
          {authLoading ? "Обработка" : authMode === "sign-up" ? "Создать" : "Войти"}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm font-light leading-6">
        {authError ? (
          <p className="inline-flex items-start gap-2 text-[var(--danger-soft)]">
            <WarningCircle className="mt-0.5 h-4 w-4 flex-none" weight="fill" />
            {authError}
          </p>
        ) : null}
        {authHint ? <p className="text-[var(--body)]">{authHint}</p> : null}
      </div>
    </section>
  );
}
