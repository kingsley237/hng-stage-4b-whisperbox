'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/storage';
import Spinner from '@/components/shared/Spinner';
import Logo from '@/components/shared/Logo';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        router.replace('/chat');
      } else {
        router.replace('/login');
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Logo size={48} />
        <Spinner size={24} className="text-indigo-400" />
      </div>
    </div>
  );
}