"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/");
  };

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Login</h1>
      <form onSubmit={onSubmit} className="mt-6 grid gap-3">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-[#1E6F7C] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/20"
        />
        <input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-[#1E6F7C] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/20"
        />
        <button
          type="submit"
          className="w-full rounded-full bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1E293B]"
        >
          Continue
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        No account?{" "}
        <Link href="/signup" className="text-slate-900 underline hover:no-underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
