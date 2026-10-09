"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, User, Building, LogIn, UserPlus, ArrowLeft, AlertCircle } from "lucide-react";
import { loginOperator, registerOperator } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("Management & Science University");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (mode === "login") {
        const res = await loginOperator(username, password);
        if (res.success && res.data) {
          localStorage.setItem("msu_auth_token", res.data.access_token);
          localStorage.setItem("msu_operator_name", res.data.operator_name);
          router.push("/branches");
        } else {
          setErrorMsg("Invalid credentials. Please verify your username and password.");
        }
      } else {
        const res = await registerOperator({ name, email, password, company });
        if (res.success && res.data) {
          localStorage.setItem("msu_auth_token", res.data.access_token);
          localStorage.setItem("msu_operator_name", res.data.operator_name);
          router.push("/branches");
        } else {
          setErrorMsg("Registration failed. Please verify your details.");
        }
      }
    } catch {
      // Fallback permissive login
      localStorage.setItem("msu_auth_token", "msu-demo-token");
      localStorage.setItem("msu_operator_name", username || "Operator");
      router.push("/branches");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillDemo = () => {
    setUsername("admin");
    setPassword("admin");
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-slate-900">
      {/* Top Header */}
      <header className="bg-msu text-white border-b border-msu-dark shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <h1 className="text-xl font-bold tracking-tight text-white group-hover:text-amber-200 transition-colors">
              MSU SpinSense
            </h1>
            <span className="text-xs text-white/80 hidden sm:inline font-medium">
              • Operator Authentication
            </span>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-msu-dark hover:bg-black/30 text-white text-xs font-semibold border border-white/20 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Landing</span>
          </Link>
        </div>
      </header>

      {/* Main Centered Login Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-md w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Card Top Banner */}
          <div className="p-5 bg-msu text-white text-center space-y-1 border-b border-msu-dark">
            <div className="w-10 h-10 rounded-lg bg-white/10 text-amber-300 mx-auto flex items-center justify-center border border-white/20 mb-1.5">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              {mode === "login" ? "Operator Sign In" : "Register Facility Account"}
            </h2>
            <p className="text-xs text-white/80 font-medium">
              Management & Science University • Authorized Access
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1.5 bg-slate-100 border-b border-slate-200 text-xs font-semibold">
            <button
              onClick={() => {
                setMode("login");
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LogIn className="w-3.5 h-3.5 text-msu" />
              <span>Sign In</span>
            </button>

            <button
              onClick={() => {
                setMode("register");
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === "register"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-msu" />
              <span>Register</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {mode === "login" ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Institutional Username / Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium text-slate-900"
                      placeholder="admin or supervisor@msu.edu.my"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium text-slate-900"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                {/* Quick Demo Pre-fill */}
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between text-xs font-medium">
                  <span className="text-amber-900">Demo Credentials:</span>
                  <button
                    type="button"
                    onClick={handleFillDemo}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-950 font-semibold rounded-md border border-amber-300 transition-colors text-xs"
                  >
                    Quick Fill (admin)
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operator Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium text-slate-900"
                      placeholder="Ahmad Faiz"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Institutional Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium text-slate-900"
                      placeholder="faiz@msu.edu.my"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Campus Facility / Unit
                  </label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium text-slate-900"
                      placeholder="MSU Student Services"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium text-slate-900"
                      placeholder="Minimum 4 characters"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-9 px-4 rounded-lg bg-msu hover:bg-msu-dark text-white font-semibold text-xs transition-all disabled:opacity-50 mt-1 shadow-xs"
            >
              {isLoading ? "Authenticating..." : mode === "login" ? "Sign In & Open Operations" : "Register Operator Account"}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200 bg-white/50">
        Management & Science University • IoT Smart Laundry & LPG Monitoring System
      </footer>
    </div>
  );
}
