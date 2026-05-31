"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Auth now uses httpOnly session cookies issued by the API callback.
    // This route is retained only as a safe fallback redirect target.
    router.replace('/dashboard');
  }, [router]);

  return <div className="container mx-auto py-24 text-center">Signing in…</div>;
}
